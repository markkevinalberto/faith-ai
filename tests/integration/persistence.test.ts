import {
  addLabResult,
  createAppointment,
  createLabTest,
  listAppointments,
  listLabResults,
  listLabTests,
  listUpcomingAppointments,
  setAppointmentStatus,
  setLabStatus,
} from '@/db/repo/care';
import {
  DoseActionError,
  applyDoseAction,
  listEventsBetween,
  listEventsForLocalDate,
  logUnscheduledDose,
  nextPendingDose,
  syncDoseEvents,
} from '@/db/repo/doseEvents';
import { getMedication, listMedications, setMedicationStatus, updateMedication } from '@/db/repo/medications';
import { SETTINGS, getProfile, getSetting, listProfiles, setSetting, updateProfile, upsertTarget, listTargets } from '@/db/repo/profiles';
import { addCustomType, addReading, latestReadings, listReadings } from '@/db/repo/vitals';
import type { SqlDatabase } from '@/db/sql';
import { glucoseToMgdl } from '@/domain/units';
import { makeMedication, makeProfile } from './helpers/fixtures';
import { createMigratedDatabase } from './helpers/nodeDb';

let db: SqlDatabase;
beforeEach(async () => {
  db = await createMigratedDatabase();
});
afterEach(async () => {
  await db.close();
});

const NOW = new Date('2026-10-09T07:00:00.000Z');

describe('profiles and settings', () => {
  it('persists and updates a profile', async () => {
    const p = await makeProfile(db);
    expect((await getProfile(db, p.id))?.displayName).toBe('Test Person A');
    await updateProfile(db, p.id, { ...p, displayName: 'Renamed', glucoseUnit: 'mmol/L', emergencyNumber: '112' });
    const after = await getProfile(db, p.id);
    expect(after?.glucoseUnit).toBe('mmol/L');
    expect(after?.emergencyNumber).toBe('112');
    expect(await listProfiles(db)).toHaveLength(1);
  });

  it('stores key/value settings', async () => {
    await setSetting(db, SETTINGS.activeProfileId, 'abc');
    expect(await getSetting(db, SETTINGS.activeProfileId)).toBe('abc');
    await setSetting(db, SETTINGS.activeProfileId, null);
    expect(await getSetting(db, SETTINGS.activeProfileId)).toBeNull();
  });

  it('stores clinician targets with their source', async () => {
    const p = await makeProfile(db);
    await upsertTarget(db, p.id, { metric: 'glucose_fasting', low: 90, high: 140, unit: 'mg/dL', setBy: 'Dr. Example', setOn: '2026-08-12' });
    await upsertTarget(db, p.id, { metric: 'glucose_fasting', low: 80, high: 130, unit: 'mg/dL', setBy: 'Dr. Example' });
    const targets = await listTargets(db, p.id);
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({ low: 80, high: 130, setBy: 'Dr. Example' });
  });
});

