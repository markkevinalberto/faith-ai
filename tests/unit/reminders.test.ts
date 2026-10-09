import {
  doseReminder,
  fnv1a,
  makeReminder,
  notificationIdFor,
  planReconciliation,
  type DesiredReminder,
  type ScheduledNotificationInfo,
} from '@/domain/reminders';

const now = new Date('2026-10-09T08:00:00Z');

function desired(key: string, fireAt: string, title = 'Reminder'): DesiredReminder {
  return makeReminder({ jobKey: key, kind: 'dose', profileId: 'p1', entityId: key, fireAt, title, body: 'b', categoryId: null });
}

function scheduledFrom(d: DesiredReminder): ScheduledNotificationInfo {
  return { identifier: notificationIdFor(d.jobKey), jobKey: d.jobKey, contentHash: d.contentHash };
}

describe('planReconciliation', () => {
  it('schedules everything when nothing is scheduled', () => {
    const d = [desired('dose:a', '2026-10-09T09:00:00.000Z'), desired('dose:b', '2026-10-09T10:00:00.000Z')];
    const plan = planReconciliation({ desired: d, scheduled: [], now });
    expect(plan.toSchedule.map((x) => x.jobKey)).toEqual(['dose:a', 'dose:b']);
    expect(plan.toCancel).toEqual([]);
  });

  it('keeps reminders that are already scheduled with the same content', () => {
    const d = [desired('dose:a', '2026-10-09T09:00:00.000Z')];
    const plan = planReconciliation({ desired: d, scheduled: d.map(scheduledFrom), now });
    expect(plan.toSchedule).toEqual([]);
    expect(plan.toCancel).toEqual([]);
    expect(plan.keep).toHaveLength(1);
  });

  it('reschedules when the time or text changed', () => {
    const old = desired('dose:a', '2026-10-09T09:00:00.000Z');
    const moved = desired('dose:a', '2026-10-09T09:30:00.000Z');
    const plan = planReconciliation({ desired: [moved], scheduled: [scheduledFrom(old)], now });
    expect(plan.toCancel).toEqual([notificationIdFor('dose:a')]);
    expect(plan.toSchedule.map((x) => x.fireAt)).toEqual(['2026-10-09T09:30:00.000Z']);
  });

  it('cancels reminders no longer wanted (e.g. dose taken, medication deleted) and unknown ones', () => {
    const gone = desired('dose:gone', '2026-10-09T09:00:00.000Z');
    const plan = planReconciliation({
      desired: [],
      scheduled: [scheduledFrom(gone), { identifier: 'legacy-1', jobKey: null, contentHash: null }],
      now,
    });
    expect(plan.toCancel.sort()).toEqual([notificationIdFor('dose:gone'), 'legacy-1'].sort());
  });

  it('drops reminders in the past', () => {
    const plan = planReconciliation({ desired: [desired('dose:past', '2026-10-09T07:59:00.000Z')], scheduled: [], now });
    expect(plan.toSchedule).toEqual([]);
    expect(plan.dropped.map((x) => x.jobKey)).toEqual(['dose:past']);
  });

  it('enforces the budget, keeping the earliest reminders', () => {
    const d = Array.from({ length: 5 }, (_, i) => desired(`dose:${i}`, new Date(now.getTime() + (5 - i) * 3_600_000).toISOString()));
    const plan = planReconciliation({ desired: d, scheduled: [], now, maxScheduled: 2 });
    expect(plan.toSchedule.map((x) => x.jobKey)).toEqual(['dose:4', 'dose:3']);
    expect(plan.dropped).toHaveLength(3);
  });

  it('cancels duplicate OS notifications for the same job', () => {
    const d = desired('dose:a', '2026-10-09T09:00:00.000Z');
    const plan = planReconciliation({ desired: [d], scheduled: [scheduledFrom(d), scheduledFrom(d)], now });
    expect(plan.keep).toHaveLength(1);
    expect(plan.toCancel).toEqual([notificationIdFor('dose:a')]);
    // Note: the cancelled id equals the kept id; the service re-schedules when an id is both
    // cancelled and kept (handled by cancelling first, then scheduling `keep` items whose id was cancelled).
  });

  it('is idempotent: applying a plan and re-planning yields no work', () => {
    const d = [desired('dose:a', '2026-10-09T09:00:00.000Z'), desired('dose:b', '2026-10-09T11:00:00.000Z')];
    const first = planReconciliation({ desired: d, scheduled: [], now });
    const afterApply = first.toSchedule.map(scheduledFrom);
    const second = planReconciliation({ desired: d, scheduled: afterApply, now });
    expect(second.toSchedule).toEqual([]);
    expect(second.toCancel).toEqual([]);
  });
});

describe('reminder content', () => {
  it('hides the medication name when privacy is on', () => {
    const r = doseReminder({
      eventId: 'e1',
      profileId: 'p1',
      profileName: 'Sam',
      medicationName: 'Metformin',
      strength: '500 mg',
      doseLabel: '1 tablet',
      fireAt: '2026-10-09T09:00:00.000Z',
      privacy: true,
      showProfileName: false,
    });
    expect(`${r.title} ${r.body}`).not.toMatch(/Metformin/);
    expect(r.jobKey).toBe('dose:e1');
    expect(r.categoryId).toBe('dose_reminder');
  });

  it('shows details when privacy is off and prefixes the profile when needed', () => {
    const r = doseReminder({
      eventId: 'e1',
      profileId: 'p1',
      profileName: 'Sam',
      medicationName: 'Metformin',
      strength: '500 mg',
      doseLabel: '1 tablet',
      fireAt: '2026-10-09T09:00:00.000Z',
      privacy: false,
      showProfileName: true,
    });
    expect(r.title).toBe('Sam: Metformin 500 mg');
  });

  it('hashes deterministically', () => {
    expect(fnv1a('hello')).toBe(fnv1a('hello'));
    expect(fnv1a('hello')).not.toBe(fnv1a('hellp'));
    expect(fnv1a('')).toBe('811c9dc5');
  });
});
