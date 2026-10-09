import {
  adherence,
  dailyAggregates,
  linearTrend,
  mean,
  median,
  rangeBreakdown,
  rangeWindow,
  stdDev,
  summarize,
} from '@/domain/stats';

const DAY = 86_400_000;
const T0 = Date.parse('2026-10-01T08:00:00Z');

describe('basic statistics', () => {
  it('computes mean, median and sample standard deviation', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(Math.sqrt(32 / 7), 10);
  });

  it('returns nulls for empty input instead of NaN', () => {
    const s = summarize([]);
    expect(s).toEqual({ count: 0, mean: null, median: null, min: null, max: null, stdDev: null, firstAt: null, lastAt: null });
    expect(stdDev([5])).toBeNull();
  });

  it('summarizes timed values', () => {
    const s = summarize([
      { t: T0 + DAY, v: 140 },
      { t: T0, v: 100 },
      { t: T0 + 2 * DAY, v: 120 },
    ]);
    expect(s.count).toBe(3);
    expect(s.mean).toBe(120);
    expect(s.min).toBe(100);
    expect(s.max).toBe(140);
    expect(s.firstAt).toBe(T0);
    expect(s.lastAt).toBe(T0 + 2 * DAY);
  });
});

describe('linearTrend', () => {
  it('detects a rising trend with the right slope', () => {
    const pts = Array.from({ length: 10 }, (_, i) => ({ t: T0 + i * DAY, v: 100 + 2 * i }));
    const tr = linearTrend(pts, { stableThreshold: 5 });
    expect(tr.direction).toBe('rising');
    expect(tr.slopePerDay).toBeCloseTo(2, 10);
    expect(tr.changeOverSpan).toBeCloseTo(18, 10);
  });

  it('reports stable when change is below the threshold', () => {
    const pts = Array.from({ length: 10 }, (_, i) => ({ t: T0 + i * DAY, v: 120 + (i % 2) }));
    expect(linearTrend(pts, { stableThreshold: 5 }).direction).toBe('stable');
  });

  it('refuses to report a trend from too little data', () => {
    expect(linearTrend([{ t: T0, v: 1 }, { t: T0 + DAY, v: 9 }], { stableThreshold: 1 }).direction).toBe('insufficient_data');
    const sameDay = Array.from({ length: 6 }, (_, i) => ({ t: T0 + i * 3_600_000, v: i * 10 }));
    expect(linearTrend(sameDay, { stableThreshold: 1 }).direction).toBe('insufficient_data');
  });
});

describe('rangeBreakdown', () => {
  it('splits values and keeps percentages summing to 100', () => {
    const r = rangeBreakdown([60, 100, 200], 70, 180);
    expect([r.below, r.within, r.above]).toEqual([1, 1, 1]);
    expect(r.belowPct + r.withinPct + r.abovePct).toBe(100);
  });

  it('treats boundaries as within and supports open-ended ranges', () => {
    expect(rangeBreakdown([70, 180], 70, 180).within).toBe(2);
    expect(rangeBreakdown([200], null, 180).above).toBe(1);
    expect(rangeBreakdown([], 70, 180).withinPct).toBe(0);
  });
});

describe('chart windows and daily aggregates', () => {
  it('builds a 7-day window ending at the end of today (local)', () => {
    const w = rangeWindow('week', new Date('2026-10-09T12:00:00Z'), 'UTC');
    expect(w.startDate).toBe('2026-10-03');
    expect(w.endDate).toBe('2026-10-10');
    expect(w.end - w.start).toBe(7 * DAY);
  });

  it('respects the time zone for the day window', () => {
    const w = rangeWindow('day', new Date('2026-10-09T17:00:00Z'), 'Asia/Manila');
    expect(w.startDate).toBe('2026-10-10');
    expect(new Date(w.start).toISOString()).toBe('2026-10-09T16:00:00.000Z');
  });

  it('groups readings by local day', () => {
    const agg = dailyAggregates(
      [
        { t: Date.parse('2026-10-09T15:00:00Z'), v: 100 }, // 23:00 Manila, Oct 9
        { t: Date.parse('2026-10-09T17:00:00Z'), v: 140 }, // 01:00 Manila, Oct 10
        { t: Date.parse('2026-10-10T02:00:00Z'), v: 160 }, // 10:00 Manila, Oct 10
      ],
      'Asia/Manila',
    );
    expect(agg.map((a) => [a.date, a.mean, a.count])).toEqual([
      ['2026-10-09', 100, 1],
      ['2026-10-10', 150, 2],
    ]);
  });
});

describe('adherence', () => {
  it('ignores upcoming/snoozed doses and computes taken percentage', () => {
    const a = adherence(['taken', 'taken', 'skipped', 'unconfirmed', 'upcoming', 'snoozed']);
    expect(a.resolved).toBe(4);
    expect(a.takenPct).toBe(50);
    expect(adherence(['upcoming']).takenPct).toBeNull();
  });
});
