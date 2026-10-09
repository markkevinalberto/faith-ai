import { DEFAULT_GRACE_MINUTES, transition, type DoseAction, type DoseState, type TransitionError } from '../../domain/doseStatus';
import { generateOccurrences, slotKey } from '../../domain/schedule';
import { addDays, localDateKey, localTimeKey } from '../../domain/time';
import type { DoseEvent } from '../../domain/types';
import { newId } from '../../lib/id';
import { mapDoseEvent, optText } from '../rows';
import { NotFoundError, type SqlDatabase, type SqlExecutor } from '../sql';
import { listActiveSchedules } from './medications';
import { logAudit } from './audit';

export interface SyncOptions {
  now: Date;
  timeZone: string;
  horizonDays?: number;
  lookbackDays?: number;
  graceMinutes?: number;
}

export interface SyncResult {
  inserted: number;
  retimed: number;
  removed: number;
  expired: number;
}

/**
 * Materialises dose events from active schedules for [today - lookback, today + horizon], removes
 * future untouched events that no longer match a schedule, re-times untouched events after a time
 * zone change, and marks overdue doses "unconfirmed". Never touches events a user acted on.
 */
export async function syncDoseEvents(db: SqlDatabase, profileId: string, opts: SyncOptions): Promise<SyncResult> {
  const horizon = opts.horizonDays ?? 7;
  const lookback = opts.lookbackDays ?? 1;
  const grace = opts.graceMinutes ?? DEFAULT_GRACE_MINUTES;
  const nowIso = opts.now.toISOString();
  const today = localDateKey(opts.now, opts.timeZone);
  const from = addDays(today, -lookback);
  const to = addDays(today, horizon);
  const result: SyncResult = { inserted: 0, retimed: 0, removed: 0, expired: 0 };

  await db.transaction(async (tx) => {
    const schedules = await listActiveSchedules(tx, profileId);
    const createdBySchedule = new Map(schedules.map((s) => [s.scheduleId, Date.parse(s.scheduleCreatedAt)]));
    const occurrences = generateOccurrences(
      schedules.map((s) => ({
        scheduleId: s.scheduleId,
        medicationId: s.medicationId,
        timeOfDay: s.timeOfDay,
        daysOfWeek: s.daysOfWeek,
        startDate: s.startDate,
        endDate: s.endDate,
      })),
      from,
      to,
      opts.timeZone,
      // Doses that were due before the schedule existed are not invented retroactively
      // (allowing a grace period so a dose due shortly before set-up can still be recorded).
    ).filter((o) => Date.parse(o.scheduledFor) >= (createdBySchedule.get(o.scheduleId) ?? 0) - grace * 60_000);

    const existing = (
      await tx.getAllAsync<Record<string, unknown>>(
        'SELECT * FROM medication_events WHERE profile_id = ? AND schedule_id IS NOT NULL AND local_date BETWEEN ? AND ?',
        [profileId, from, to],
      )
    ).map(mapDoseEvent);
    const bySlot = new Map(existing.map((e) => [slotKey({ scheduleId: e.scheduleId as string, localDate: e.localDate, localTime: e.localTime }), e]));
    const wanted = new Set<string>();

    for (const o of occurrences) {
      const key = slotKey(o);
      wanted.add(key);
      const e = bySlot.get(key);
      if (!e) {
        await tx.runAsync(
          `INSERT INTO medication_events (id, profile_id, medication_id, schedule_id, scheduled_for, local_date, local_time, timezone, status,
            status_changed_at, status_actor, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'upcoming', ?, 'system', ?, ?)`,
          [newId(), profileId, o.medicationId, o.scheduleId, o.scheduledFor, o.localDate, o.localTime, o.timezone, nowIso, nowIso, nowIso],
        );
        result.inserted++;
      } else if (e.status === 'upcoming' && e.statusActor === 'system' && e.scheduledFor !== o.scheduledFor && o.scheduledFor > nowIso) {
        await tx.runAsync('UPDATE medication_events SET scheduled_for = ?, timezone = ?, updated_at = ? WHERE id = ?', [
          o.scheduledFor,
          o.timezone,
          nowIso,
          e.id,
        ]);
        result.retimed++;
      }
    }

    for (const e of existing) {
      const key = slotKey({ scheduleId: e.scheduleId as string, localDate: e.localDate, localTime: e.localTime });
      if (!wanted.has(key) && e.status === 'upcoming' && e.statusActor === 'system' && e.scheduledFor > nowIso) {
        await tx.runAsync('DELETE FROM medication_events WHERE id = ? AND profile_id = ?', [e.id, profileId]);
        result.removed++;
      }
    }

    const pending = (
      await tx.getAllAsync<Record<string, unknown>>(
        "SELECT * FROM medication_events WHERE profile_id = ? AND status IN ('upcoming','snoozed') AND scheduled_for < ?",
        [profileId, nowIso],
      )
    ).map(mapDoseEvent);
    for (const e of pending) {
      const r = transition(toState(e), { type: 'expire', at: nowIso }, 'system', grace);
      if (r.ok) {
        await tx.runAsync(
          "UPDATE medication_events SET status = 'unconfirmed', status_actor = 'system', status_changed_at = ?, snoozed_until = NULL, updated_at = ? WHERE id = ?",
          [nowIso, nowIso, e.id],
        );
        result.expired++;
      }
    }
  });
  return result;
}

