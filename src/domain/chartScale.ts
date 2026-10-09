/**
 * Chart scales: true time-proportional x axis with calendar-aligned, time-zone-correct labels,
 * and "nice" y-axis bounds. Kept out of UI code so it can be unit tested.
 */
import type { ChartRange } from './stats';
import { addDays, getZonedParts, localDateKey, startOfLocalDay, zonedWallTimeToInstant } from './time';

export interface Tick {
  t: number;
  label: string;
}

export function linearScale(domain: [number, number], range: [number, number]): (x: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  return (x: number) => (span === 0 ? (r0 + r1) / 2 : r0 + ((x - d0) / span) * (r1 - r0));
}

function fmt(t: number, timeZone: string, locale: string, opts: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat(locale, { ...opts, timeZone }).format(new Date(t));
  } catch {
    return new Date(t).toISOString().slice(5, 10);
  }
}

/**
 * X-axis ticks for a window [start, end):
 *  - day:   every 6 hours (00:00, 06:00, 12:00, 18:00) local
 *  - week:  every local midnight, labelled weekday + day ("Mon 6")
 *  - month: every 7 days from the window start, labelled "Oct 6"
 *  - year:  first of each month, labelled "Jan"
 */
export function timeTicks(range: ChartRange, start: number, end: number, timeZone: string, locale = 'en-US'): Tick[] {
  const ticks: Tick[] = [];
  const startDate = localDateKey(start, timeZone);
  if (range === 'day') {
    for (const hh of ['00:00', '06:00', '12:00', '18:00']) {
      const t = zonedWallTimeToInstant(startDate, hh, timeZone).instant.getTime();
      if (t >= start && t < end) ticks.push({ t, label: fmt(t, timeZone, locale, { hour: 'numeric' }) });
    }
    return ticks;
  }
  if (range === 'week') {
    for (let i = 0; i < 8; i++) {
      const t = startOfLocalDay(addDays(startDate, i), timeZone).getTime();
      if (t >= start && t < end) ticks.push({ t, label: fmt(t, timeZone, locale, { weekday: 'short', day: 'numeric' }) });
    }
    return ticks;
  }
  if (range === 'month') {
    for (let i = 0; i < 31; i += 7) {
      const t = startOfLocalDay(addDays(startDate, i), timeZone).getTime();
      if (t >= start && t < end) ticks.push({ t, label: fmt(t, timeZone, locale, { month: 'short', day: 'numeric' }) });
    }
    return ticks;
  }
  // year: month starts
  const p = getZonedParts(start, timeZone);
  let year = p.year;
  let month = p.month;
  if (p.day !== 1 || p.hour !== 0) {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  for (let i = 0; i < 13; i++) {
    const key = `${year}-${String(month).padStart(2, '0')}-01`;
    const t = startOfLocalDay(key, timeZone).getTime();
    if (t >= end) break;
    if (t >= start) ticks.push({ t, label: fmt(t, timeZone, locale, { month: 'short' }) });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return ticks;
}

const NICE_STEPS = [1, 2, 2.5, 5, 10];

export function niceStep(rawStep: number): number {
  if (!(rawStep > 0) || !Number.isFinite(rawStep)) return 1;
  const exp = Math.floor(Math.log10(rawStep));
  const base = 10 ** exp;
  for (const s of NICE_STEPS) if (s * base >= rawStep - 1e-12) return s * base;
  return 10 * base;
}

/**
 * Y domain that includes all values plus optional reference lines (targets), padded and snapped to
 * a nice step. Returns ticks too.
 */
export function niceYDomain(values: number[], include: number[] = [], tickCount = 4): { min: number; max: number; ticks: number[] } {
  const all = [...values, ...include].filter((v) => Number.isFinite(v));
  if (all.length === 0) return { min: 0, max: 1, ticks: [0, 1] };
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  if (lo === hi) {
    const pad = Math.abs(lo) * 0.1 || 1;
    lo -= pad;
    hi += pad;
  }
  const step = niceStep((hi - lo) / tickCount);
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = min; v <= max + step / 2; v += step) ticks.push(Number(v.toFixed(10)));
  return { min, max, ticks };
}
