import { linearScale, niceStep, niceYDomain, timeTicks } from '@/domain/chartScale';
import { rangeWindow } from '@/domain/stats';

describe('linearScale', () => {
  it('maps domain to range proportionally (true time axis)', () => {
    const s = linearScale([0, 100], [0, 300]);
    expect(s(25)).toBe(75);
    expect(linearScale([5, 5], [0, 100])(5)).toBe(50);
  });
});

describe('niceYDomain', () => {
  it('snaps to nice steps and includes target lines', () => {
    expect(niceStep(28.25)).toBe(50);
    expect(niceStep(0.3)).toBe(0.5);
    const d = niceYDomain([72, 185]);
    expect(d).toEqual({ min: 50, max: 200, ticks: [50, 100, 150, 200] });
    const withTarget = niceYDomain([100, 120], [180]);
    expect(withTarget.max).toBeGreaterThanOrEqual(180);
  });

  it('handles single values and empty input', () => {
    const one = niceYDomain([120]);
    expect(one.min).toBeLessThan(120);
    expect(one.max).toBeGreaterThan(120);
    expect(niceYDomain([])).toEqual({ min: 0, max: 1, ticks: [0, 1] });
  });
});

describe('timeTicks', () => {
  const now = new Date('2026-10-09T12:00:00Z');

  it('day: 6-hourly ticks at local hours', () => {
    const w = rangeWindow('day', now, 'Asia/Manila');
    const ticks = timeTicks('day', w.start, w.end, 'Asia/Manila', 'en-GB');
    expect(ticks).toHaveLength(4);
    expect(new Date(ticks[0].t).toISOString()).toBe('2026-10-08T16:00:00.000Z'); // 00:00 Manila
  });

  it('week: one tick per local midnight with weekday labels', () => {
    const w = rangeWindow('week', now, 'UTC');
    const ticks = timeTicks('week', w.start, w.end, 'UTC', 'en-US');
    expect(ticks).toHaveLength(7);
    expect(ticks[0].label).toMatch(/Sat/); // 2026-10-03 is a Saturday
    expect(ticks[6].label).toMatch(/Fri/);
  });

  it('month: weekly ticks', () => {
    const w = rangeWindow('month', now, 'UTC');
    expect(timeTicks('month', w.start, w.end, 'UTC', 'en-US')).toHaveLength(5);
  });

  it('year: ticks at the first of each month inside the window', () => {
    const w = rangeWindow('year', now, 'UTC');
    const ticks = timeTicks('year', w.start, w.end, 'UTC', 'en-US');
    expect(ticks).toHaveLength(12);
    expect(ticks.every((t) => new Date(t.t).getUTCDate() === 1)).toBe(true);
  });

  it('places DST-day ticks at the correct local midnight', () => {
    const w = rangeWindow('week', new Date('2026-03-10T12:00:00Z'), 'America/New_York');
    const ticks = timeTicks('week', w.start, w.end, 'America/New_York', 'en-US');
    const iso = ticks.map((t) => new Date(t.t).toISOString());
    expect(iso).toContain('2026-03-08T05:00:00.000Z');
    expect(iso).toContain('2026-03-09T04:00:00.000Z');
  });
});
