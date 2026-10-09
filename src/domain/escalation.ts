/**
 * Escalation rules for readings and symptom text.
 *
 * STATUS: DRAFT — PENDING CLINICAL REVIEW. Thresholds are taken from widely published international
 * guidance (cited per rule) but have not been reviewed by a licensed clinician for this app.
 * Rules only ever escalate (suggest contacting a clinician or emergency services); they never
 * reassure, diagnose or change treatment.
 */
import type { VitalReading } from './types';

export type EscalationLevel = 'emergency' | 'urgent' | 'attention';

export interface EscalationResult {
  level: EscalationLevel;
  ruleId: string;
  title: string;
  message: string;
  /** Short imperative steps, in priority order. */
  actions: string[];
  sourceIds: string[];
  reviewStatus: 'draft_pending_clinical_review';
}

const DRAFT = 'draft_pending_clinical_review' as const;

export const RED_FLAG_SYMPTOMS = [
  'chest pain or pressure',
  'shortness of breath',
  'new weakness or numbness, especially on one side',
  'face drooping, trouble speaking or confusion',
  'sudden vision change',
  'severe headache',
  'fainting',
];

function emergencyLine(emergencyNumber: string | null): string {
  return emergencyNumber
    ? `Call emergency services (${emergencyNumber}) now.`
    : 'Call your local emergency number now.';
}

