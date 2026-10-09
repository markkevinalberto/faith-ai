import {
  effectiveStatus,
  reminderTime,
  transition,
  type DoseState,
} from '@/domain/doseStatus';

const due = '2026-10-09T08:00:00.000Z';

function state(partial: Partial<DoseState> = {}): DoseState {
  return {
    status: 'upcoming',
    scheduledFor: due,
    snoozedUntil: null,
    takenAt: null,
    statusChangedAt: '2026-10-08T00:00:00.000Z',
    statusActor: 'system',
    ...partial,
  };
}

describe('safety invariants', () => {
  it('never lets the system mark a dose taken, skipped, snoozed or undone', () => {
    for (const action of [
      { type: 'take' as const, at: due },
      { type: 'skip' as const, at: due },
      { type: 'snooze' as const, at: due, minutes: 10 },
      { type: 'undo' as const, at: due },
    ]) {
      expect(transition(state(), action, 'system')).toEqual({ ok: false, error: 'forbidden_actor' });
    }
  });

  it('never lets a user trigger the system-only expiry', () => {
    expect(transition(state(), { type: 'expire', at: '2026-10-09T12:00:00.000Z' }, 'user')).toEqual({
      ok: false,
      error: 'forbidden_actor',
    });
  });
});

describe('user transitions', () => {
  it('takes an upcoming dose and records who and when', () => {
    const r = transition(state(), { type: 'take', at: '2026-10-09T08:05:00.000Z' }, 'user');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.next.status).toBe('taken');
      expect(r.next.takenAt).toBe('2026-10-09T08:05:00.000Z');
      expect(r.next.statusActor).toBe('user');
    }
  });

  it('allows confirming an unconfirmed dose later with the actual time taken', () => {
    const r = transition(
      state({ status: 'unconfirmed' }),
      { type: 'take', at: '2026-10-09T15:00:00.000Z', takenAt: '2026-10-09T08:10:00.000Z' },
      'user',
    );
    expect(r.ok && r.next.takenAt).toBe('2026-10-09T08:10:00.000Z');
  });

  it('rejects a taken time in the future', () => {
    const r = transition(state(), { type: 'take', at: '2026-10-09T08:00:00.000Z', takenAt: '2026-10-09T10:00:00.000Z' }, 'user');
    expect(r).toEqual({ ok: false, error: 'invalid_taken_time' });
  });

  it('rejects taking a dose far ahead of time', () => {
    expect(transition(state(), { type: 'take', at: '2026-10-08T20:00:00.000Z' }, 'user')).toEqual({
      ok: false,
      error: 'too_early',
    });
  });

  it('snoozes within bounds only, and only near the due time', () => {
    const r = transition(state(), { type: 'snooze', at: '2026-10-09T08:00:00.000Z', minutes: 15 }, 'user');
    expect(r.ok && r.next.snoozedUntil).toBe('2026-10-09T08:15:00.000Z');
    expect(transition(state(), { type: 'snooze', at: due, minutes: 1 }, 'user')).toEqual({ ok: false, error: 'invalid_snooze' });
    expect(transition(state(), { type: 'snooze', at: due, minutes: 600 }, 'user')).toEqual({ ok: false, error: 'invalid_snooze' });
    expect(transition(state(), { type: 'snooze', at: '2026-10-09T05:00:00.000Z', minutes: 10 }, 'user')).toEqual({
      ok: false,
      error: 'too_early',
    });
  });

  it('does not allow skipping or snoozing a dose already taken', () => {
    const taken = state({ status: 'taken', takenAt: due, statusActor: 'user' });
    expect(transition(taken, { type: 'skip', at: due }, 'user')).toEqual({ ok: false, error: 'invalid_from_status' });
    expect(transition(taken, { type: 'snooze', at: due, minutes: 10 }, 'user')).toEqual({ ok: false, error: 'invalid_from_status' });
  });

  it('undo returns to upcoming before the grace deadline and unconfirmed after', () => {
    const taken = state({ status: 'taken', takenAt: due, statusActor: 'user' });
    const early = transition(taken, { type: 'undo', at: '2026-10-09T08:10:00.000Z' }, 'user');
    expect(early.ok && early.next.status).toBe('upcoming');
    expect(early.ok && early.next.takenAt).toBeNull();
    const late = transition(taken, { type: 'undo', at: '2026-10-09T12:00:00.000Z' }, 'user');
    expect(late.ok && late.next.status).toBe('unconfirmed');
  });
});

describe('system expiry', () => {
  it('only expires after the grace window', () => {
    expect(transition(state(), { type: 'expire', at: '2026-10-09T08:30:00.000Z' }, 'system', 60)).toEqual({
      ok: false,
      error: 'not_due',
    });
    const r = transition(state(), { type: 'expire', at: '2026-10-09T09:01:00.000Z' }, 'system', 60);
    expect(r.ok && r.next.status).toBe('unconfirmed');
  });

  it('measures the grace window from the snooze end for snoozed doses', () => {
    const s = state({ status: 'snoozed', snoozedUntil: '2026-10-09T08:30:00.000Z' });
    expect(transition(s, { type: 'expire', at: '2026-10-09T09:15:00.000Z' }, 'system', 60).ok).toBe(false);
    expect(transition(s, { type: 'expire', at: '2026-10-09T09:31:00.000Z' }, 'system', 60).ok).toBe(true);
  });

  it('never expires taken or skipped doses', () => {
    const taken = state({ status: 'taken', takenAt: due });
    expect(transition(taken, { type: 'expire', at: '2026-10-10T00:00:00.000Z' }, 'system')).toEqual({
      ok: false,
      error: 'invalid_from_status',
    });
  });
});

describe('display helpers', () => {
  it('shows overdue doses as not confirmed without persisting', () => {
    expect(effectiveStatus(state(), new Date('2026-10-09T08:30:00Z'), 60)).toBe('upcoming');
    expect(effectiveStatus(state(), new Date('2026-10-09T09:30:00Z'), 60)).toBe('unconfirmed');
    expect(effectiveStatus(state({ status: 'taken', takenAt: due }), new Date('2026-10-10T00:00:00Z'))).toBe('taken');
  });

  it('computes reminder times', () => {
    expect(reminderTime(state())).toBe(due);
    expect(reminderTime(state({ status: 'snoozed', snoozedUntil: '2026-10-09T08:20:00.000Z' }))).toBe('2026-10-09T08:20:00.000Z');
    expect(reminderTime(state({ status: 'taken' }))).toBeNull();
  });
});
