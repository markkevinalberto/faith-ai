/**
 * Dose-event state machine.
 *
 * Safety invariants (enforced here and by DB CHECK constraints):
 *  - Only the USER can mark a dose taken, skipped or snoozed. The system can never mark a dose taken.
 *  - The system may only move an overdue upcoming/snoozed dose to "unconfirmed".
 *  - "Unconfirmed" means "we don't know" — the UI never presents it as missed medication advice,
 *    and the app never suggests doubling up.
 */
import type { DoseStatus, IsoInstant } from './types';

export const DEFAULT_GRACE_MINUTES = 60;
/** Users can confirm a dose up to this many minutes before it is due. */
export const EARLY_TAKE_WINDOW_MINUTES = 240;
export const SNOOZE_MIN_MINUTES = 5;
export const SNOOZE_MAX_MINUTES = 240;

export type DoseActor = 'user' | 'system';

export interface DoseState {
  status: DoseStatus;
  scheduledFor: IsoInstant;
  snoozedUntil: IsoInstant | null;
  takenAt: IsoInstant | null;
  statusChangedAt: IsoInstant;
  statusActor: DoseActor;
}

export type DoseAction =
  | { type: 'take'; at: IsoInstant; takenAt?: IsoInstant }
  | { type: 'skip'; at: IsoInstant }
  | { type: 'snooze'; at: IsoInstant; minutes: number }
  | { type: 'undo'; at: IsoInstant }
  | { type: 'expire'; at: IsoInstant };

export type TransitionError =
  | 'forbidden_actor'
  | 'invalid_from_status'
  | 'too_early'
  | 'not_due'
  | 'invalid_snooze'
  | 'invalid_taken_time';

export type TransitionResult = { ok: true; next: DoseState } | { ok: false; error: TransitionError };

const ms = (iso: IsoInstant) => Date.parse(iso);
const MIN = 60_000;

export function dueDeadline(state: Pick<DoseState, 'status' | 'scheduledFor' | 'snoozedUntil'>, graceMinutes: number): number {
  const base = state.status === 'snoozed' && state.snoozedUntil ? ms(state.snoozedUntil) : ms(state.scheduledFor);
  return base + graceMinutes * MIN;
}

/** Baseline status for an unresolved dose at time `at` (used by undo). */
function baselineStatus(state: DoseState, at: IsoInstant, graceMinutes: number): DoseStatus {
  return ms(at) > ms(state.scheduledFor) + graceMinutes * MIN ? 'unconfirmed' : 'upcoming';
}

export function transition(
  state: DoseState,
  action: DoseAction,
  actor: DoseActor,
  graceMinutes: number = DEFAULT_GRACE_MINUTES,
): TransitionResult {
  const fail = (error: TransitionError): TransitionResult => ({ ok: false, error });
  const base = { ...state, statusChangedAt: action.at, statusActor: actor };

  if (action.type === 'expire') {
    if (actor !== 'system') return fail('forbidden_actor');
    if (state.status !== 'upcoming' && state.status !== 'snoozed') return fail('invalid_from_status');
    if (ms(action.at) < dueDeadline(state, graceMinutes)) return fail('not_due');
    return { ok: true, next: { ...base, status: 'unconfirmed', snoozedUntil: null } };
  }

  // Every other action is a deliberate user decision.
  if (actor !== 'user') return fail('forbidden_actor');

  switch (action.type) {
    case 'take': {
      if (!['upcoming', 'snoozed', 'unconfirmed'].includes(state.status)) return fail('invalid_from_status');
      if (ms(action.at) < ms(state.scheduledFor) - EARLY_TAKE_WINDOW_MINUTES * MIN) return fail('too_early');
      const takenAt = action.takenAt ?? action.at;
      if (Number.isNaN(ms(takenAt)) || ms(takenAt) > ms(action.at) + MIN) return fail('invalid_taken_time');
      return { ok: true, next: { ...base, status: 'taken', takenAt, snoozedUntil: null } };
    }
    case 'skip': {
      if (!['upcoming', 'snoozed', 'unconfirmed'].includes(state.status)) return fail('invalid_from_status');
      return { ok: true, next: { ...base, status: 'skipped', takenAt: null, snoozedUntil: null } };
    }
    case 'snooze': {
      if (state.status !== 'upcoming' && state.status !== 'snoozed') return fail('invalid_from_status');
      if (
        !Number.isFinite(action.minutes) ||
        action.minutes < SNOOZE_MIN_MINUTES ||
        action.minutes > SNOOZE_MAX_MINUTES
      ) {
        return fail('invalid_snooze');
      }
      // Snoozing only makes sense close to the due time.
      if (ms(action.at) < ms(state.scheduledFor) - 60 * MIN) return fail('too_early');
      const until = new Date(ms(action.at) + action.minutes * MIN).toISOString();
      return { ok: true, next: { ...base, status: 'snoozed', snoozedUntil: until } };
    }
    case 'undo': {
      if (state.status !== 'taken' && state.status !== 'skipped') return fail('invalid_from_status');
      return {
        ok: true,
        next: { ...base, status: baselineStatus(state, action.at, graceMinutes), takenAt: null, snoozedUntil: null },
      };
    }
  }
}

/**
 * Status to display at `now` without persisting: an upcoming/snoozed dose past its grace window
 * reads as "unconfirmed" even before the background reconciliation writes it.
 */
export function effectiveStatus(state: DoseState, now: Date, graceMinutes: number = DEFAULT_GRACE_MINUTES): DoseStatus {
  if ((state.status === 'upcoming' || state.status === 'snoozed') && now.getTime() >= dueDeadline(state, graceMinutes)) {
    return 'unconfirmed';
  }
  return state.status;
}

/** When the reminder for this dose should fire, or null if no reminder is needed. */
export function reminderTime(state: Pick<DoseState, 'status' | 'scheduledFor' | 'snoozedUntil'>): IsoInstant | null {
  if (state.status === 'upcoming') return state.scheduledFor;
  if (state.status === 'snoozed') return state.snoozedUntil;
  return null;
}

export const DOSE_STATUS_LABEL: Record<DoseStatus, string> = {
  upcoming: 'Upcoming',
  taken: 'Taken',
  skipped: 'Skipped',
  snoozed: 'Snoozed',
  unconfirmed: 'Not confirmed',
};