function toState(e: DoseEvent): DoseState {
  return {
    status: e.status,
    scheduledFor: e.scheduledFor,
    snoozedUntil: e.snoozedUntil,
    takenAt: e.takenAt,
    statusChangedAt: e.statusChangedAt,
    statusActor: e.statusActor,
  };
}

export class DoseActionError extends Error {
  constructor(public readonly code: TransitionError) {
    super(DOSE_ERROR_MESSAGES[code]);
    this.name = 'DoseActionError';
  }
}

export const DOSE_ERROR_MESSAGES: Record<TransitionError, string> = {
  forbidden_actor: 'Only you can record what happened with a dose.',
  invalid_from_status: 'This dose has already been recorded. Undo it first to change it.',
  too_early: 'This dose is not due yet.',
  not_due: 'This dose is not overdue yet.',
  invalid_snooze: 'Choose a snooze between 5 minutes and 4 hours.',
  invalid_taken_time: 'The time taken cannot be in the future.',
};

/** Applies a user decision (taken / skipped / snoozed / undo) to a dose event. */
export async function applyDoseAction(
  db: SqlDatabase,
  profileId: string,
  eventId: string,
  action: Exclude<DoseAction, { type: 'expire' }>,
  graceMinutes = DEFAULT_GRACE_MINUTES,
): Promise<DoseEvent> {
  return db.transaction(async (tx) => {
    const row = await tx.getFirstAsync<Record<string, unknown>>('SELECT * FROM medication_events WHERE id = ? AND profile_id = ?', [eventId, profileId]);
    if (!row) throw new NotFoundError('Dose');
    const e = mapDoseEvent(row);
    const r = transition(toState(e), action, 'user', graceMinutes);
    if (!r.ok) throw new DoseActionError(r.error);
    const n = r.next;
    await tx.runAsync(
      'UPDATE medication_events SET status = ?, status_actor = ?, status_changed_at = ?, snoozed_until = ?, taken_at = ?, updated_at = ? WHERE id = ? AND profile_id = ?',
      [n.status, n.statusActor, n.statusChangedAt, n.snoozedUntil, n.takenAt, action.at, eventId, profileId],
    );
    await logAudit(tx, {
      profileId,
      action: 'status_change',
      entityType: 'medication_event',
      entityId: eventId,
      detail: `status: ${e.status}→${n.status}`,
      at: action.at,
    });
    return { ...e, ...n };
  });
}

/** Records an as-needed (PRN) or unscheduled dose the user says they took. */
export async function logUnscheduledDose(
  db: SqlDatabase,
  profileId: string,
  medicationId: string,
  takenAt: string,
  timeZone: string,
  note?: string | null,
  now = new Date().toISOString(),
): Promise<string> {
  if (Date.parse(takenAt) > Date.parse(now) + 60_000) throw new DoseActionError('invalid_taken_time');
  const id = newId();
  await db.transaction(async (tx) => {
    const med = await tx.getFirstAsync<{ id: string }>('SELECT id FROM medications WHERE id = ? AND profile_id = ?', [medicationId, profileId]);
    if (!med) throw new NotFoundError('Medication');
    await tx.runAsync(
      `INSERT INTO medication_events (id, profile_id, medication_id, schedule_id, scheduled_for, local_date, local_time, timezone, status,
        status_changed_at, status_actor, taken_at, note, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 'taken', ?, 'user', ?, ?, ?, ?)`,
      [id, profileId, medicationId, takenAt, localDateKey(new Date(takenAt), timeZone), localTimeKey(new Date(takenAt), timeZone), timeZone, now, takenAt, optText(note), now, now],
    );
    await logAudit(tx, { profileId, action: 'create', entityType: 'medication_event', entityId: id, detail: 'unscheduled dose', at: now });
  });
  return id;
}

