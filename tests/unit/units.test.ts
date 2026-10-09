import {
  MGDL_PER_MMOLL,
  convertGlucose,
  formatBloodPressure,
  formatGlucose,
  formatTemperature,
  formatWeight,
  glucoseToMgdl,
  kgToWeightUnit,
  mgdlToGlucoseUnit,
  parseDecimal,
  roundTo,
  temperatureToC,
  weightToKg,
} from '@/domain/units';

describe('glucose conversion', () => {
  it('uses 18.0182 mg/dL per mmol/L', () => {
    expect(MGDL_PER_MMOLL).toBe(18.0182);
    expect(glucoseToMgdl(1, 'mmol/L')).toBeCloseTo(18.0182, 6);
  });

  it('converts common clinical values', () => {
    expect(roundTo(mgdlToGlucoseUnit(100, 'mmol/L'), 1)).toBe(5.5);
    expect(roundTo(glucoseToMgdl(7.0, 'mmol/L'), 0)).toBe(126);
    expect(roundTo(mgdlToGlucoseUnit(70, 'mmol/L'), 1)).toBe(3.9);
    expect(roundTo(mgdlToGlucoseUnit(54, 'mmol/L'), 1)).toBe(3.0);
    expect(roundTo(mgdlToGlucoseUnit(180, 'mmol/L'), 1)).toBe(10.0);
  });

  it('is identity for same unit and round-trips', () => {
    expect(convertGlucose(123, 'mg/dL', 'mg/dL')).toBe(123);
    expect(convertGlucose(convertGlucose(6.4, 'mmol/L', 'mg/dL'), 'mg/dL', 'mmol/L')).toBeCloseTo(6.4, 10);
  });

  it('formats with clinical precision', () => {
    expect(formatGlucose(126.1, 'mg/dL')).toBe('126 mg/dL');
    expect(formatGlucose(126.1, 'mmol/L')).toBe('7.0 mmol/L');
  });
});

describe('weight and temperature', () => {
  it('converts weight', () => {
    expect(roundTo(kgToWeightUnit(70, 'lb'), 1)).toBe(154.3);
    expect(weightToKg(154.3236, 'lb')).toBeCloseTo(70, 3);
    expect(formatWeight(70, 'kg')).toBe('70.0 kg');
  });

  it('converts temperature', () => {
    expect(temperatureToC(98.6, 'F')).toBeCloseTo(37, 6);
    expect(formatTemperature(37, 'F')).toBe('98.6 °F');
    expect(formatTemperature(37, 'C')).toBe('37.0 °C');
  });

  it('formats blood pressure', () => {
    expect(formatBloodPressure(128.4, 81.6)).toBe('128/82 mmHg');
  });
});

describe('parseDecimal', () => {
  it.each([
    ['120', 120],
    [' 7.2 ', 7.2],
    ['7,2', 7.2],
    ['.5', 0.5],
  ])('parses %p', (input, expected) => {
    expect(parseDecimal(input)).toBe(expected);
  });

  it.each(['', 'abc', '1.2.3', '12a', '--1'])('rejects %p', (input) => {
    expect(parseDecimal(input)).toBeNull();
  });
});
