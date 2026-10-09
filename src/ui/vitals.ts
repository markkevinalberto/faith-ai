/** Presentation helpers for vital readings (labels, icons, unit-aware display values). */
import type { IconName } from './Button';
import type { Tone } from './theme';
import { evaluateReading } from '../domain/escalation';
import { classifyAgainst, glucoseMetricForContext, resolveTarget, type RangePosition, type ResolvedTarget } from '../domain/targets';
import type { BpContext, ClinicianTarget, CustomVitalType, GlucoseContext, Profile, VitalReading, VitalType } from '../domain/types';
import { cToTemperatureUnit, glucoseDecimals, kgToWeightUnit, mgdlToGlucoseUnit, roundTo } from '../domain/units';

export type BuiltInVital = Exclude<VitalType, 'custom'>;

export const VITAL_ORDER: BuiltInVital[] = ['glucose', 'blood_pressure', 'pulse', 'weight', 'temperature', 'spo2'];

export const VITAL_META: Record<BuiltInVital, { label: string; short: string; icon: IconName; tone: Tone }> = {
  glucose: { label: 'Blood glucose', short: 'Glucose', icon: 'water-outline', tone: 'primary' },
  blood_pressure: { label: 'Blood pressure', short: 'BP', icon: 'heart-outline', tone: 'danger' },
  pulse: { label: 'Pulse', short: 'Pulse', icon: 'pulse-outline', tone: 'info' },
  weight: { label: 'Weight', short: 'Weight', icon: 'body-outline', tone: 'success' },
  temperature: { label: 'Temperature', short: 'Temp', icon: 'thermometer-outline', tone: 'warning' },
  spo2: { label: 'Oxygen saturation', short: 'SpO₂', icon: 'fitness-outline', tone: 'info' },
};

export const GLUCOSE_CONTEXT_OPTIONS: { value: GlucoseContext; label: string }[] = [
  { value: 'fasting', label: 'Fasting' },
  { value: 'before_meal', label: 'Before meal' },
  { value: 'after_meal', label: 'After meal' },
  { value: 'bedtime', label: 'Bedtime' },
  { value: 'overnight', label: 'Overnight' },
  { value: 'random', label: 'Other' },
];

export const BP_CONTEXT_OPTIONS: { value: BpContext; label: string }[] = [
  { value: 'seated_rest', label: 'Seated, rested' },
  { value: 'standing', label: 'Standing' },
  { value: 'after_activity', label: 'After activity' },
  { value: 'clinic', label: 'At clinic' },
  { value: 'other', label: 'Other' },
];

export function contextLabel(ctx: string | null): string | null {
  if (!ctx) return null;
  return [...GLUCOSE_CONTEXT_OPTIONS, ...BP_CONTEXT_OPTIONS].find((o) => o.value === ctx)?.label ?? ctx;
}

export function displayUnit(type: BuiltInVital, profile: Profile): string {
  switch (type) {
    case 'glucose':
      return profile.glucoseUnit;
    case 'blood_pressure':
      return 'mmHg';
    case 'pulse':
      return 'bpm';
    case 'weight':
      return profile.weightUnit;
    case 'temperature':
      return `°${profile.temperatureUnit}`;
    case 'spo2':
      return '%';
  }
}

/** Converts a canonical value to the profile's display unit (numbers only, for charts). */
export function toDisplay(type: VitalType, canonical: number, profile: Profile): number {
  switch (type) {
    case 'glucose':
      return roundTo(mgdlToGlucoseUnit(canonical, profile.glucoseUnit), glucoseDecimals(profile.glucoseUnit) + 1);
    case 'weight':
      return kgToWeightUnit(canonical, profile.weightUnit);
    case 'temperature':
      return cToTemperatureUnit(canonical, profile.temperatureUnit);
    default:
      return canonical;
  }
}

export function formatDisplay(type: VitalType, v: number, profile: Profile, decimals?: number): string {
  if (type === 'glucose') return roundTo(v, glucoseDecimals(profile.glucoseUnit)).toFixed(glucoseDecimals(profile.glucoseUnit));
  if (type === 'weight' || type === 'temperature') return roundTo(v, 1).toFixed(1);
  if (type === 'custom') return roundTo(v, decimals ?? 1).toFixed(decimals ?? 1);
  return String(Math.round(v));
}

export function readingDisplay(r: VitalReading, profile: Profile, custom?: CustomVitalType): { value: string; unit: string } {
  if (r.type === 'blood_pressure') return { value: `${r.systolic}/${r.diastolic}`, unit: 'mmHg' };
  if (r.type === 'custom') return { value: formatDisplay('custom', r.value as number, profile, custom?.decimals), unit: custom?.unit ?? r.unit };
  const unit = displayUnit(r.type, profile);
  return { value: formatDisplay(r.type, toDisplay(r.type, r.valueCanonical as number, profile), profile), unit };
}

export interface ReadingAssessment {
  target: ResolvedTarget | null;
  position: RangePosition | null;
  escalation: ReturnType<typeof evaluateReading>;
}

export function assessReading(r: VitalReading, targets: ClinicianTarget[], emergencyNumber: string | null): ReadingAssessment {
  const escalation = evaluateReading(r, emergencyNumber);
  if (r.type === 'glucose') {
    const metric = glucoseMetricForContext(r.context);
    const target = metric ? resolveTarget(metric, targets) : null;
    return { target, position: target ? classifyAgainst(r.valueCanonical as number, target) : null, escalation };
  }
  if (r.type === 'blood_pressure') {
    const s = resolveTarget('bp_systolic', targets);
    const d = resolveTarget('bp_diastolic', targets);
    if (!s || !d) return { target: null, position: null, escalation };
    const ps = classifyAgainst(r.systolic as number, s);
    const pd = classifyAgainst(r.diastolic as number, d);
    return { target: s, position: ps === 'above' || pd === 'above' ? 'above' : ps === 'below' && pd === 'below' ? 'below' : 'within', escalation };
  }
  if (r.type === 'pulse' || r.type === 'spo2') {
    const target = resolveTarget(r.type, targets);
    return { target, position: target ? classifyAgainst(r.valueCanonical as number, target) : null, escalation };
  }
  return { target: null, position: null, escalation };
}

export function positionPill(position: RangePosition | null, target: ResolvedTarget | null): { label: string; tone: Tone } | null {
  if (!position || !target) return null;
  const who = target.source === 'clinician' ? 'your target' : 'reference range';
  if (position === 'within') return { label: `Within ${who}`, tone: 'success' };
  return { label: position === 'above' ? `Above ${who}` : `Below ${who}`, tone: 'warning' };
}