export interface DoseEventWithMedication extends DoseEvent {
  medicationName: string;
  strength: string | null;
  doseInstructions: string;
  doseLabel: string | null;
}

const EVENT_JOIN = `SELECT e.*, m.name AS medication_name, m.strength AS strength, m.dose_instructions AS dose_instructions, s.dose_label AS dose_label
  FROM medication_events e
  JOIN medications m ON m.id = e.medication_id AND m.profile_id = e.profile_id
  LEFT JOIN medication_schedules s ON s.id = e.schedule_id AND s.profile_id = e.profile_id`;

function mapJoined(r: Record<string, unknown>): DoseEventWithMedication {
  return {
    ...mapDoseEvent(r),
    medicationName: r.medication_name as string,
    strength: (r.strength as string | null) ?? null,
    doseInstructions: (r.dose_instructions as string) ?? '',
    doseLabel: (r.dose_label as string | null) ?? null,
  };
}

export async function getDoseEvent(db: SqlExecutor, profileId: string, eventId: string): Promise<DoseEventWithMedication | null> {
  const r = await db.getFirstAsync<Record<string, unknown>>(`${EVENT_JOIN} WHERE e.profile_id = ? AND e.id = ?`, [profileId, eventId]);
  return r ? mapJoined(r) : null;
}

export async function listEventsForLocalDate(db: SqlExecutor, profileId: string, localDate: string): Promise<DoseEventWithMedication[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(`${EVENT_JOIN} WHERE e.profile_id = ? AND e.local_date = ? ORDER BY e.scheduled_for`, [
    profileId,
    localDate,
  ]);
  return rows.map(mapJoined);
}

export async function listEventsBetween(db: SqlExecutor, profileId: string, fromIso: string, toIso: string): Promise<DoseEventWithMedication[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `${EVENT_JOIN} WHERE e.profile_id = ? AND e.scheduled_for >= ? AND e.scheduled_for < ? ORDER BY e.scheduled_for`,
    [profileId, fromIso, toIso],
  );
  return rows.map(mapJoined);
}

export async function listMedicationHistory(db: SqlExecutor, profileId: string, medicationId: string, beforeIso: string, limit = 60): Promise<DoseEventWithMedication[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `${EVENT_JOIN} WHERE e.profile_id = ? AND e.medication_id = ? AND e.scheduled_for <= ? ORDER BY e.scheduled_for DESC LIMIT ?`,
    [profileId, medicationId, beforeIso, limit],
  );
  return rows.map(mapJoined);
}

/** Next dose that still needs action (upcoming or snoozed), across all medications. */
export async function nextPendingDose(db: SqlExecutor, profileId: string, nowIso: string): Promise<DoseEventWithMedication | null> {
  const r = await db.getFirstAsync<Record<string, unknown>>(
    `${EVENT_JOIN} WHERE e.profile_id = ? AND e.status IN ('upcoming','snoozed') AND COALESCE(e.snoozed_until, e.scheduled_for) >= ?
      ORDER BY COALESCE(e.snoozed_until, e.scheduled_for) LIMIT 1`,
    [profileId, new Date(Date.parse(nowIso) - DEFAULT_GRACE_MINUTES * 60_000).toISOString()],
  );
  return r ? mapJoined(r) : null;
}

export async function countTakenSince(db: SqlExecutor, profileId: string, medicationId: string, sinceIso: string): Promise<number> {
  const r = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM medication_events WHERE profile_id = ? AND medication_id = ? AND status = 'taken' AND taken_at >= ?",
    [profileId, medicationId, sinceIso],
  );
  return r?.n ?? 0;
}
