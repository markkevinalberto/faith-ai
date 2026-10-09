/**
 * Reminder planning and reconciliation (pure). The notification service applies the plan.
 *
 * Each desired reminder has a deterministic `jobKey` (e.g. "dose:<eventId>") and a content hash.
 * The OS notification identifier is derived from the jobKey, and the jobKey + hash are stored in the
 * notification's data payload, so we can diff the OS state against the database at any time.
 */
import type { IsoInstant } from './types';

export type ReminderKind = 'dose' | 'refill' | 'appointment' | 'lab' | 'window_refresh';

export const REMINDER_WINDOW_DAYS = 7;
/** Stay well below Android's ~500 alarm limit and iOS's 64 pending-notification limit. */
export const MAX_SCHEDULED_REMINDERS = 60;

export interface DesiredReminder {
  jobKey: string;
  kind: ReminderKind;
  profileId: string | null;
  entityId: string | null;
  fireAt: IsoInstant;
  title: string;
  body: string;
  categoryId: string | null;
  contentHash: string;
}

export interface ScheduledNotificationInfo {
  identifier: string;
  jobKey: string | null;
  contentHash: string | null;
}

export interface ReconciliationPlan {
  toSchedule: DesiredReminder[];
  toCancel: string[];
  keep: DesiredReminder[];
  /** Desired reminders dropped because they are in the past or over budget. */
  dropped: DesiredReminder[];
}

export function notificationIdFor(jobKey: string): string {
  return `carely.${jobKey}`;
}

/** FNV-1a 32-bit hash; stable across JS engines. */
export function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function reminderHash(r: Pick<DesiredReminder, 'fireAt' | 'title' | 'body' | 'categoryId'>): string {
  return fnv1a(`${r.fireAt}|${r.title}|${r.body}|${r.categoryId ?? ''}`);
}

export function makeReminder(r: Omit<DesiredReminder, 'contentHash'>): DesiredReminder {
  return { ...r, contentHash: reminderHash(r) };
}

/**
 * Computes what to cancel and schedule so the OS matches `desired`.
 * - Past reminders (fireAt <= now + minLeadMs) are dropped.
 * - Only the earliest `maxScheduled` reminders are kept (budget).
 * - OS notifications that are unknown, stale (hash changed) or duplicated are cancelled.
 */
export function planReconciliation(params: {
  desired: DesiredReminder[];
  scheduled: ScheduledNotificationInfo[];
  now: Date;
  maxScheduled?: number;
  minLeadMs?: number;
}): ReconciliationPlan {
  const max = params.maxScheduled ?? MAX_SCHEDULED_REMINDERS;
  const lead = params.minLeadMs ?? 5_000;
  const cutoff = params.now.getTime() + lead;

  const dropped: DesiredReminder[] = [];
  const unique = new Map<string, DesiredReminder>();
  for (const d of params.desired) {
    if (Date.parse(d.fireAt) <= cutoff) {
      dropped.push(d);
      continue;
    }
    const existing = unique.get(d.jobKey);
    // Duplicate job keys: keep the earliest firing one.
    if (!existing || d.fireAt < existing.fireAt) {
      if (existing) dropped.push(existing);
      unique.set(d.jobKey, d);
    } else {
      dropped.push(d);
    }
  }
  const sorted = [...unique.values()].sort((a, b) => (a.fireAt === b.fireAt ? a.jobKey.localeCompare(b.jobKey) : a.fireAt < b.fireAt ? -1 : 1));
  const inBudget = sorted.slice(0, max);
  dropped.push(...sorted.slice(max));

  const wanted = new Map(inBudget.map((d) => [d.jobKey, d]));
  const toCancel: string[] = [];
  const keep: DesiredReminder[] = [];
  const satisfied = new Set<string>();

  for (const s of params.scheduled) {
    const d = s.jobKey ? wanted.get(s.jobKey) : undefined;
    if (!d || satisfied.has(d.jobKey) || s.contentHash !== d.contentHash || s.identifier !== notificationIdFor(d.jobKey)) {
      toCancel.push(s.identifier);
      continue;
    }
    satisfied.add(d.jobKey);
    keep.push(d);
  }

  const toSchedule = inBudget.filter((d) => !satisfied.has(d.jobKey));
  return { toSchedule, toCancel: [...new Set(toCancel)], keep, dropped };
}

