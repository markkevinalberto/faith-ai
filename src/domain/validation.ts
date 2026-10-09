/**
 * Input validation for forms. Plausibility limits reject typos (e.g. 1200 mg/dL) without making
 * clinical judgements; escalation for real-but-concerning values lives in escalation.ts.
 */
import { glucoseToMgdl, parseDecimal, temperatureToC, weightToKg } from './units';
import { isValidLocalDate, isValidLocalTime, isValidTimeZone } from './time';
import type { GlucoseUnit, TemperatureUnit, WeightUnit } from './types';

export type FieldErrors<K extends string = string> = Partial<Record<K, string>>;

export interface ValidationResult<T, K extends string = string> {
  ok: boolean;
  value?: T;
  errors: FieldErrors<K>;
}

export const LIMITS = {
  glucoseMgdl: { min: 10, max: 900 },
  systolic: { min: 50, max: 300 },
  diastolic: { min: 20, max: 200 },
  pulse: { min: 20, max: 250 },
  weightKg: { min: 1, max: 500 },
  temperatureC: { min: 25, max: 45 },
  spo2: { min: 50, max: 100 },
} as const;

function inRange(v: number, r: { min: number; max: number }) {
  return v >= r.min && v <= r.max;
}

export function validateGlucose(input: string, unit: GlucoseUnit): ValidationResult<{ value: number; mgdl: number }, 'value'> {
  const v = parseDecimal(input);
  if (v === null) return { ok: false, errors: { value: 'Enter a number.' } };
  const mgdl = glucoseToMgdl(v, unit);
  if (!inRange(mgdl, LIMITS.glucoseMgdl)) {
    const range = unit === 'mg/dL' ? '10–900 mg/dL' : '0.6–50.0 mmol/L';
    return { ok: false, errors: { value: `That looks outside what a meter reports (${range}). Check the value and unit.` } };
  }
  return { ok: true, value: { value: v, mgdl }, errors: {} };
}

export function validateBloodPressure(
  systolicIn: string,
  diastolicIn: string,
  pulseIn: string,
): ValidationResult<{ systolic: number; diastolic: number; pulse: number | null }, 'systolic' | 'diastolic' | 'pulse'> {
  const errors: FieldErrors<'systolic' | 'diastolic' | 'pulse'> = {};
  const s = parseDecimal(systolicIn);
  const d = parseDecimal(diastolicIn);
  const p = pulseIn.trim() === '' ? null : parseDecimal(pulseIn);
  if (s === null || !Number.isInteger(s)) errors.systolic = 'Enter the top number (whole number).';
  else if (!inRange(s, LIMITS.systolic)) errors.systolic = 'Top number should be between 50 and 300.';
  if (d === null || !Number.isInteger(d)) errors.diastolic = 'Enter the bottom number (whole number).';
  else if (!inRange(d, LIMITS.diastolic)) errors.diastolic = 'Bottom number should be between 20 and 200.';
  if (!errors.systolic && !errors.diastolic && s !== null && d !== null && s <= d) {
    errors.diastolic = 'The bottom number must be lower than the top number.';
  }
  if (pulseIn.trim() !== '') {
    if (p === null || !Number.isInteger(p)) errors.pulse = 'Enter pulse as a whole number.';
    else if (!inRange(p, LIMITS.pulse)) errors.pulse = 'Pulse should be between 20 and 250.';
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { systolic: s as number, diastolic: d as number, pulse: p }, errors };
}

export function validateSimpleVital(
  type: 'pulse' | 'weight' | 'temperature' | 'spo2',
  input: string,
  unit: string,
): ValidationResult<{ value: number; canonical: number }, 'value'> {
  const v = parseDecimal(input);
  if (v === null) return { ok: false, errors: { value: 'Enter a number.' } };
  let canonical = v;
  let limits: { min: number; max: number } = LIMITS.pulse;
  if (type === 'weight') {
    canonical = weightToKg(v, unit as WeightUnit);
    limits = LIMITS.weightKg;
  } else if (type === 'temperature') {
    canonical = temperatureToC(v, unit as TemperatureUnit);
    limits = LIMITS.temperatureC;
  } else if (type === 'spo2') {
    limits = LIMITS.spo2;
  }
  if (!inRange(canonical, limits)) return { ok: false, errors: { value: 'That value looks implausible. Check the number and unit.' } };
  return { ok: true, value: { value: v, canonical }, errors: {} };
}

export interface MedicationInput {
  name: string;
  strength: string;
  doseInstructions: string;
  startDate: string;
  endDate: string;
  times: string[];
  daysOfWeek: number[];
  asNeeded: boolean;
}

export function validateMedication(input: MedicationInput): FieldErrors<'name' | 'startDate' | 'endDate' | 'times' | 'daysOfWeek'> {
  const errors: FieldErrors<'name' | 'startDate' | 'endDate' | 'times' | 'daysOfWeek'> = {};
  if (!input.name.trim()) errors.name = 'Enter the medication name as it appears on the label.';
  else if (input.name.trim().length > 120) errors.name = 'Name is too long.';
  if (!isValidLocalDate(input.startDate)) errors.startDate = 'Choose a start date.';
  if (input.endDate && !isValidLocalDate(input.endDate)) errors.endDate = 'End date is not valid.';
  else if (input.endDate && isValidLocalDate(input.startDate) && input.endDate < input.startDate) {
    errors.endDate = 'End date must be on or after the start date.';
  }
  if (!input.asNeeded) {
    if (input.times.length === 0) errors.times = 'Add at least one time, or mark the medication as "as needed".';
    else if (input.times.some((t) => !isValidLocalTime(t))) errors.times = 'Times must be in HH:MM format.';
    else if (new Set(input.times).size !== input.times.length) errors.times = 'Each time can only be added once.';
    if (input.daysOfWeek.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) errors.daysOfWeek = 'Invalid day selection.';
  }
  return errors;
}

export function validateProfileName(name: string): string | null {
  const t = name.trim();
  if (!t) return 'Enter a name or nickname.';
  if (t.length > 80) return 'Keep the name under 80 characters.';
  return null;
}

export function validateTimeZone(tz: string): string | null {
  return isValidTimeZone(tz) ? null : 'Unknown time zone.';
}

export function validateTarget(low: string, high: string): { ok: boolean; low: number | null; high: number | null; error?: string } {
  const l = low.trim() === '' ? null : parseDecimal(low);
  const h = high.trim() === '' ? null : parseDecimal(high);
  if ((low.trim() !== '' && l === null) || (high.trim() !== '' && h === null)) return { ok: false, low: null, high: null, error: 'Enter numbers only.' };
  if (l === null && h === null) return { ok: false, low: null, high: null, error: 'Enter at least a lower or upper limit.' };
  if (l !== null && h !== null && l >= h) return { ok: false, low: null, high: null, error: 'Lower limit must be below the upper limit.' };
  return { ok: true, low: l, high: h };
}
