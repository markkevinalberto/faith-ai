/** Deterministic unit conversions requested in chat ("convert 7.2 mmol/L to mg/dL"). */
import { cToTemperatureUnit, convertGlucose, kgToWeightUnit, roundTo, temperatureToC, weightToKg } from '../domain/units';

export interface ConversionResult {
  input: { value: number; unit: string };
  output: { value: number; unit: string };
  formula: string;
  sourceId: string | null;
}

/** HbA1c: NGSP % = 0.09148 × IFCC (mmol/mol) + 2.152 (IFCC–NGSP master equation). */
export function hba1cPercentToMmolMol(pct: number): number {
  return (pct - 2.152) / 0.09148;
}
export function hba1cMmolMolToPercent(mmolMol: number): number {
  return 0.09148 * mmolMol + 2.152;
}

const NUM = '(\\d+(?:[.,]\\d+)?)';

export function parseConversion(text: string): ConversionResult | null {
  const t = text.toLowerCase().replace(/,(?=\d)/g, '.');
  const m = (re: string) => new RegExp(re, 'i').exec(t);
  const isA1c = /\b(hb)?a1c\b/.test(t);

  let r = m(`${NUM}\\s*(mmol\\s*/\\s*mol)`);
  if (r && (isA1c || /mmol\s*\/\s*mol/.test(t))) {
    const v = Number(r[1]);
    return {
      input: { value: v, unit: 'mmol/mol' },
      output: { value: roundTo(hba1cMmolMolToPercent(v), 1), unit: '%' },
      formula: 'HbA1c % = 0.09148 × mmol/mol + 2.152',
      sourceId: 'ngsp-ifcc',
    };
  }
  r = m(`${NUM}\\s*%`);
  if (r && isA1c) {
    const v = Number(r[1]);
    return {
      input: { value: v, unit: '%' },
      output: { value: Math.round(hba1cPercentToMmolMol(v)), unit: 'mmol/mol' },
      formula: 'HbA1c mmol/mol = (% − 2.152) ÷ 0.09148',
      sourceId: 'ngsp-ifcc',
    };
  }
  r = m(`${NUM}\\s*(mmol\\s*/\\s*l|mmol)\\b`);
  if (r) {
    const v = Number(r[1]);
    return {
      input: { value: v, unit: 'mmol/L' },
      output: { value: roundTo(convertGlucose(v, 'mmol/L', 'mg/dL'), 0), unit: 'mg/dL' },
      formula: 'mg/dL = mmol/L × 18.0182',
      sourceId: null,
    };
  }
  r = m(`${NUM}\\s*(mg\\s*/\\s*dl|mgdl|mg)\\b`);
  if (r && /(glucose|sugar|mmol|mg\s*\/\s*dl|convert)/.test(t)) {
    const v = Number(r[1]);
    return {
      input: { value: v, unit: 'mg/dL' },
      output: { value: roundTo(convertGlucose(v, 'mg/dL', 'mmol/L'), 1), unit: 'mmol/L' },
      formula: 'mmol/L = mg/dL ÷ 18.0182',
      sourceId: null,
    };
  }
  r = m(`${NUM}\\s*(kg|kilos?|kilograms?)\\b`);
  if (r) {
    const v = Number(r[1]);
    return { input: { value: v, unit: 'kg' }, output: { value: roundTo(kgToWeightUnit(v, 'lb'), 1), unit: 'lb' }, formula: 'lb = kg × 2.2046', sourceId: null };
  }
  r = m(`${NUM}\\s*(lbs?|pounds?)\\b`);
  if (r) {
    const v = Number(r[1]);
    return { input: { value: v, unit: 'lb' }, output: { value: roundTo(weightToKg(v, 'lb'), 1), unit: 'kg' }, formula: 'kg = lb ÷ 2.2046', sourceId: null };
  }
  r = m(`${NUM}\\s*(°\\s*c|degrees? c(elsius)?|celsius|c)\\b`);
  if (r && /(°|degree|celsius|fahrenheit|temp|fever|convert)/.test(t)) {
    const v = Number(r[1]);
    return { input: { value: v, unit: '°C' }, output: { value: roundTo(cToTemperatureUnit(v, 'F'), 1), unit: '°F' }, formula: '°F = °C × 9/5 + 32', sourceId: null };
  }
  r = m(`${NUM}\\s*(°\\s*f|degrees? f(ahrenheit)?|fahrenheit|f)\\b`);
  if (r && /(°|degree|celsius|fahrenheit|temp|fever|convert)/.test(t)) {
    const v = Number(r[1]);
    return { input: { value: v, unit: '°F' }, output: { value: roundTo(temperatureToC(v, 'F'), 1), unit: '°C' }, formula: '°C = (°F − 32) × 5/9', sourceId: null };
  }
  return null;
}