export interface DoseReminderInput {
  eventId: string;
  profileId: string;
  profileName: string;
  medicationName: string;
  strength: string | null;
  doseLabel: string | null;
  fireAt: IsoInstant;
  /** When true, the medication name is hidden on the lock screen. */
  privacy: boolean;
  /** Prefix such as profile name, shown when several profiles exist. */
  showProfileName: boolean;
}

export function doseReminder(input: DoseReminderInput): DesiredReminder {
  const who = input.showProfileName ? `${input.profileName}: ` : '';
  const title = input.privacy ? `${who}Medication reminder` : `${who}${input.medicationName}${input.strength ? ` ${input.strength}` : ''}`;
  const body = input.privacy
    ? 'Open FAITH to see which dose is due and record it.'
    : `${input.doseLabel ? `${input.doseLabel} — ` : ''}tap to record taken, skipped or snooze.`;
  return makeReminder({
    jobKey: `dose:${input.eventId}`,
    kind: 'dose',
    profileId: input.profileId,
    entityId: input.eventId,
    fireAt: input.fireAt,
    title,
    body,
    categoryId: 'dose_reminder',
  });
}

export function appointmentReminder(input: {
  appointmentId: string;
  profileId: string;
  title: string;
  startsAt: IsoInstant;
  minutesBefore: number;
  privacy: boolean;
  startsLabel: string;
}): DesiredReminder {
  const fireAt = new Date(Date.parse(input.startsAt) - input.minutesBefore * 60_000).toISOString();
  return makeReminder({
    jobKey: `appointment:${input.appointmentId}`,
    kind: 'appointment',
    profileId: input.profileId,
    entityId: input.appointmentId,
    fireAt,
    title: input.privacy ? 'Upcoming appointment' : input.title,
    body: `Starts ${input.startsLabel}. Open FAITH for your preparation notes.`,
    categoryId: null,
  });
}

export function labReminder(input: {
  labTestId: string;
  profileId: string;
  name: string;
  scheduledAt: IsoInstant;
  minutesBefore: number;
  fastingRequired: boolean;
  privacy: boolean;
  startsLabel: string;
}): DesiredReminder {
  const fireAt = new Date(Date.parse(input.scheduledAt) - input.minutesBefore * 60_000).toISOString();
  return makeReminder({
    jobKey: `lab:${input.labTestId}`,
    kind: 'lab',
    profileId: input.profileId,
    entityId: input.labTestId,
    fireAt,
    title: input.privacy ? 'Upcoming lab test' : `Lab test: ${input.name}`,
    body: `${input.startsLabel}.${input.fastingRequired ? ' Fasting was noted for this test — check your preparation notes.' : ''}`,
    categoryId: null,
  });
}

export function refillReminder(input: {
  medicationId: string;
  profileId: string;
  medicationName: string;
  fireAt: IsoInstant;
  privacy: boolean;
}): DesiredReminder {
  return makeReminder({
    jobKey: `refill:${input.medicationId}`,
    kind: 'refill',
    profileId: input.profileId,
    entityId: input.medicationId,
    fireAt: input.fireAt,
    title: input.privacy ? 'Refill reminder' : `Refill: ${input.medicationName}`,
    body: 'Your recorded supply is running low. Contact your pharmacy or clinician about a refill.',
    categoryId: null,
  });
}

/** One reminder at the end of the scheduling window asking the user to open the app. */
export function windowRefreshReminder(fireAt: IsoInstant): DesiredReminder {
  return makeReminder({
    jobKey: 'window_refresh',
    kind: 'window_refresh',
    profileId: null,
    entityId: null,
    fireAt,
    title: 'Keep your reminders running',
    body: 'Open FAITH so it can schedule your next week of reminders.',
    categoryId: null,
  });
}
