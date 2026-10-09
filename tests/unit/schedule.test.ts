import {
  averageDailyDoses,
  describeDays,
  generateOccurrences,
  occursOn,
  parseDaysOfWeek,
  serializeDaysOfWeek,
  slotKey,
  type ScheduleSpec,
} from '@/domain/schedule';

const NY = 'America/New_York';

function spec(partial: Partial<ScheduleSpec>): ScheduleSpec {
  return {
    scheduleId: 's1',
    medicationId: 'm1',
    timeOfDay: '08:00',
    daysOfWeek: [],
    startDate: '2026-01-01',
    endDate: null,
    ...partial,
  };
}

describe('days of week helpers', () => {
  it('parses and serializes', () => {
    expect(parseDaysOfWeek('')).toEqual([]);
    expect(parseDaysOfWeek('5,1,1,9,3')).toEqual([1, 3, 5]);
    expect(serializeDaysOfWeek([3, 1, 5])).toBe('1,3,5');
    expect(serializeDaysOfWeek([0, 1, 2, 3, 4, 5, 6])).toBe('');
  });

  it('describes selections', () => {
    expect(describeDays([])).toBe('Every day');
    expect(describeDays([1, 2, 3, 4, 5])).toBe('Weekdays');
    expect(describeDays([0, 6])).toBe('Weekends');
    expect(describeDays([1, 3])).toBe('Mon, Wed');
  });
});

describe('generateOccurrences', () => {
  it('produces one dose per day at the local time, correct across spring-forward', () => {
    const occ = generateOccurrences([spec({})], '2026-03-07', '2026-03-09', NY);
    expect(occ.map((o) => o.scheduledFor)).toEqual([
      '2026-03-07T13:00:00.000Z', // EST
      '2026-03-08T12:00:00.000Z', // EDT (DST starts 02:00)
      '2026-03-09T12:00:00.000Z',
    ]);
    expect(occ.every((o) => o.localTime === '08:00' && o.timezone === NY)).toBe(true);
  });

  it('keeps an 8 PM dose at 8 PM local across fall-back', () => {
    const occ = generateOccurrences([spec({ timeOfDay: '20:00' })], '2026-10-31', '2026-11-01', NY);
    expect(occ.map((o) => o.scheduledFor)).toEqual(['2026-11-01T00:00:00.000Z', '2026-11-02T01:00:00.000Z']);
  });

  it('flags doses scheduled inside a DST gap', () => {
    const occ = generateOccurrences([spec({ timeOfDay: '02:15' })], '2026-03-08', '2026-03-08', NY);
    expect(occ[0].resolution).toBe('gap_shifted');
  });

  it('honours days of week, start and end dates', () => {
    const s = spec({ daysOfWeek: [1, 3, 5], startDate: '2026-10-06', endDate: '2026-10-14' });
    const dates = generateOccurrences([s], '2026-10-01', '2026-10-31', 'UTC').map((o) => o.localDate);
    // Mon 5 excluded (before start); Wed 7, Fri 9, Mon 12, Wed 14 included; Fri 16 after end.
    expect(dates).toEqual(['2026-10-07', '2026-10-09', '2026-10-12', '2026-10-14']);
    expect(occursOn(s, '2026-10-08')).toBe(false);
  });

  it('orders multiple daily times and schedules chronologically', () => {
    const occ = generateOccurrences(
      [spec({ scheduleId: 'b', timeOfDay: '20:00' }), spec({ scheduleId: 'a', timeOfDay: '08:00' })],
      '2026-10-09',
      '2026-10-10',
      'UTC',
    );
    expect(occ.map((o) => `${o.localDate} ${o.localTime}`)).toEqual([
      '2026-10-09 08:00',
      '2026-10-09 20:00',
      '2026-10-10 08:00',
      '2026-10-10 20:00',
    ]);
  });

  it('is deterministic and returns nothing for an inverted window', () => {
    const a = generateOccurrences([spec({})], '2026-10-01', '2026-10-07', NY);
    const b = generateOccurrences([spec({})], '2026-10-01', '2026-10-07', NY);
    expect(a).toEqual(b);
    expect(generateOccurrences([spec({})], '2026-10-07', '2026-10-01', NY)).toEqual([]);
  });

  it('builds stable slot keys', () => {
    expect(slotKey({ scheduleId: 's', localDate: '2026-10-09', localTime: '08:00' })).toBe('s|2026-10-09|08:00');
  });

  it('computes average daily doses', () => {
    expect(averageDailyDoses([{ daysOfWeek: [] }, { daysOfWeek: [] }])).toBe(2);
    expect(averageDailyDoses([{ daysOfWeek: [1] }])).toBeCloseTo(1 / 7, 10);
  });
});