describe('medications and dose events', () => {
  it('materialises dose events, expires overdue ones and is idempotent', async () => {
    const p = await makeProfile(db);
    await makeMedication(db, p.id, { schedules: [{ timeOfDay: '08:00', daysOfWeek: [] }, { timeOfDay: '20:00', daysOfWeek: [] }] });
    const first = await syncDoseEvents(db, p.id, { now: NOW, timeZone: 'UTC' });
    // 2026-10-08 … 2026-10-16 = 9 days × 2 doses
    expect(first.inserted).toBe(18);
    expect(first.expired).toBe(2); // yesterday's doses passed their grace window
    const again = await syncDoseEvents(db, p.id, { now: NOW, timeZone: 'UTC' });
    expect(again).toEqual({ inserted: 0, retimed: 0, removed: 0, expired: 0 });

    const yesterday = await listEventsForLocalDate(db, p.id, '2026-10-08');
    expect(yesterday.map((e) => e.status)).toEqual(['unconfirmed', 'unconfirmed']);
    expect(yesterday.every((e) => e.statusActor === 'system')).toBe(true);
  });

  it('never marks doses as taken automatically', async () => {
    const p = await makeProfile(db);
    await makeMedication(db, p.id);
    await syncDoseEvents(db, p.id, { now: new Date('2026-10-20T12:00:00Z'), timeZone: 'UTC', lookbackDays: 30 });
    const taken = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM medication_events WHERE status = 'taken'");
    expect(taken?.n).toBe(0);
    // And the database itself rejects a system-actor "taken".
    const anyEvent = await db.getFirstAsync<{ id: string }>('SELECT id FROM medication_events LIMIT 1');
    await expect(
      db.runAsync("UPDATE medication_events SET status = 'taken', taken_at = '2026-10-20T08:00:00Z', status_actor = 'system' WHERE id = ?", [anyEvent!.id]),
    ).rejects.toThrow(/CHECK/);
  });

  it('records user actions and rejects invalid ones', async () => {
    const p = await makeProfile(db);
    await makeMedication(db, p.id);
    await syncDoseEvents(db, p.id, { now: NOW, timeZone: 'UTC' });
    const [today] = await listEventsForLocalDate(db, p.id, '2026-10-09');
    const taken = await applyDoseAction(db, p.id, today.id, { type: 'take', at: '2026-10-09T08:05:00.000Z' });
    expect(taken.status).toBe('taken');
    await expect(applyDoseAction(db, p.id, today.id, { type: 'skip', at: '2026-10-09T08:06:00.000Z' })).rejects.toBeInstanceOf(DoseActionError);
    const undone = await applyDoseAction(db, p.id, today.id, { type: 'undo', at: '2026-10-09T08:07:00.000Z' });
    expect(undone.status).toBe('upcoming');
    const snoozed = await applyDoseAction(db, p.id, today.id, { type: 'snooze', at: '2026-10-09T08:08:00.000Z', minutes: 15 });
    expect(snoozed.snoozedUntil).toBe('2026-10-09T08:23:00.000Z');
    const next = await nextPendingDose(db, p.id, '2026-10-09T08:09:00.000Z');
    expect(next?.id).toBe(today.id);
    expect(next?.medicationName).toBe('Testamine');
  });

  it('regenerates future doses when a schedule changes but keeps history', async () => {
    const p = await makeProfile(db);
    const medId = await makeMedication(db, p.id, { schedules: [{ timeOfDay: '08:00', daysOfWeek: [] }, { timeOfDay: '20:00', daysOfWeek: [] }] });
    await syncDoseEvents(db, p.id, { now: NOW, timeZone: 'UTC' });
    const [today8] = await listEventsForLocalDate(db, p.id, '2026-10-09');
    await applyDoseAction(db, p.id, today8.id, { type: 'take', at: '2026-10-09T08:01:00.000Z' });

    const med = await getMedication(db, p.id, medId);
    await updateMedication(
      db,
      p.id,
      medId,
      { ...med!.medication, schedules: [{ timeOfDay: '08:00', daysOfWeek: [] }, { timeOfDay: '21:00', daysOfWeek: [] }] },
      '2026-10-09T08:30:00.000Z',
    );
    const res = await syncDoseEvents(db, p.id, { now: new Date('2026-10-09T08:30:00.000Z'), timeZone: 'UTC' });
    expect(res.removed).toBe(8); // 20:00 doses from 10-09 to 10-16
    expect(res.inserted).toBe(8); // 21:00 doses from 10-09 to 10-16 (none invented before the change)

    const day = await listEventsForLocalDate(db, p.id, '2026-10-09');
    expect(day.map((e) => `${e.localTime}:${e.status}`)).toEqual(['08:00:taken', '21:00:upcoming']);
    const yesterday = await listEventsForLocalDate(db, p.id, '2026-10-08');
    expect(yesterday.map((e) => e.localTime)).toEqual(['08:00', '20:00']); // history preserved
  });

  it('removes future doses when a medication is paused', async () => {
    const p = await makeProfile(db);
    const medId = await makeMedication(db, p.id);
    await syncDoseEvents(db, p.id, { now: NOW, timeZone: 'UTC' });
    await setMedicationStatus(db, p.id, medId, 'paused');
    const res = await syncDoseEvents(db, p.id, { now: NOW, timeZone: 'UTC' });
    expect(res.removed).toBe(8);
    const future = await listEventsBetween(db, p.id, NOW.toISOString(), '2026-12-31T00:00:00Z');
    expect(future).toHaveLength(0);
  });

  it('re-times untouched future doses after a time zone change', async () => {
    const p = await makeProfile(db);
    await makeMedication(db, p.id);
    await syncDoseEvents(db, p.id, { now: NOW, timeZone: 'UTC' });
    const res = await syncDoseEvents(db, p.id, { now: NOW, timeZone: 'Asia/Manila' });
    expect(res.retimed).toBeGreaterThan(0);
    const [tomorrow] = await listEventsForLocalDate(db, p.id, '2026-10-10');
    expect(tomorrow.scheduledFor).toBe('2026-10-10T00:00:00.000Z'); // 08:00 in Manila
    expect(tomorrow.timezone).toBe('Asia/Manila');
  });

  it('logs as-needed doses as user-taken events', async () => {
    const p = await makeProfile(db);
    const medId = await makeMedication(db, p.id, { asNeeded: true, schedules: [] });
    expect((await listMedications(db, p.id))[0].schedules).toHaveLength(0);
    await logUnscheduledDose(db, p.id, medId, '2026-10-09T06:00:00.000Z', 'UTC', 'headache', NOW.toISOString());
    const events = await listEventsForLocalDate(db, p.id, '2026-10-09');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ status: 'taken', statusActor: 'user', scheduleId: null });
    await expect(logUnscheduledDose(db, p.id, medId, '2026-10-10T06:00:00.000Z', 'UTC', null, NOW.toISOString())).rejects.toBeInstanceOf(DoseActionError);
  });
});

