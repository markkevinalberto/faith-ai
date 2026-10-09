/**
 * Expands medication schedules into concrete dose occurrences.
 * Times are local wall-clock times interpreted in the supplied (device) time zone.
 */
import { addDays, diffDays, toIso, weekdayOf, zonedWallTimeToInstant, type WallTimeResolution } from './time';
import type { IsoInstant, LocalDate, LocalTime } from './types';

export interface ScheduleSpec {
  scheduleId: string;
  medicationId: string;
  timeOfDay: LocalTime;
  /** 0 = Sunday … 6 = Saturday; empty array = every day. */
  daysOfWeek: number[];
  /** Medication start date (inclusive). */
  startDate: LocalDate;
  /** Medication end date (inclusive), or null for ongoing. */
  endDate: LocalDate | null;
}

export interface DoseOccurrence {
  scheduleId: string;
  medicationId: string;
  localDate: LocalDate;
  localTime: LocalTime;
  timezone: string;
  scheduledFor: IsoInstant;
  resolution: WallTimeResolution;
}

export function parseDaysOfWeek(csv: string): number[] {
  if (!csv.trim()) return [];
  const days = csv
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  return [...new Set(days)].sort((a, b) => a - b);
}

export function serializeDaysOfWeek(days: number[]): string {
  const uniq = [...new Set(days.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort((a, b) => a - b);
  return uniq.length === 7 ? '' : uniq.join(',');
}

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function describeDays(days: number[]): string {
  if (days.length === 0 || days.length === 7) return 'Every day';
  const set = new Set(days);
  if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return 'Weekdays';
  if (days.length === 2 && set.has(0) && set.has(6)) return 'Weekends';
  return days.map((d) => SHORT_DAYS[d]).join(', ');
}

export function occursOn(spec: ScheduleSpec, date: LocalDate): boolean {
  if (date < spec.startDate) return false;
  if (spec.endDate && date > spec.endDate) return false;
  if (spec.daysOfWeek.length === 0) return true;
  return spec.daysOfWeek.includes(weekdayOf(date));
}

/**
 * Generates occurrences for every local date in [fromDate, toDate] (inclusive), sorted by instant.
 * Deterministic: identical inputs always yield identical output.
 */
export function generateOccurrences(
  specs: ScheduleSpec[],
  fromDate: LocalDate,
  toDate: LocalDate,
  timeZone: string,
): DoseOccurrence[] {
  const span = diffDays(fromDate, toDate);
  if (span < 0) return [];
  if (span > 366) throw new Error('Occurrence window too large (max 366 days)');
  const out: DoseOccurrence[] = [];
  for (let i = 0; i <= span; i++) {
    const date = addDays(fromDate, i);
    for (const spec of specs) {
      if (!occursOn(spec, date)) continue;
      const { instant, resolution } = zonedWallTimeToInstant(date, spec.timeOfDay, timeZone);
      out.push({
        scheduleId: spec.scheduleId,
        medicationId: spec.medicationId,
        localDate: date,
        localTime: spec.timeOfDay,
        timezone: timeZone,
        scheduledFor: toIso(instant),
        resolution,
      });
    }
  }
  return out.sort((a, b) =>
    a.scheduledFor === b.scheduledFor ? a.scheduleId.localeCompare(b.scheduleId) : a.scheduledFor < b.scheduledFor ? -1 : 1,
  );
}

/** Stable identity of an occurrence slot (used to match DB rows with generated occurrences). */
export function slotKey(o: { scheduleId: string; localDate: LocalDate; localTime: LocalTime }): string {
  return `${o.scheduleId}|${o.localDate}|${o.localTime}`;
}

/** Number of scheduled doses per day, averaged over a week (for supply estimates). */
export function averageDailyDoses(schedules: { daysOfWeek: number[] }[]): number {
  let perWeek = 0;
  for (const s of schedules) perWeek += s.daysOfWeek.length === 0 ? 7 : s.daysOfWeek.length;
  return perWeek / 7;
}
