/**
 * Deterministic intent + safety router. Runs BEFORE any retrieval or model call.
 * Emergency language short-circuits everything; dose-change / prescribing / diagnosis requests are
 * refused with a safe alternative; everything else is classified for retrieval.
 */
import { detectEmergencySymptoms, evaluateReading, mostSevere, type EscalationResult } from '../domain/escalation';
import { glucoseToMgdl } from '../domain/units';
import type { GlucoseUnit } from '../domain/types';
import { parseConversion, type ConversionResult } from './conversions';

export type Intent =
  | 'emergency'
  | 'dose_change'
  | 'prescribe'
  | 'diagnosis'
  | 'unit_conversion'
  | 'clinician_questions'
  | 'readings_summary'
  | 'lab_summary'
  | 'appointments'
  | 'medication_lookup'
  | 'explain_term'
  | 'general';

export type MetricHint = 'glucose' | 'blood_pressure' | 'weight' | 'pulse' | 'spo2' | 'temperature';

export interface Route {
  intent: Intent;
  escalation: EscalationResult | null;
  metrics: MetricHint[];
  timeframeDays: number;
  conversion: ConversionResult | null;
  mentionedMedications: string[];
}

export interface RouteContext {
  glucoseUnit: GlucoseUnit;
  emergencyNumber: string | null;
  medicationNames: string[];
}

const DOSE_CHANGE: RegExp[] = [
  /\b(double|extra|another|more|less|half|increase|decrease|reduce|raise|lower|adjust|change|stop|quit|skip|split|cut)\b[^.?!]{0,30}\b(dose|doses|dosage|medication|medications|medicine|medicines|meds|pills?|tablets?|insulin|units|mg)\b/,
  /\bmiss(ed|ing)?\b[^.?!]{0,30}\b(dose|pill|tablet|medication|medicine|insulin|injection)s?\b/,
  /\bforg(o|e)t\b[^.?!]{0,20}\b(take|pill|tablet|medication|medicine|insulin|dose)/,
  /\bshould i take (two|2|double|both|extra|another|more|less|half)\b/,
  /\bhow (much|many) (insulin|units|mg|pills|tablets)\b/,
  /\bshould i (stop|start|skip|double|increase|decrease|change|reduce|take (more|less|extra|another))\b/,
  /\bcan i (stop|skip|double|take (more|less|extra|another|two))\b/,
  /\b(make up|catch up) (for )?(a |the |my )?(missed )?(dose|pill)/,
];

const PRESCRIBE: RegExp[] = [
  /\b(what|which) (medicine|medication|drug|pill|supplement)s? (should|can|could) i (take|use|try)\b/,
  /\brecommend (a |some |any )?(medicine|medication|drug|pill|supplement|treatment)/,
  /\bprescribe\b/,
  /\bwhat (should|can) i take for\b/,
];