describe('vitals', () => {
  it('stores readings with units, canonical values and time zone context', async () => {
    const p = await makeProfile(db, 'Test Person A', 'America/New_York');
    await addReading(db, p.id, {
      type: 'glucose',
      value: 7.0,
      unit: 'mmol/L',
      valueCanonical: glucoseToMgdl(7.0, 'mmol/L'),
      measuredAt: '2026-10-09T11:30:00.000Z',
      timezone: 'America/New_York',
      context: 'fasting',
    });
    await addReading(db, p.id, { type: 'blood_pressure', unit: 'mmHg', systolic: 128, diastolic: 82, pulse: 70, measuredAt: '2026-10-09T12:00:00.000Z', timezone: 'America/New_York' });
    await addReading(db, p.id, { type: 'blood_pressure', unit: 'mmHg', systolic: 131, diastolic: 84, measuredAt: '2026-10-08T12:00:00.000Z', timezone: 'America/New_York' });
    const ctId = await addCustomType(db, p.id, 'Peak flow', 'L/min', 0);
    await addReading(db, p.id, { type: 'custom', customTypeId: ctId, value: 420, unit: 'L/min', valueCanonical: 420, measuredAt: '2026-10-09T13:00:00.000Z', timezone: 'UTC' });

    const glucose = await listReadings(db, p.id, { type: 'glucose' });
    expect(glucose[0]).toMatchObject({ value: 7, unit: 'mmol/L', utcOffsetMin: -240, context: 'fasting', source: 'manual' });
    expect(glucose[0].valueCanonical).toBeCloseTo(126.13, 2);

    const latest = await latestReadings(db, p.id);
    expect(latest.map((r) => r.type).sort()).toEqual(['blood_pressure', 'custom', 'glucose']);
    expect(latest.find((r) => r.type === 'blood_pressure')?.systolic).toBe(128);

    const inRange = await listReadings(db, p.id, { type: 'blood_pressure', fromIso: '2026-10-09T00:00:00Z', toIso: '2026-10-10T00:00:00Z' });
    expect(inRange).toHaveLength(1);
  });

  it('rejects inconsistent blood pressure rows at the database level', async () => {
    const p = await makeProfile(db);
    await expect(
      addReading(db, p.id, { type: 'blood_pressure', unit: 'mmHg', systolic: 70, diastolic: 90, measuredAt: '2026-10-09T12:00:00.000Z', timezone: 'UTC' }),
    ).rejects.toThrow(/CHECK/);
  });
});

describe('labs and appointments', () => {
  it('tracks lab tests, results and completion', async () => {
    const p = await makeProfile(db);
    const lab = await createLabTest(db, p.id, { name: 'HbA1c', scheduledAt: '2026-10-12T01:00:00.000Z', timezone: 'UTC', fastingRequired: false, preparationNotes: 'Bring lab slip' });
    await addLabResult(db, p.id, lab, { analyte: 'HbA1c', valueNum: 7.1, unit: '%', referenceText: 'Lab range printed on report', resultDate: '2026-10-12' });
    await setLabStatus(db, p.id, lab, 'completed', '2026-10-12T05:00:00.000Z');
    const tests = await listLabTests(db, p.id);
    expect(tests[0]).toMatchObject({ status: 'completed', completedAt: '2026-10-12T05:00:00.000Z' });
    expect((await listLabResults(db, p.id, lab))[0]).toMatchObject({ analyte: 'HbA1c', valueNum: 7.1 });
  });

  it('schedules, lists and cancels appointments', async () => {
    const p = await makeProfile(db);
    const id = await createAppointment(db, p.id, { title: 'Diabetes review', startsAt: '2026-10-20T02:00:00.000Z', timezone: 'UTC', reminderMinutesBefore: 60 });
    expect(await listUpcomingAppointments(db, p.id, NOW.toISOString())).toHaveLength(1);
    await setAppointmentStatus(db, p.id, id, 'cancelled');
    expect(await listUpcomingAppointments(db, p.id, NOW.toISOString())).toHaveLength(0);
    expect((await listAppointments(db, p.id))[0].status).toBe('cancelled');
  });
});