/** Evaluates a single reading. Returns the most severe matching rule, or null. */
export function evaluateReading(
  reading: Pick<VitalReading, 'type' | 'valueCanonical' | 'systolic' | 'diastolic'>,
  emergencyNumber: string | null = null,
): EscalationResult | null {
  const v = reading.valueCanonical;
  switch (reading.type) {
    case 'glucose': {
      if (v === null) return null;
      if (v < 54) {
        return {
          level: 'urgent',
          ruleId: 'glucose.level2_low',
          title: 'Very low glucose reading (below 54 mg/dL / 3.0 mmol/L)',
          message:
            'This is in the range guidelines call clinically significant (level 2) hypoglycaemia. Follow the low-glucose plan your care team gave you now.',
          actions: [
            'Follow your hypoglycaemia action plan right away.',
            'Recheck as your plan advises (often after 15 minutes).',
            `If you are confused, drowsy, unable to swallow safely, or not improving: ${emergencyLine(emergencyNumber)}`,
            'Tell someone nearby what is happening.',
          ],
          sourceIds: ['ada-soc-hypoglycemia'],
          reviewStatus: DRAFT,
        };
      }
      if (v < 70) {
        return {
          level: 'attention',
          ruleId: 'glucose.level1_low',
          title: 'Low glucose reading (below 70 mg/dL / 3.9 mmol/L)',
          message: 'Guidelines call this level 1 hypoglycaemia. Follow the low-glucose plan from your care team.',
          actions: [
            'Follow your hypoglycaemia action plan.',
            'Recheck as your plan advises.',
            'Let your clinician know if lows keep happening.',
          ],
          sourceIds: ['ada-soc-hypoglycemia'],
          reviewStatus: DRAFT,
        };
      }
      if (v >= 300) {
        return {
          level: 'urgent',
          ruleId: 'glucose.very_high',
          title: 'Very high glucose reading (300 mg/dL / 16.7 mmol/L or more)',
          message:
            'Very high glucose can need prompt medical attention, especially with symptoms such as vomiting, abdominal pain, fast or deep breathing, or drowsiness.',
          actions: [
            `If you have vomiting, abdominal pain, trouble breathing, confusion or drowsiness: ${emergencyLine(emergencyNumber)}`,
            'Otherwise follow your high-glucose or sick-day plan (including ketone checks if your care team advised them).',
            'Contact your clinician today.',
          ],
          sourceIds: ['ada-soc-hyperglycemic-crises'],
          reviewStatus: DRAFT,
        };
      }
      if (v >= 250) {
        return {
          level: 'attention',
          ruleId: 'glucose.high',
          title: 'High glucose reading (250 mg/dL / 13.9 mmol/L or more)',
          message: 'Follow your high-glucose plan. If readings stay this high, contact your clinician.',
          actions: [
            'Follow your high-glucose or sick-day plan.',
            'Recheck later as advised by your care team.',
            'Contact your clinician if it stays high or you feel unwell.',
          ],
          sourceIds: ['ada-soc-hyperglycemic-crises'],
          reviewStatus: DRAFT,
        };
      }
      return null;
    }
    case 'blood_pressure': {
      const s = reading.systolic;
      const d = reading.diastolic;
      if (s === null || d === null) return null;
      if (s >= 180 || d >= 120) {
        return {
          level: 'urgent',
          ruleId: 'bp.severe',
          title: 'Very high blood pressure reading (180/120 mmHg or higher)',
          message:
            'Readings this high can be a hypertensive crisis. Red-flag symptoms need emergency care immediately.',
          actions: [
            `If you have chest pain, shortness of breath, back pain, numbness or weakness, vision change or difficulty speaking: ${emergencyLine(emergencyNumber)}`,
            'If you have no symptoms: rest quietly for 5 minutes and measure again.',
            'If it is still this high, contact your clinician now.',
          ],
          sourceIds: ['aha-hypertensive-crisis', 'ish-2020'],
          reviewStatus: DRAFT,
        };
      }
      if (s < 90 || d < 60) {
        return {
          level: 'attention',
          ruleId: 'bp.low',
          title: 'Low blood pressure reading (below 90/60 mmHg)',
          message: 'Low readings can matter if you feel dizzy, faint or unwell.',
          actions: [
            'Sit or lie down if you feel dizzy.',
            `If you faint or have chest pain or trouble breathing: ${emergencyLine(emergencyNumber)}`,
            'Tell your clinician about low readings, especially if you take blood-pressure medicine.',
          ],
          sourceIds: ['aha-low-bp'],
          reviewStatus: DRAFT,
        };
      }
      return null;
    }
    case 'spo2': {
      if (v === null) return null;
      if (v < 90) {
        return {
          level: 'urgent',
          ruleId: 'spo2.low',
          title: 'Low oxygen saturation (below 90%)',
          message: 'An oxygen saturation below 90% needs prompt medical assessment.',
          actions: [
            'Check the sensor is on a warm finger without nail polish and measure again.',
            `If it stays below 90% or you are short of breath: ${emergencyLine(emergencyNumber)}`,
          ],
          sourceIds: ['who-pulse-oximetry'],
          reviewStatus: DRAFT,
        };
      }
      if (v <= 94) {
        return {
          level: 'attention',
          ruleId: 'spo2.borderline',
          title: 'Oxygen saturation of 94% or lower',
          message: 'This is below the typical range for healthy adults at sea level.',
          actions: ['Measure again at rest.', 'Contact your clinician if it stays low or you feel short of breath.'],
          sourceIds: ['who-pulse-oximetry'],
          reviewStatus: DRAFT,
        };
      }
      return null;
    }
    case 'pulse': {
      if (v === null) return null;
      if (v < 40 || v > 130) {
        return {
          level: 'attention',
          ruleId: 'pulse.out_of_range',
          title: v < 40 ? 'Very slow pulse (below 40 bpm)' : 'Fast resting pulse (above 130 bpm)',
          message: 'A resting pulse this far outside the usual range should be discussed with a clinician.',
          actions: [
            'Rest for 5 minutes and measure again.',
            `If you have chest pain, fainting or trouble breathing: ${emergencyLine(emergencyNumber)}`,
            'Contact your clinician if it stays outside the usual range.',
          ],
          sourceIds: ['aha-heart-rate'],
          reviewStatus: DRAFT,
        };
      }
      return null;
    }
    case 'temperature': {
      if (v === null) return null;
      if (v < 35) {
        return {
          level: 'urgent',
          ruleId: 'temp.low',
          title: 'Low body temperature (below 35 °C / 95 °F)',
          message: 'A body temperature this low needs prompt medical attention.',
          actions: ['Measure again to confirm.', `If confirmed or you feel confused or very cold: ${emergencyLine(emergencyNumber)}`],
          sourceIds: ['who-fever-guidance'],
          reviewStatus: DRAFT,
        };
      }
      if (v >= 39.5) {
        return {
          level: 'attention',
          ruleId: 'temp.high_fever',
          title: 'High fever (39.5 °C / 103.1 °F or more)',
          message: 'High fever can affect glucose and blood pressure. Follow your sick-day plan.',
          actions: [
            'Follow your sick-day plan and keep hydrated if you are able to.',
            `If you have a stiff neck, confusion, trouble breathing or a rash: ${emergencyLine(emergencyNumber)}`,
            'Contact your clinician, especially if you have diabetes.',
          ],
          sourceIds: ['who-fever-guidance'],
          reviewStatus: DRAFT,
        };
      }
      return null;
    }
    default:
      return null;
  }
}