const DIAGNOSIS: RegExp[] = [
  /\b(do|did) i have\b/,
  /\bhave i got\b/,
  /\bam i (diabetic|hypertensive|sick|ill|dying)\b/,
  /\bdiagnos(e|is)\b/,
  /\bwhat('?s| is) wrong with me\b/,
  /\bis (it|this) (cancer|serious|a stroke|a heart attack)\b/,
];

const CLINICIAN_QUESTIONS =
  /\b(questions?|things?) (to ask|for)( my| the| our)?( next| upcoming)? (doctor|clinician|nurse|gp|physician|specialist|endocrinologist|cardiologist|appointment|visit|check-?up)|\bprepare (me )?for (my |the )?(next |upcoming )?(appointment|visit|check-?up|consultation)|\bwhat should i ask\b/;

const METRIC_PATTERNS: Record<MetricHint, RegExp> = {
  glucose: /\b(glucose|sugars?|blood sugar|bg|cgm|fasting|post-?meal|after meals?)\b/,
  blood_pressure: /\b(blood pressure|bp|systolic|diastolic|pressure readings?)\b/,
  weight: /\b(weight|weigh|kg|lbs?|pounds)\b/,
  pulse: /\b(pulse|heart ?rate|bpm)\b/,
  spo2: /\b(oxygen|spo2|sp02|saturation|o2|sats)\b/,
  temperature: /\b(temperature|fever|temp)\b/,
};

const SUMMARY_WORDS = /\b(summar|average|avg|mean|trend|history|readings?|levels?|numbers?|how (have|has|are|is|were|was) my|last|recent|lately|highest|lowest|chart|progress|in range|this (week|month)|past|show)/;
const LAB_WORDS = /\b(labs?|lab tests?|test results?|blood tests?|results?|a1c|hba1c|cholesterol|ldl|hdl|lipids?|triglycerides|egfr|gfr|creatinine|kidney function|urine|microalbumin|uacr|potassium|tsh)\b/;
const APPOINTMENT_WORDS = /\b(appointments?|visits?|check-?ups?|consultations?|next (doctor|clinic)|see (my|the) doctor)\b/;
const MEDICATION_WORDS = /\b(medications?|medicines?|meds|pills?|tablets?|doses?|insulin|prescriptions?|refills?|instructions)\b/;
const EXPLAIN_WORDS = /\b(what is|what are|what's|what does|whats|meaning of|what do .* mean|explain|define|definition|tell me about|stand for)\b/;

export function parseTimeframeDays(text: string): number {
  const t = text.toLowerCase();
  const n = /\b(?:last|past|previous)\s+(\d{1,3})\s+days?\b/.exec(t);
  if (n) return Math.min(365, Math.max(1, Number(n[1])));
  const w = /\b(?:last|past|previous)\s+(\d{1,2})\s+weeks?\b/.exec(t);
  if (w) return Math.min(365, Number(w[1]) * 7);
  const mo = /\b(?:last|past|previous)\s+(\d{1,2})\s+months?\b/.exec(t);
  if (mo) return Math.min(365, Number(mo[1]) * 30);
  if (/\btoday\b/.test(t)) return 1;
  if (/\byesterday\b/.test(t)) return 2;
  if (/\b(two|2) weeks|fortnight\b/.test(t)) return 14;
  if (/\b(this|last|past) week\b|\b7 days\b/.test(t)) return 7;
  if (/\b(three|3) months|\bquarter\b|\b90 days\b/.test(t)) return 90;
  if (/\b(this|last|past) month\b|\b30 days\b/.test(t)) return 30;
  if (/\b(this|last|past) year\b|\b12 months\b/.test(t)) return 365;
  return 14;
}

/** Detects readings typed into the question ("my sugar is 45", "bp 185/125") and escalates them. */
export function detectReportedReadings(text: string, ctx: RouteContext): EscalationResult | null {
  const t = text.toLowerCase();
  const results: (EscalationResult | null)[] = [];
  const bp = /\b(\d{2,3})\s*\/\s*(\d{2,3})\b/.exec(t);
  if (bp && /\b(bp|blood pressure|pressure|mmhg)\b/.test(t)) {
    const s = Number(bp[1]);
    const d = Number(bp[2]);
    if (s > d) results.push(evaluateReading({ type: 'blood_pressure', valueCanonical: null, systolic: s, diastolic: d }, ctx.emergencyNumber));
  }
  const g = /\b(sugar|glucose|bg|reading)\b[^0-9]{0,20}(\d{1,3}(?:[.,]\d)?)\s*(mmol(?:\/l)?|mg\/?dl)?/.exec(t);
  if (g) {
    const value = Number(g[2].replace(',', '.'));
    const explicit = g[3] ? (g[3].startsWith('mmol') ? 'mmol/L' : 'mg/dL') : null;
    const unit: GlucoseUnit = explicit ?? (value <= 35 && (ctx.glucoseUnit === 'mmol/L' || g[2].includes('.') || value < 20) ? 'mmol/L' : 'mg/dL');
    const mgdl = glucoseToMgdl(value, unit);
    if (mgdl >= 10 && mgdl <= 1000) results.push(evaluateReading({ type: 'glucose', valueCanonical: mgdl, systolic: null, diastolic: null }, ctx.emergencyNumber));
  }
  const o = /\b(oxygen|spo2|saturation|o2|sats)\b[^0-9]{0,15}(\d{2,3})\s*%?/.exec(t);
  if (o) results.push(evaluateReading({ type: 'spo2', valueCanonical: Number(o[2]), systolic: null, diastolic: null }, ctx.emergencyNumber));
  return mostSevere(results);
}

export function findMentionedMedications(text: string, names: string[]): string[] {
  const t = text.toLowerCase();
  return names.filter((name) => {
    const n = name.toLowerCase().trim();
    if (!n) return false;
    if (t.includes(n)) return true;
    const first = n.split(/\s+/)[0];
    return first.length >= 4 && new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(t);
  });
}

export function routeQuestion(question: string, ctx: RouteContext): Route {
  const t = question.toLowerCase().replace(/\s+/g, ' ').trim();
  const timeframeDays = parseTimeframeDays(t);
  const mentionedMedications = findMentionedMedications(t, ctx.medicationNames);
  const metrics = (Object.keys(METRIC_PATTERNS) as MetricHint[]).filter((k) => METRIC_PATTERNS[k].test(t));
  const base = { metrics, timeframeDays, conversion: null as ConversionResult | null, mentionedMedications };

  const emergency = detectEmergencySymptoms(t, ctx.emergencyNumber);
  if (emergency) return { ...base, intent: 'emergency', escalation: emergency };

  const escalation = detectReportedReadings(t, ctx);

  if (DOSE_CHANGE.some((re) => re.test(t))) return { ...base, intent: 'dose_change', escalation };
  if (PRESCRIBE.some((re) => re.test(t))) return { ...base, intent: 'prescribe', escalation };
  if (DIAGNOSIS.some((re) => re.test(t))) return { ...base, intent: 'diagnosis', escalation };

  const conversion = parseConversion(t);
  if (conversion && /\b(convert|conversion|in mg|in mmol|to mg|to mmol|to kg|to lb|in kg|in lbs?|to °?[cf]|in °?[cf]|equals?|equivalent|how much is|what is)\b/.test(t)) {
    return { ...base, intent: 'unit_conversion', escalation, conversion };
  }

  if (CLINICIAN_QUESTIONS.test(t)) return { ...base, intent: 'clinician_questions', escalation };

  const explain = EXPLAIN_WORDS.test(t);
  const personal = /\b(my|mine|i've|i have been|me)\b/.test(t);

  if (metrics.length > 0 && (SUMMARY_WORDS.test(t) || (personal && !explain))) {
    return { ...base, intent: 'readings_summary', escalation };
  }
  if (LAB_WORDS.test(t) && (personal || /\b(latest|last|recent|results?)\b/.test(t)) && !(explain && !personal)) {
    return { ...base, intent: 'lab_summary', escalation };
  }
  if (APPOINTMENT_WORDS.test(t) && !explain) return { ...base, intent: 'appointments', escalation };
  if (mentionedMedications.length > 0 || (MEDICATION_WORDS.test(t) && !explain)) return { ...base, intent: 'medication_lookup', escalation };
  if (explain || LAB_WORDS.test(t) || metrics.length > 0) return { ...base, intent: 'explain_term', escalation };
  return { ...base, intent: 'general', escalation };
}
