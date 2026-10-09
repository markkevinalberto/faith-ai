/**
 * Target ranges. Clinician-provided targets always win over general reference ranges, and every
 * classification carries the source of the target so the UI can say exactly where it came from.
 * A reading inside a range is never described as "safe".
 */
import type { ClinicianTarget, GlucoseContext, TargetMetric } from './types';

export type TargetSourceKind = 'clinician' | 'reference';

export interface ResolvedTarget {
  metric: TargetMetric;
  low: number | null;
  high: number | null;
  unit: string;
  source: TargetSourceKind;
  /** e.g. "Set by Dr. Lee on 2026-08-12" or the reference citation. */
  sourceLabel: string;
  reviewStatus: 'clinician_provided' | 'draft_pending_clinical_review';
}

/**
 * General adult reference ranges (NOT personalised). Draft content pending clinical review.
 * Many people have individualised targets — the UI says so whenever these are used.
 */
export const REFERENCE_TARGETS: Record<TargetMetric, Omit<ResolvedTarget, 'metric'> | null> = {
  glucose_fasting: {
    low: 80,
    high: 130,
    unit: 'mg/dL',
    source: 'reference',
    sourceLabel: 'ADA Standards of Care in Diabetes — general pre-meal target for many non-pregnant adults',
    reviewStatus: 'draft_pending_clinical_review',
  },
  glucose_before_meal: {
    low: 80,
    high: 130,
    unit: 'mg/dL',
    source: 'reference',
    sourceLabel: 'ADA Standards of Care in Diabetes — general pre-meal target for many non-pregnant adults',
    reviewStatus: 'draft_pending_clinical_review',
  },
  glucose_after_meal: {
    low: null,
    high: 180,
    unit: 'mg/dL',
    source: 'reference',
    sourceLabel: 'ADA Standards of Care in Diabetes — general 1–2 h after-meal peak target for many non-pregnant adults',
    reviewStatus: 'draft_pending_clinical_review',
  },
  glucose_bedtime: null,
  bp_systolic: {
    low: null,
    high: 130,
    unit: 'mmHg',
    source: 'reference',
    sourceLabel: 'ISH 2020 Global Hypertension Practice Guidelines / ADA — general treatment target <130/80 for many adults',
    reviewStatus: 'draft_pending_clinical_review',
  },
  bp_diastolic: {
    low: null,
    high: 80,
    unit: 'mmHg',
    source: 'reference',
    sourceLabel: 'ISH 2020 Global Hypertension Practice Guidelines / ADA — general treatment target <130/80 for many adults',
    reviewStatus: 'draft_pending_clinical_review',
  },
  pulse: {
    low: 60,
    high: 100,
    unit: 'bpm',
    source: 'reference',
    sourceLabel: 'Commonly cited adult resting heart-rate range (AHA patient education)',
    reviewStatus: 'draft_pending_clinical_review',
  },
  spo2: {
    low: 95,
    high: null,
    unit: '%',
    source: 'reference',
    sourceLabel: 'WHO Pulse Oximetry Training Manual — typical value in healthy adults at sea level',
    reviewStatus: 'draft_pending_clinical_review',
  },
  weight: null,
};

export function glucoseMetricForContext(context: string | null): TargetMetric | null {
  switch (context as GlucoseContext | null) {
    case 'fasting':
      return 'glucose_fasting';
    case 'before_meal':
      return 'glucose_before_meal';
    case 'after_meal':
      return 'glucose_after_meal';
    case 'bedtime':
      return 'glucose_bedtime';
    default:
      return null;
  }
}

export function resolveTarget(metric: TargetMetric, clinicianTargets: ClinicianTarget[], locale = 'en'): ResolvedTarget | null {
  const own = clinicianTargets.find((t) => t.metric === metric);
  if (own) {
    return {
      metric,
      low: own.low,
      high: own.high,
      unit: own.unit,
      source: 'clinician',
      sourceLabel: `Set by ${own.setBy}${own.setOn ? ` on ${own.setOn}` : ''}`,
      reviewStatus: 'clinician_provided',
    };
  }
  void locale;
  const ref = REFERENCE_TARGETS[metric];
  return ref ? { metric, ...ref } : null;
}

export type RangePosition = 'below' | 'within' | 'above';

export function classifyAgainst(value: number, target: Pick<ResolvedTarget, 'low' | 'high'>): RangePosition {
  if (target.low !== null && value < target.low) return 'below';
  if (target.high !== null && value > target.high) return 'above';
  return 'within';
}

/** Plain-language description that never implies safety. */
export function describePosition(position: RangePosition, target: ResolvedTarget): string {
  const whose = target.source === 'clinician' ? 'your clinician-set target' : 'the general reference range (not personalised)';
  if (position === 'within') return `Within ${whose}`;
  return position === 'below' ? `Below ${whose}` : `Above ${whose}`;
}

export function formatTargetRange(low: number | null, high: number | null, unit: string): string {
  if (low !== null && high !== null) return `${low}–${high} ${unit}`;
  if (high !== null) return `below ${high} ${unit}`;
  if (low !== null) return `${low} ${unit} or above`;
  return '—';
}
