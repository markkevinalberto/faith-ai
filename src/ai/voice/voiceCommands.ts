/**
 * Turns a spoken sentence (on-device Whisper transcript) into a DRAFT reading. The draft only
 * pre-fills the form; the user confirms before anything is saved.
 */
import type { GlucoseContext } from '../../domain/types';

export type VoiceReading =
  | { type: 'blood_pressure'; systolic: number; diastolic: number; pulse: number | null }
  | { type: 'glucose'; value: number; unit: 'mg/dL' | 'mmol/L' | null; context: GlucoseContext | null }
  | { type: 'weight'; value: number; unit: 'kg' | 'lb' | null }
  | { type: 'pulse'; value: number }
  | { type: 'spo2'; value: number }
  | { type: 'temperature'; value: number; unit: 'C' | 'F' | null };

const n = (s: string) => Number(s.replace(',', '.'));

function glucoseContext(t: string): GlucoseContext | null {
  if (/\bfasting\b|\bbefore breakfast\b|\bwhen i woke\b|\bthis morning before\b/.test(t)) return 'fasting';
  if (/\bafter (eating|meal|meals|breakfast|lunch|dinner|food)\b|\bpost[- ]?meal\b/.test(t)) return 'after_meal';
  if (/\bbefore (lunch|dinner|meal|meals|eating)\b/.test(t)) return 'before_meal';
  if (/\b(bedtime|before bed|before sleeping)\b/.test(t)) return 'bedtime';
  return null;
}

export function parseVoiceReading(transcript: string): VoiceReading | null {
  const t = transcript.toLowerCase().replace(/[“”"]/g, '').replace(/\s+/g, ' ');
  const pulseM = /\b(?:pulse|heart ?rate)\D{0,10}(\d{2,3})\b/.exec(t);
  const pulse = pulseM ? n(pulseM[1]) : null;

  const bp = /(\d{2,3})\s*(?:\/|over|on|by)\s*(\d{2,3})\b/.exec(t);
  if (bp && (/\b(blood pressure|bp|pressure)\b/.test(t) || /\bover\b/.test(t))) {
    const s = n(bp[1]);
    const d = n(bp[2]);
    if (s > d) return { type: 'blood_pressure', systolic: s, diastolic: d, pulse };
  }

  const g = /\b(?:sugar|glucose|blood sugar|bg|reading)\D{0,14}(\d{1,3}(?:[.,]\d)?)\s*(mmol|mg)?/.exec(t);
  if (g) {
    const unit = g[2] ? (g[2].startsWith('mmol') ? 'mmol/L' : 'mg/dL') : null;
    return { type: 'glucose', value: n(g[1]), unit, context: glucoseContext(t) };
  }

  const w = /\b(?:weight|weigh|i weigh)\D{0,10}(\d{2,3}(?:[.,]\d)?)\s*(kg|kilo|kilos|kilograms|lb|lbs|pounds)?/.exec(t);
  if (w) return { type: 'weight', value: n(w[1]), unit: w[2] ? (w[2].startsWith('l') || w[2].startsWith('p') ? 'lb' : 'kg') : null };

  const temp = /\b(?:temperature|temp|fever)\D{0,10}(\d{2,3}(?:[.,]\d)?)\s*(c\b|celsius|f\b|fahrenheit)?/.exec(t);
  if (temp) return { type: 'temperature', value: n(temp[1]), unit: temp[2] ? (temp[2].startsWith('f') ? 'F' : 'C') : null };

  const o2 = /\b(?:oxygen|spo2|sp o2|saturation|o2|sats)\D{0,10}(\d{2,3})\b/.exec(t);
  if (o2) return { type: 'spo2', value: n(o2[1]) };

  if (pulse !== null) return { type: 'pulse', value: pulse };
  return null;
}
