/**
 * Time-zone aware date arithmetic built on Intl (available in Hermes and Node).
 *
 * Wall-clock → instant conversion rules (documented + tested):
 *  - Non-existent local times (spring-forward gap) are shifted forward by the gap length,
 *    e.g. 02:30 on a US spring-forward day becomes 03:30 local.
 *  - Ambiguous local times (fall-back overlap) resolve to the FIRST occurrence (daylight time).
 */
import type { IsoInstant, LocalDate, LocalTime } from './types';

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = Sunday
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatterFor(timeZone);
    return true;
  } catch {
    return false;
  }
}

export function getZonedParts(instant: Date | number, timeZone: string): ZonedParts {
  const date = typeof instant === 'number' ? new Date(instant) : instant;
  const parts = formatterFor(timeZone).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const p = parts.find((x) => x.type === type);
    return p ? Number(p.value) : 0;
  };
  const year = get('year');
  const month = get('month');
  const day = get('day');
  // Some engines emit hour "24" at midnight despite h23; normalise.
  const hour = get('hour') % 24;
  return {
    year,
    month,
    day,
    hour,
    minute: get('minute'),
    second: get('second'),
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}

/** Offset of `timeZone` from UTC at `instant`, in minutes (e.g. -300 for EST). */
export function tzOffsetMinutes(instant: Date | number, timeZone: string): number {
  const ms = typeof instant === 'number' ? instant : instant.getTime();
  const flooredMs = Math.floor(ms / 1000) * 1000;
  const p = getZonedParts(flooredMs, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - flooredMs) / MINUTE_MS);
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function parseLocalDate(date: LocalDate): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`Invalid local date: ${date}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new Error(`Invalid local date: ${date}`);
  }
  return { year, month, day };
}

export function isValidLocalDate(date: string): boolean {
  try {
    parseLocalDate(date);
    return true;
  } catch {
    return false;
  }
}

export function parseLocalTime(time: LocalTime): { hour: number; minute: number } {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m) throw new Error(`Invalid local time: ${time}`);
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) throw new Error(`Invalid local time: ${time}`);
  return { hour, minute };
}

export function isValidLocalTime(time: string): boolean {
  try {
    parseLocalTime(time);
    return true;
  } catch {
    return false;
  }
}

export function formatLocalDateKey(year: number, month: number, day: number): LocalDate {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Calendar date of `instant` as seen in `timeZone`. */
export function localDateKey(instant: Date | number, timeZone: string): LocalDate {
  const p = getZonedParts(instant, timeZone);
  return formatLocalDateKey(p.year, p.month, p.day);
}

export function localTimeKey(instant: Date | number, timeZone: string): LocalTime {
  const p = getZonedParts(instant, timeZone);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const { year, month, day } = parseLocalDate(date);
  const d = new Date(Date.UTC(year, month - 1, day) + days * DAY_MS);
  return formatLocalDateKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Whole calendar days from `a` to `b` (b - a). */
export function diffDays(a: LocalDate, b: LocalDate): number {
  const pa = parseLocalDate(a);
  const pb = parseLocalDate(b);
  return Math.round(
    (Date.UTC(pb.year, pb.month - 1, pb.day) - Date.UTC(pa.year, pa.month - 1, pa.day)) / DAY_MS,
  );
}

export function weekdayOf(date: LocalDate): number {
  const { year, month, day } = parseLocalDate(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export type WallTimeResolution = 'exact' | 'gap_shifted' | 'ambiguous_first';

export interface ZonedInstant {
  instant: Date;
  resolution: WallTimeResolution;
}

/**
 * Converts a wall-clock date+time in `timeZone` to a UTC instant, handling DST gaps/overlaps.
 */
export function zonedWallTimeToInstant(date: LocalDate, time: LocalTime, timeZone: string): ZonedInstant {
  const { year, month, day } = parseLocalDate(date);
  const { hour, minute } = parseLocalTime(time);
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute);

  const candidateOffsets = new Set<number>([
    tzOffsetMinutes(wallAsUtc - DAY_MS, timeZone),
    tzOffsetMinutes(wallAsUtc, timeZone),
    tzOffsetMinutes(wallAsUtc + DAY_MS, timeZone),
  ]);

  const matches: number[] = [];
  for (const offset of candidateOffsets) {
    const utc = wallAsUtc - offset * MINUTE_MS;
    const p = getZonedParts(utc, timeZone);
    if (p.year === year && p.month === month && p.day === day && p.hour === hour && p.minute === minute) {
      matches.push(utc);
    }
  }

  if (matches.length === 1) return { instant: new Date(matches[0]), resolution: 'exact' };
  if (matches.length > 1) {
    return { instant: new Date(Math.min(...matches)), resolution: 'ambiguous_first' };
  }
  // Gap: interpret using the offset in force *before* the transition, which lands the
  // instant after the gap (wall time shifted forward by the gap length).
  const offsetBefore = tzOffsetMinutes(wallAsUtc - DAY_MS, timeZone);
  return { instant: new Date(wallAsUtc - offsetBefore * MINUTE_MS), resolution: 'gap_shifted' };
}

/** Start of the local calendar day `date` in `timeZone`, as an instant. */
export function startOfLocalDay(date: LocalDate, timeZone: string): Date {
  return zonedWallTimeToInstant(date, '00:00', timeZone).instant;
}

export function toIso(instant: Date | number): IsoInstant {
  return (typeof instant === 'number' ? new Date(instant) : instant).toISOString();
}

export function addMinutesIso(iso: IsoInstant, minutes: number): IsoInstant {
  return new Date(Date.parse(iso) + minutes * MINUTE_MS).toISOString();
}

export function minutesBetween(fromIso: IsoInstant, toIsoValue: IsoInstant): number {
  return (Date.parse(toIsoValue) - Date.parse(fromIso)) / MINUTE_MS;
}

/** Best-effort device time zone; callers on device may override with expo-localization. */
export function deviceTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && isValidTimeZone(tz)) return tz;
  } catch {
    // fall through
  }
  return 'UTC';
}

export function formatDateTime(
  iso: IsoInstant,
  timeZone: string,
  locale: string,
  opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' },
): string {
  try {
    return new Intl.DateTimeFormat(locale, { ...opts, timeZone }).format(new Date(iso));
  } catch {
    return new Date(iso).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  }
}

export function formatLocalDate(
  date: LocalDate,
  locale: string,
  opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  const { year, month, day } = parseLocalDate(date);
  try {
    return new Intl.DateTimeFormat(locale, { ...opts, timeZone: 'UTC' }).format(
      new Date(Date.UTC(year, month - 1, day, 12)),
    );
  } catch {
    return date;
  }
}

/** Formats 'HH:mm' using the locale's hour cycle (e.g. 8:00 AM vs 08:00). */
export function formatLocalTime(time: LocalTime, locale: string): string {
  const { hour, minute } = parseLocalTime(time);
  try {
    return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(
      new Date(Date.UTC(2000, 0, 1, hour, minute)),
    );
  } catch {
    return time;
  }
}

/** Describes elapsed time relative to `now` in coarse, human-friendly terms. */
export function relativeFromNow(iso: IsoInstant, now: Date): string {
  const minutes = Math.round((Date.parse(iso) - now.getTime()) / MINUTE_MS);
  const abs = Math.abs(minutes);
  const suffix = minutes >= 0 ? '' : ' ago';
  const prefix = minutes >= 0 ? 'in ' : '';
  if (abs < 1) return 'now';
  // Spelled out ("3 hours ago", not "3 h ago"): abbreviations are harder for older readers.
  if (abs < 60) return `${prefix}${abs} minute${abs === 1 ? '' : 's'}${suffix}`;
  const hours = Math.round(abs / 60);
  if (hours < 24) return `${prefix}${hours} hour${hours === 1 ? '' : 's'}${suffix}`;
  const days = Math.round(hours / 24);
  return `${prefix}${days} day${days === 1 ? '' : 's'}${suffix}`;
}
