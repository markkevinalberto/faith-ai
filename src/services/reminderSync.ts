/**
 * Keeps OS notifications in sync with the database:
 *   1. materialise dose events for each profile (rolling window),
 *   2. build the desired reminder set from events, appointments, lab tests and refills,
 *   3. diff against what the OS has scheduled (planReconciliation) and apply,
 *   4. mirror the result into reminder_jobs.
 * Pure TypeScript with an injected Notifier, so it is integration-tested without a device.
 */
import { listLabTests, listUpcomingAppointments } from '../db/repo/care';
import { countTakenSince, listEventsBetween, syncDoseEvents } from '../db/repo/doseEvents';
import { listMedications } from '../db/repo/medications';
import { listProfiles } from '../db/repo/profiles';
import { pruneJobs, recordFailed, recordScheduled } from '../db/repo/reminderJobs';
import type { SqlDatabase } from '../db/sql';
import { reminderTime } from '../domain/doseStatus';
import {
  REMINDER_WINDOW_DAYS,
  appointmentReminder,
  doseReminder,
  labReminder,
  planReconciliation,
  refillReminder,
  windowRefreshReminder,
  type DesiredReminder,
  type ScheduledNotificationInfo,
} from '../domain/reminders';
import { averageDailyDoses } from '../domain/schedule';
import { estimateSupply, refillReminderDate } from '../domain/supply';
import { addDays, formatDateTime, localDateKey, zonedWallTimeToInstant } from '../domain/time';

export type PermissionState = 'granted' | 'denied' | 'undetermined';

export interface Notifier {
  isSupported(): boolean;
  permission(): Promise<PermissionState>;
  listScheduled(): Promise<ScheduledNotificationInfo[]>;
  schedule(r: DesiredReminder): Promise<string>;
  cancel(identifier: string): Promise<void>;
}

export interface ReminderSyncReport {
  permission: PermissionState | 'unsupported';
  scheduled: number;
  cancelled: number;
  kept: number;
  failed: number;
  dropped: number;
}

const DAY = 86_400_000;

export async function buildDesiredReminders(db: SqlDatabase, now: Date, timeZone: string): Promise<DesiredReminder[]> {
  const profiles = (await listProfiles(db)).filter((p) => !p.isDemo && p.remindersEnabled);
  const multi = profiles.length > 1;
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_DAYS * DAY).toISOString();
  const desired: DesiredReminder[] = [];

  for (const p of profiles) {
    await syncDoseEvents(db, p.id, { now, timeZone, horizonDays: REMINDER_WINDOW_DAYS });
    const events = await listEventsBetween(db, p.id, new Date(now.getTime() - DAY).toISOString(), windowEnd);
    for (const e of events) {
      const fireAt = reminderTime(e);
      if (!fireAt || fireAt > windowEnd) continue;
      desired.push(
        doseReminder({
          eventId: e.id,
          profileId: p.id,
          profileName: p.displayName,
          medicationName: e.medicationName,
          strength: e.strength,
          doseLabel: e.doseLabel,
          fireAt,
          privacy: p.reminderPrivacy,
          showProfileName: multi,
        }),
      );
    }

    for (const a of await listUpcomingAppointments(db, p.id, now.toISOString(), 10)) {
      if (a.reminderMinutesBefore === null) continue;
      desired.push(
        appointmentReminder({
          appointmentId: a.id,
          profileId: p.id,
          title: multi ? `${p.displayName}: ${a.title}` : a.title,
          startsAt: a.startsAt,
          minutesBefore: a.reminderMinutesBefore,
          privacy: p.reminderPrivacy,
          startsLabel: formatDateTime(a.startsAt, timeZone, p.locale, { weekday: 'short', hour: 'numeric', minute: '2-digit' }),
        }),
      );
    }

    for (const t of await listLabTests(db, p.id)) {
      if (t.status !== 'scheduled' || !t.scheduledAt || t.reminderMinutesBefore === null || t.scheduledAt < now.toISOString()) continue;
      desired.push(
        labReminder({
          labTestId: t.id,
          profileId: p.id,
          name: t.name,
          scheduledAt: t.scheduledAt,
          minutesBefore: t.reminderMinutesBefore,
          fastingRequired: t.fastingRequired,
          privacy: p.reminderPrivacy,
          startsLabel: formatDateTime(t.scheduledAt, timeZone, p.locale, { weekday: 'short', hour: 'numeric', minute: '2-digit' }),
        }),
      );
    }

    for (const { medication: m, schedules } of await listMedications(db, p.id)) {
      if (m.status !== 'active') continue;
      let estimate = null;
      if (m.refillSupplyCount !== null && m.refillUnitsPerDose !== null && m.supplyUpdatedAt) {
        const taken = await countTakenSince(db, p.id, m.id, m.supplyUpdatedAt);
        estimate = estimateSupply({ supplyCount: m.refillSupplyCount, unitsPerDose: m.refillUnitsPerDose, takenSinceUpdate: taken, averageDailyDoses: averageDailyDoses(schedules) });
      }
      const date = refillReminderDate({ explicitDate: m.refillReminderDate, estimate, thresholdDays: m.refillThresholdDays, now, timeZone });
      if (!date) continue;
      const today = localDateKey(now, timeZone);
      let fire = zonedWallTimeToInstant(date < today ? today : date, '09:00', timeZone).instant;
      if (fire.getTime() <= now.getTime()) fire = zonedWallTimeToInstant(addDays(today, 1), '09:00', timeZone).instant;
      desired.push(refillReminder({ medicationId: m.id, profileId: p.id, medicationName: m.name, fireAt: fire.toISOString(), privacy: p.reminderPrivacy }));
    }
  }

  if (desired.some((d) => d.kind === 'dose')) {
    const lastDay = addDays(localDateKey(now, timeZone), REMINDER_WINDOW_DAYS - 1);
    desired.push(windowRefreshReminder(zonedWallTimeToInstant(lastDay, '19:00', timeZone).instant.toISOString()));
  }
  return desired;
}

