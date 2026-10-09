import {
  addDays,
  diffDays,
  formatLocalTime,
  isValidLocalDate,
  isValidLocalTime,
  localDateKey,
  localTimeKey,
  relativeFromNow,
  startOfLocalDay,
  tzOffsetMinutes,
  weekdayOf,
  zonedWallTimeToInstant,
} from '@/domain/time';

const NY = 'America/New_York';

describe('time zone offsets', () => {
  it('reports standard and daylight offsets', () => {
    expect(tzOffsetMinutes(Date.parse('2026-01-15T12:00:00Z'), NY)).toBe(-300);
    expect(tzOffsetMinutes(Date.parse('2026-07-15T12:00:00Z'), NY)).toBe(-240);
    expect(tzOffsetMinutes(Date.parse('2026-07-15T12:00:00Z'), 'Asia/Kolkata')).toBe(330);
    expect(tzOffsetMinutes(Date.parse('2026-07-15T12:00:00Z'), 'Asia/Manila')).toBe(480);
  });
});

describe('zonedWallTimeToInstant', () => {
  it('converts an ordinary wall time', () => {
    const r = zonedWallTimeToInstant('2026-07-01', '08:00', NY);
    expect(r.instant.toISOString()).toBe('2026-07-01T12:00:00.000Z');
    expect(r.resolution).toBe('exact');
  });

  it('works in zones without DST', () => {
    expect(zonedWallTimeToInstant('2026-10-09', '08:00', 'Asia/Manila').instant.toISOString()).toBe(
      '2026-10-09T00:00:00.000Z',
    );
  });

  it('shifts non-existent spring-forward times forward by the gap (US, 2026-03-08)', () => {
    const r = zonedWallTimeToInstant('2026-03-08', '02:30', NY);
    expect(r.resolution).toBe('gap_shifted');
    expect(r.instant.toISOString()).toBe('2026-03-08T07:30:00.000Z');
    expect(localTimeKey(r.instant, NY)).toBe('03:30');
  });

  it('resolves ambiguous fall-back times to the first occurrence (US, 2026-11-01)', () => {
    const r = zonedWallTimeToInstant('2026-11-01', '01:30', NY);
    expect(r.resolution).toBe('ambiguous_first');
    expect(r.instant.toISOString()).toBe('2026-11-01T05:30:00.000Z');
  });

  it('handles the UK spring-forward gap (2026-03-29 01:30 Europe/London)', () => {
    const r = zonedWallTimeToInstant('2026-03-29', '01:30', 'Europe/London');
    expect(r.resolution).toBe('gap_shifted');
    expect(localTimeKey(r.instant, 'Europe/London')).toBe('02:30');
  });

  it('rejects malformed input', () => {
    expect(() => zonedWallTimeToInstant('2026-02-30', '08:00', NY)).toThrow();
    expect(() => zonedWallTimeToInstant('2026-02-10', '24:00', NY)).toThrow();
  });
});

describe('local date keys', () => {
  it('uses the calendar date in the given zone around midnight', () => {
    expect(localDateKey(Date.parse('2026-10-09T15:30:00Z'), 'Asia/Manila')).toBe('2026-10-09');
    expect(localDateKey(Date.parse('2026-10-09T16:30:00Z'), 'Asia/Manila')).toBe('2026-10-10');
    expect(localDateKey(Date.parse('2026-10-09T03:30:00Z'), NY)).toBe('2026-10-08');
  });

  it('does calendar arithmetic across months, years and leap days', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(diffDays('2026-03-07', '2026-03-09')).toBe(2);
    expect(weekdayOf('2026-03-08')).toBe(0);
    expect(weekdayOf('2026-10-09')).toBe(5);
  });

  it('finds local midnight on DST days', () => {
    expect(startOfLocalDay('2026-03-08', NY).toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(startOfLocalDay('2026-03-09', NY).toISOString()).toBe('2026-03-09T04:00:00.000Z');
  });

  it('validates date and time strings', () => {
    expect(isValidLocalDate('2026-02-29')).toBe(false);
    expect(isValidLocalDate('2028-02-29')).toBe(true);
    expect(isValidLocalTime('07:05')).toBe(true);
    expect(isValidLocalTime('7:05')).toBe(false);
  });
});

describe('formatting helpers', () => {
  it('formats times per locale', () => {
    expect(formatLocalTime('20:05', 'en-GB')).toBe('20:05');
    expect(formatLocalTime('20:05', 'en-US')).toMatch(/8:05\sPM/);
  });

  it('describes relative times', () => {
    const now = new Date('2026-10-09T12:00:00Z');
    expect(relativeFromNow('2026-10-09T12:30:00Z', now)).toBe('in 30 min');
    expect(relativeFromNow('2026-10-09T09:00:00Z', now)).toBe('3 h ago');
    expect(relativeFromNow('2026-10-11T12:00:00Z', now)).toBe('in 2 days');
  });
});
