import { createAppointment, createLabTest } from '@/db/repo/care';
import { applyDoseAction, listEventsForLocalDate } from '@/db/repo/doseEvents';
import { deleteMedication, getMedication, updateMedication } from '@/db/repo/medications';
import { updateProfile } from '@/db/repo/profiles';
import { listReminderJobs } from '@/db/repo/reminderJobs';
import type { SqlDatabase } from '@/db/sql';
import { notificationIdFor, type DesiredReminder, type ScheduledNotificationInfo } from '@/domain/reminders';
import { seedDemoProfile } from '@/services/demoSeed';
import { syncReminders, type Notifier, type PermissionState } from '@/services/reminderSync';
import { makeMedication, makeProfile } from './helpers/fixtures';
import { createMigratedDatabase } from './helpers/nodeDb';

class FakeNotifier implements Notifier {
  readonly os = new Map<string, DesiredReminder>();
  permissionState: PermissionState = 'granted';
  failNext = false;
  isSupported() {
    return true;
  }
  async permission() {
    return this.permissionState;
  }
  async listScheduled(): Promise<ScheduledNotificationInfo[]> {
    return [...this.os.entries()].map(([identifier, r]) => ({ identifier, jobKey: r.jobKey, contentHash: r.contentHash }));
  }
  async schedule(r: DesiredReminder) {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('alarm limit reached');
    }
    const id = notificationIdFor(r.jobKey);
    this.os.set(id, r);
    return id;
  }
  async cancel(id: string) {
    this.os.delete(id);
  }
  kinds() {
    return [...this.os.values()].map((r) => r.kind);
  }
}

const NOW = new Date('2026-10-09T07:00:00.000Z');
let db: SqlDatabase;
let notifier: FakeNotifier;
const sync = (now = NOW) => syncReminders(db, notifier, { now: () => now, timeZone: 'UTC' });

beforeEach(async () => {
  db = await createMigratedDatabase();
  notifier = new FakeNotifier();
});
afterEach(async () => {
  await db.close();
});

describe('reminder reconciliation', () => {
  it('schedules dose, appointment, lab, refill and window-refresh reminders and mirrors them in reminder_jobs', async () => {
    const p = await makeProfile(db);
    await makeMedication(db, p.id, {
      schedules: [{ timeOfDay: '08:00', daysOfWeek: [] }, { timeOfDay: '20:00', daysOfWeek: [] }],
      refillSupplyCount: 3,
      refillUnitsPerDose: 1,
      refillThresholdDays: 7,
    });
    await createAppointment(db, p.id, { title: 'Clinic visit', startsAt: '2026-10-12T02:00:00.000Z', timezone: 'UTC', reminderMinutesBefore: 60 });
    await createLabTest(db, p.id, { name: 'HbA1c', scheduledAt: '2026-10-11T01:00:00.000Z', timezone: 'UTC', reminderMinutesBefore: 120, fastingRequired: true });

    const report = await sync();
    expect(report.permission).toBe('granted');
    const kinds = notifier.kinds();
    expect(kinds.filter((k) => k === 'dose')).toHaveLength(14); // 08:00 + 20:00 for 7 days (today .. +6)
    expect(kinds).toEqual(expect.arrayContaining(['appointment', 'lab', 'refill', 'window_refresh']));
    const jobs = await listReminderJobs(db);
    expect(jobs.map((j) => j.notificationId).sort()).toEqual([...notifier.os.keys()].sort());
    expect(jobs.every((j) => j.status === 'scheduled')).toBe(true);
  });

  it('is idempotent', async () => {
    const p = await makeProfile(db);
    await makeMedication(db, p.id);
    await sync();
    const again = await sync();
    expect(again.scheduled).toBe(0);
    expect(again.cancelled).toBe(0);
  });

  it('cancels the reminder of a dose the user has taken', async () => {
    const p = await makeProfile(db);
    await makeMedication(db, p.id);
    await sync();
    const [today] = await listEventsForLocalDate(db, p.id, '2026-10-09');
    expect(notifier.os.has(notificationIdFor(`dose:${today.id}`))).toBe(true);
    await applyDoseAction(db, p.id, today.id, { type: 'take', at: '2026-10-09T07:30:00.000Z' });
    await sync(new Date('2026-10-09T07:31:00.000Z'));
    expect(notifier.os.has(notificationIdFor(`dose:${today.id}`))).toBe(false);
  });

  it('re-times reminders after a snooze', async () => {
    const p = await makeProfile(db);
    await makeMedication(db, p.id);
    await sync();
    const [today] = await listEventsForLocalDate(db, p.id, '2026-10-09');
    await applyDoseAction(db, p.id, today.id, { type: 'snooze', at: '2026-10-09T08:00:00.000Z', minutes: 15 });
    await sync(new Date('2026-10-09T08:00:30.000Z'));
    expect(notifier.os.get(notificationIdFor(`dose:${today.id}`))?.fireAt).toBe('2026-10-09T08:15:00.000Z');
  });

  it('replaces reminders when the schedule changes and removes them when the medication is deleted', async () => {
    const p = await makeProfile(db);
    const medId = await makeMedication(db, p.id);
    await sync();
    const before = [...notifier.os.values()].filter((r) => r.kind === 'dose').map((r) => r.fireAt);
    expect(before.every((f) => f.endsWith('T08:00:00.000Z'))).toBe(true);

    const med = await getMedication(db, p.id, medId);
    await updateMedication(db, p.id, medId, { ...med!.medication, schedules: [{ timeOfDay: '09:30', daysOfWeek: [] }] }, NOW.toISOString());
    await sync();
    const after = [...notifier.os.values()].filter((r) => r.kind === 'dose').map((r) => r.fireAt);
    expect(after.length).toBe(7);
    expect(after.every((f) => f.endsWith('T09:30:00.000Z'))).toBe(true);

    await deleteMedication(db, p.id, medId);
    await sync();
    expect(notifier.kinds().filter((k) => k === 'dose')).toHaveLength(0);
    expect(notifier.kinds()).not.toContain('window_refresh');
  });

  it('hides medication names by default (privacy) and shows them when allowed', async () => {
    const p = await makeProfile(db);
    await makeMedication(db, p.id, { name: 'Secretazol' });
    await sync();
    expect([...notifier.os.values()].some((r) => `${r.title} ${r.body}`.includes('Secretazol'))).toBe(false);
    await updateProfile(db, p.id, { ...p, reminderPrivacy: false });
    await sync();
    expect([...notifier.os.values()].some((r) => r.title.includes('Secretazol'))).toBe(true);
  });

  it('never schedules reminders for the demo profile', async () => {
    await seedDemoProfile(db, { now: NOW, timeZone: 'UTC', locale: 'en-US' });
    await sync();
    expect(notifier.os.size).toBe(0);
  });

  it('cancels everything when notification permission is not granted', async () => {
    const p = await makeProfile(db);
    await makeMedication(db, p.id);
    await sync();
    expect(notifier.os.size).toBeGreaterThan(0);
    notifier.permissionState = 'denied';
    const r = await sync();
    expect(r.permission).toBe('denied');
    expect(notifier.os.size).toBe(0);
  });

  it('records scheduling failures instead of hiding them', async () => {
    const p = await makeProfile(db);
    await makeMedication(db, p.id);
    notifier.failNext = true;
    const r = await sync();
    expect(r.failed).toBe(1);
    expect((await listReminderJobs(db)).some((j) => j.status === 'failed' && j.lastError === 'alarm limit reached')).toBe(true);
  });
});