let running: Promise<ReminderSyncReport> | null = null;
let rerun = false;

/** Serialised: overlapping calls coalesce into one follow-up run. */
export function syncReminders(db: SqlDatabase, notifier: Notifier, opts: { now?: () => Date; timeZone: string }): Promise<ReminderSyncReport> {
  if (running) {
    rerun = true;
    return running;
  }
  running = (async () => {
    let report: ReminderSyncReport;
    do {
      rerun = false;
      report = await runOnce(db, notifier, opts.now ? opts.now() : new Date(), opts.timeZone);
    } while (rerun);
    return report;
  })().finally(() => {
    running = null;
  });
  return running;
}

async function runOnce(db: SqlDatabase, notifier: Notifier, now: Date, timeZone: string): Promise<ReminderSyncReport> {
  const desired = await buildDesiredReminders(db, now, timeZone);
  if (!notifier.isSupported()) return { permission: 'unsupported', scheduled: 0, cancelled: 0, kept: 0, failed: 0, dropped: desired.length };
  const permission = await notifier.permission();
  const scheduled = await notifier.listScheduled();
  const plan = planReconciliation({ desired: permission === 'granted' ? desired : [], scheduled, now });

  for (const id of plan.toCancel) {
    try {
      await notifier.cancel(id);
    } catch {
      // Already gone — fine.
    }
  }
  const cancelledIds = new Set(plan.toCancel);
  const toSchedule = [...plan.toSchedule, ...plan.keep.filter((k) => cancelledIds.has(`carely.${k.jobKey}`))];
  let ok = 0;
  let failed = 0;
  const liveKeys: string[] = plan.keep.filter((k) => !cancelledIds.has(`carely.${k.jobKey}`)).map((k) => k.jobKey);
  for (const r of toSchedule) {
    try {
      const id = await notifier.schedule(r);
      await recordScheduled(db, r, id, now.toISOString());
      liveKeys.push(r.jobKey);
      ok++;
    } catch (e) {
      await recordFailed(db, r, e instanceof Error ? e.message : String(e), now.toISOString());
      liveKeys.push(r.jobKey);
      failed++;
    }
  }
  for (const k of plan.keep) await recordScheduled(db, k, `carely.${k.jobKey}`, now.toISOString());
  await pruneJobs(db, liveKeys);
  return { permission, scheduled: ok, cancelled: plan.toCancel.length, kept: plan.keep.length, failed, dropped: plan.dropped.length };
}
