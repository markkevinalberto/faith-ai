/**
 * Unit conversion and formatting. All medical arithmetic lives here (never in an LLM or UI).
 *
 * Glucose: 1 mmol/L = 18.0182 mg/dL (molar mass of glucose 180.182 g/mol ÷ 10).
 * Stored canonical units: glucose mg/dL, weight kg, temperature °C.
 */
import type { GlucoseUnit, TemperatureUnit, WeightUnit } from './types';

export const MGDL_PER_MMOLL = 18.0182;
export const LB_PER_KG = 2.2046226218;

export function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  // Add epsilon so values like 1.005 round half-up consistently.
  return Math.round((value + Number.EPSILON * Math.sign(value)) * f) / f;
}

export function glucoseToMgdl(value: number, unit: GlucoseUnit): number {
  return unit === 'mg/dL' ? value : value * MGDL_PER_MMOLL;
}

export function mgdlToGlucoseUnit(mgdl: number, unit: GlucoseUnit): number {
  return unit === 'mg/dL' ? mgdl : mgdl / MGDL_PER_MMOLL;
}

export function convertGlucose(value: number, from: GlucoseUnit, to: GlucoseUnit): number {
  if (from === to) return value;
  return mgdlToGlucoseUnit(glucoseToMgdl(value, from), to);
}

/** Display precision follows clinical convention: whole mg/dL, one decimal mmol/L. */
export function glucoseDecimals(unit: GlucoseUnit): number {
  return unit === 'mg/dL' ? 0 : 1;
}

export function formatGlucose(mgdl: number, unit: GlucoseUnit): string {
  const v = roundTo(mgdlToGlucoseUnit(mgdl, unit), glucoseDecimals(unit));
  return `${v.toFixed(glucoseDecimals(unit))} ${unit}`;
}

export function weightToKg(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : value / LB_PER_KG;
}

export function kgToWeightUnit(kg: number, unit: WeightUnit): number {
  return unit === 'kg' ? kg : kg * LB_PER_KG;
}

export function formatWeight(kg: number, unit: WeightUnit): string {
  return `${roundTo(kgToWeightUnit(kg, unit), 1).toFixed(1)} ${unit}`;
}

export function temperatureToC(value: number, unit: TemperatureUnit): number {
  return unit === 'C' ? value : ((value - 32) * 5) / 9;
}

export function cToTemperatureUnit(c: number, unit: TemperatureUnit): number {
  return unit === 'C' ? c : (c * 9) / 5 + 32;
}

export function formatTemperature(c: number, unit: TemperatureUnit): string {
  return `${roundTo(cToTemperatureUnit(c, unit), 1).toFixed(1)} °${unit}`;
}

export function formatBloodPressure(systolic: number, diastolic: number): string {
  return `${Math.round(systolic)}/${Math.round(diastolic)} mmHg`;
}

/**
 * Parses a user-typed decimal number. Accepts "7,2" (comma decimal locales) and trims spaces.
 * Returns null for empty or non-numeric input instead of NaN.
 */
export function parseDecimal(input: string): number | null {
  const s = input.trim().replace(/\s+/g, '').replace(',', '.');
  if (s === '' || !/^[-+]?\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