interface SymptomRule {
  id: string;
  patterns: RegExp[];
  title: string;
}

const EMERGENCY_SYMPTOM_RULES: SymptomRule[] = [
  { id: 'sym.chest_pain', title: 'Chest pain or pressure', patterns: [/chest (pain|pressure|tightness)/i, /pain in (my )?chest/i, /heart attack/i] },
  { id: 'sym.breathing', title: 'Trouble breathing', patterns: [/(can'?t|cannot|hard to|trouble|difficulty) breath/i, /short(ness)? of breath/i, /choking/i] },
  {
    id: 'sym.stroke',
    title: 'Possible stroke signs',
    patterns: [/stroke/i, /face (is )?droop/i, /slurred speech/i, /(one|1) side (of my body )?(is )?(weak|numb)/i, /sudden(ly)? (numb|weak|confus)/i],
  },
  { id: 'sym.unconscious', title: 'Fainting or unresponsiveness', patterns: [/faint(ed|ing)?\b/i, /pass(ed)? out/i, /unconscious/i, /unresponsive/i, /seizure/i, /convuls/i] },
  { id: 'sym.bleeding', title: 'Severe bleeding', patterns: [/(severe|heavy|won'?t stop) bleed/i, /vomit(ing)? blood/i] },
  { id: 'sym.overdose', title: 'Possible overdose', patterns: [/overdose/i, /took (too many|double|extra) (pills|doses|tablets)/i] },
  { id: 'sym.self_harm', title: 'Thoughts of self-harm', patterns: [/suicid/i, /kill myself/i, /end my life/i, /self[- ]harm/i, /hurt myself/i] },
  { id: 'sym.confusion', title: 'Severe confusion or drowsiness', patterns: [/very (confused|drowsy)/i, /can'?t (stay awake|wake)/i] },
];

/** Detects emergency red-flag phrases in free text (assistant input, notes). */
export function detectEmergencySymptoms(text: string, emergencyNumber: string | null = null): EscalationResult | null {
  const hits = EMERGENCY_SYMPTOM_RULES.filter((r) => r.patterns.some((p) => p.test(text)));
  if (hits.length === 0) return null;
  const selfHarm = hits.some((h) => h.id === 'sym.self_harm');
  const actions = [emergencyLine(emergencyNumber), 'If you are not alone, ask someone to stay with you and help.'];
  if (selfHarm) actions.push('You can also contact a local crisis line or a trusted person right now. You deserve support.');
  if (hits.some((h) => h.id === 'sym.overdose')) actions.push('If available, contact a poison control centre while waiting for help.');
  return {
    level: 'emergency',
    ruleId: hits.map((h) => h.id).join('+'),
    title: hits.map((h) => h.title).join(' · '),
    message: 'What you describe can be a medical emergency. FAITH cannot assess this — please get help now.',
    actions,
    sourceIds: ['who-emergency-care'],
    reviewStatus: DRAFT,
  };
}

export const ESCALATION_LEVEL_ORDER: Record<EscalationLevel, number> = { emergency: 3, urgent: 2, attention: 1 };

export function mostSevere(results: (EscalationResult | null)[]): EscalationResult | null {
  let best: EscalationResult | null = null;
  for (const r of results) {
    if (r && (!best || ESCALATION_LEVEL_ORDER[r.level] > ESCALATION_LEVEL_ORDER[best.level])) best = r;
  }
  return best;
}
