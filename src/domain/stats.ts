/**
 * Deterministic statistics over recorded readings. These numbers are shown to the user and
 * passed to the language model as facts — the model never computes them.
 */
import { addDays, localDateKey, startOfLocalDay } from './time';
import type { LocalDate } from './types';

export interface TimedValue {
  /** Epoch milliseconds (UTC). */
  t: number;
  v: number;
}

export interface Summary {
  count: number;
  mean: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  stdDev: number | null;
  firstAt: number | null;
  lastAt: number | null;
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

/** Sample standard deviation (n - 1). Null for fewer than two values. */
export function stdDev(values: number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values) as number;
  let acc = 0;
  for (const v of values) acc += (v - m) ** 2;
  return Math.sqrt(acc / (values.length - 1));
}

export function summarize(points: TimedValue[]): Summary {
  if (points.length === 0) {
    return { count: 0, mean: null, median: null, min: null, max: null, stdDev: null, firstAt: null, lastAt: null };
  }
  const values = points.map((p) => p.v);
  let firstAt = points[0].t;
  let lastAt = points[0].t;
  for (const p of points) {
    if (p.t < firstAt) firstAt = p.t;
    if (p.t > lastAt) lastAt = p.t;
  }
  return {
    count: values.length,
    mean: mean(values),
    median: median(values),
    min: Math.min(...values),
    max: Math.max(...values),
    stdDev: stdDev(values),
    firstAt,
    lastAt,
  };
}

export type TrendDirection = 'rising' | 'falling' | 'stable' | 'insufficient_data';

export interface Trend {
  direction: TrendDirection;
  /** Least-squares slope in value units per day. */
  slopePerDay: number | null;
  /** Fitted change across the observed time span. */
  changeOverSpan: number | null;
  spanDays: number | null;
  count: number;
}

const DAY_MS = 86_400_000;

/**
 * Ordinary least-squares trend. A trend is only reported when there are at least
 * `minPoints` readings spanning at least `minSpanDays`, and the fitted change exceeds
 * `stableThreshold` (absolute, in value units); otherwise it is "stable" or "insufficient_data".
 */
export function linearTrend(
  points: TimedValue[],
  opts: { stableThreshold: number; minPoints?: number; minSpanDays?: number },
): Trend {
  const minPoints = opts.minPoints ?? 4;
  const minSpanDays = opts.minSpanDays ?? 3;
  const n = points.length;
  if (n < minPoints) {
    return { direction: 'insufficient_data', slopePerDay: null, changeOverSpan: null, spanDays: null, count: n };
  }
  const t0 = Math.min(...points.map((p) => p.t));
  const t1 = Math.max(...points.map((p) => p.t));
  const spanDays = (t1 - t0) / DAY_MS;
  if (spanDays < minSpanDays) {
    return { direction: 'insufficient_data', slopePerDay: null, changeOverSpan: null, spanDays, count: n };
  }
  const xs = points.map((p) => (p.t - t0) / DAY_MS);
  const ys = points.map((p) => p.v);
  const mx = mean(xs) as number;
  const my = mean(ys) as number;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const change = slope * spanDays;
  let direction: TrendDirection = 'stable';
  if (Math.abs(change) >= opts.stableThreshold) direction = change > 0 ? 'rising' : 'falling';
  return { direction, slopePerDay: slope, changeOverSpan: change, spanDays, count: n };
}

export interface RangeBreakdown {
  below: number;
  within: number;
  above: number;
  total: number;
  /** Percentages 0-100, rounded to whole numbers and summing to 100 (or all 0 when empty). */
  belowPct: number;
  withinPct: number;
  abovePct: number;
}

export function rangeBreakdown(values: number[], low: number | null, high: number | null): RangeBreakdown {
  let below = 0;
  let within = 0;
  let above = 0;
  for (const v of values) {
    if (low !== null && v < low) below++;
    else if (high !== null && v > high) above++;
    else within++;
  }
  const total = values.length;
  if (total === 0) return { below, within, above, total, belowPct: 0, withinPct: 0, abovePct: 0 };
  const belowPct = Math.round((below / total) * 100);
  const abovePct = Math.round((above / total) * 100);
  return { below, within, above, total, belowPct, abovePct, withinPct: 100 - belowPct - abovePct };
}

export type ChartRange = 'day' | 'week' | 'month' | 'year';

export const RANGE_DAYS: Record<ChartRange, number> = { day: 1, week: 7, month: 30, year: 365 };

/**
 * Window for a chart range ending at the end of today's local day.
 * 'day' = today (local midnight → next midnight); others = the last N local days including today.
 */
export function rangeWindow(range: ChartRange, now: Date, timeZone: string): { start: number; end: number; startDate: LocalDate; endDate: LocalDate } {
  const today = localDateKey(now, timeZone);
  const startDate = addDays(today, -(RANGE_DAYS[range] - 1));
  const endDate = addDays(today, 1);
  return {
    start: startOfLocalDay(startDate, timeZone).getTime(),
    end: startOfLocalDay(endDate, timeZone).getTime(),
    startDate,
    endDate,
  };
}

export function filterWindow<T extends { t: number }>(points: T[], start: number, end: number): T[] {
  return points.filter((p) => p.t >= start && p.t < end);
}

export interface DailyAggregate {
  date: LocalDate;
  /** Epoch ms at local noon — a stable x position for the day. */
  t: number;
  mean: number;
  min: number;
  max: number;
  count: number;
}

/** Groups readings by local calendar day in `timeZone`. Used for month/year charts. */
export function dailyAggregates(points: TimedValue[], timeZone: string): DailyAggregate[] {
  const groups = new Map<LocalDate, number[]>();
  for (const p of points) {
    const key = localDateKey(p.t, timeZone);
    const arr = groups.get(key);
    if (arr) arr.push(p.v);
    else groups.set(key, [p.v]);
  }
  const out: DailyAggregate[] = [];
  for (const [date, values] of groups) {
    const noon = startOfLocalDay(date, timeZone).getTime() + 12 * 3_600_000;
    out.push({
      date,
      t: noon,
      mean: mean(values) as number,
      min: Math.min(...values),
      max: Math.max(...values),
      count: values.length,
    });
  }
  return out.sort((a, b) => a.t - b.t);
}

export interface AdherenceSummary {
  taken: number;
  skipped: number;
  unconfirmed: number;
  /** Doses that are past due and resolved (taken + skipped + unconfirmed). */
  resolved: number;
  /** taken / resolved as 0-100, or null when nothing resolved yet. */
  takenPct: number | null;
}

export function adherence(statuses: string[]): AdherenceSummary {
  let taken = 0;
  let skipped = 0;
  let unconfirmed = 0;
  for (const s of statuses) {
    if (s === 'taken') taken++;
    else if (s === 'skipped') skipped++;
    else if (s === 'unconfirmed') unconfirmed++;
  }
  const resolved = taken + skipped + unconfirmed;
  return { taken, skipped, unconfirmed, resolved, takenPct: resolved === 0 ? null : Math.round((taken / resolved) * 100) };
}
