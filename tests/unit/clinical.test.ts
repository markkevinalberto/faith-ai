import { detectEmergencySymptoms, evaluateReading, mostSevere } from '@/domain/escalation';
import { estimateSupply, refillReminderDate } from '@/domain/supply';
import { classifyAgainst, describePosition, glucoseMetricForContext, resolveTarget } from '@/domain/targets';
import type { ClinicianTarget } from '@/domain/types';
import {
  validateBloodPressure,
  validateGlucose,
  validateMedication,
  validateSimpleVital,
  validateTarget,
} from '@/domain/validation';

const glucose = (mgdl: number) => ({ type: 'glucose' as const, valueCanonical: mgdl, systolic: null, diastolic: null });
const bp = (s: number, d: number) => ({ type: 'blood_pressure' as const, valueCanonical: null, systolic: s, diastolic: d });

describe('reading escalation (draft rules)', () => {
  it.each([
    [50, 'urgent', 'glucose.level2_low'],
    [65, 'attention', 'glucose.level1_low'],
    [260, 'attention', 'glucose.high'],
    [320, 'urgent', 'glucose.very_high'],
  ])('glucose %p mg/dL → %p', (v, level, rule) => {
    const r = evaluateReading(glucose(v));
    expect(r?.level).toBe(level);
    expect(r?.ruleId).toBe(rule);
    expect(r?.reviewStatus).toBe('draft_pending_clinical_review');
  });

  it('does not escalate ordinary readings and never claims safety', () => {
    expect(evaluateReading(glucose(110))).toBeNull();
    expect(evaluateReading(bp(118, 76))).toBeNull();
  });

  it('escalates a hypertensive-crisis-range reading with emergency red flags first', () => {
    const r = evaluateReading(bp(186, 100), '112');
    expect(r?.level).toBe('urgent');
    expect(r?.actions[0]).toMatch(/chest pain/);
    expect(r?.actions[0]).toMatch(/112/);
  });

  it('escalates low oxygen saturation', () => {
    expect(evaluateReading({ type: 'spo2', valueCanonical: 88, systolic: null, diastolic: null })?.level).toBe('urgent');
    expect(evaluateReading({ type: 'spo2', valueCanonical: 93, systolic: null, diastolic: null })?.level).toBe('attention');
  });

  it('picks the most severe result', () => {
    expect(mostSevere([evaluateReading(glucose(65)), evaluateReading(glucose(50)), null])?.ruleId).toBe('glucose.level2_low');
  });
});

describe('symptom red flags', () => {
  it.each([
    'I have chest pain and feel sweaty',
    "I can't breathe properly",
    'my face is drooping and speech is slurred speech',
    'I fainted this morning',
    'I want to kill myself',
  ])('flags %p as an emergency', (text) => {
    expect(detectEmergencySymptoms(text)?.level).toBe('emergency');
  });

  it.each(['What does HbA1c mean?', 'Summarize my chest x-ray appointment notes', 'When is my next lab test?'])(
    'does not flag %p',
    (text) => {
      expect(detectEmergencySymptoms(text)).toBeNull();
    },
  );

  it('adds crisis support wording for self-harm', () => {
    expect(detectEmergencySymptoms('thinking about self-harm')?.actions.join(' ')).toMatch(/crisis line/);
  });
});

describe('targets', () => {
  const clinician: ClinicianTarget = {
    id: 't1',
    profileId: 'p1',
    metric: 'glucose_fasting',
    low: 90,
    high: 140,
    unit: 'mg/dL',
    setBy: 'Dr. Example',
    setOn: '2026-08-12',
    notes: null,
  };

  it('prefers clinician targets and labels the source', () => {
    const t = resolveTarget('glucose_fasting', [clinician]);
    expect(t?.source).toBe('clinician');
    expect(t?.sourceLabel).toBe('Set by Dr. Example on 2026-08-12');
  });

  it('falls back to labelled reference ranges', () => {
    const t = resolveTarget('glucose_after_meal', []);
    expect(t?.source).toBe('reference');
    expect(t?.reviewStatus).toBe('draft_pending_clinical_review');
    expect(resolveTarget('weight', [])).toBeNull();
  });

  it('describes position without implying safety', () => {
    const t = resolveTarget('glucose_fasting', [])!;
    const text = describePosition(classifyAgainst(100, t), t);
    expect(text).toMatch(/general reference range/);
    expect(text.toLowerCase()).not.toMatch(/safe|normal|healthy|fine/);
    expect(classifyAgainst(75, t)).toBe('below');
    expect(classifyAgainst(131, t)).toBe('above');
  });

  it('maps glucose contexts to metrics', () => {
    expect(glucoseMetricForContext('fasting')).toBe('glucose_fasting');
    expect(glucoseMetricForContext('random')).toBeNull();
  });
});

describe('validation', () => {
  it('validates glucose in both units', () => {
    expect(validateGlucose('126', 'mg/dL').value?.mgdl).toBe(126);
    expect(validateGlucose('7', 'mmol/L').value?.mgdl).toBeCloseTo(126.13, 2);
    expect(validateGlucose('1260', 'mg/dL').ok).toBe(false);
    expect(validateGlucose('x', 'mg/dL').ok).toBe(false);
  });

  it('validates blood pressure', () => {
    expect(validateBloodPressure('120', '80', '').value).toEqual({ systolic: 120, diastolic: 80, pulse: null });
    expect(validateBloodPressure('80', '120', '').errors.diastolic).toMatch(/lower than the top/);
    expect(validateBloodPressure('120.5', '80', '').ok).toBe(false);
    expect(validateBloodPressure('120', '80', '300').errors.pulse).toBeDefined();
  });

  it('validates weight with units', () => {
    expect(validateSimpleVital('weight', '154.3', 'lb').value?.canonical).toBeCloseTo(70, 0);
    expect(validateSimpleVital('spo2', '101', '%').ok).toBe(false);
  });

  it('validates medications', () => {
    const base = { name: 'Metformin', strength: '500 mg', doseInstructions: '', startDate: '2026-10-01', endDate: '', times: ['08:00'], daysOfWeek: [], asNeeded: false };
    expect(validateMedication(base)).toEqual({});
    expect(validateMedication({ ...base, name: ' ' }).name).toBeDefined();
    expect(validateMedication({ ...base, times: [] }).times).toBeDefined();
    expect(validateMedication({ ...base, times: [], asNeeded: true }).times).toBeUndefined();
    expect(validateMedication({ ...base, times: ['08:00', '08:00'] }).times).toBeDefined();
    expect(validateMedication({ ...base, endDate: '2026-09-01' }).endDate).toBeDefined();
  });

  it('validates targets', () => {
    expect(validateTarget('80', '130')).toEqual({ ok: true, low: 80, high: 130 });
    expect(validateTarget('', '').ok).toBe(false);
    expect(validateTarget('140', '130').ok).toBe(false);
  });
});

describe('supply estimates', () => {
  it('computes remaining supply and days left', () => {
    expect(estimateSupply({ supplyCount: 60, unitsPerDose: 1, takenSinceUpdate: 10, averageDailyDoses: 2 })).toEqual({
      remainingUnits: 50,
      daysLeft: 25,
    });
    expect(estimateSupply({ supplyCount: null, unitsPerDose: 1, takenSinceUpdate: 0, averageDailyDoses: 1 })).toBeNull();
  });

  it('chooses an explicit refill date, else the threshold day', () => {
    const now = new Date('2026-10-09T12:00:00Z');
    expect(refillReminderDate({ explicitDate: '2026-11-01', estimate: null, thresholdDays: 7, now, timeZone: 'UTC' })).toBe('2026-11-01');
    expect(
      refillReminderDate({ explicitDate: null, estimate: { remainingUnits: 20, daysLeft: 10 }, thresholdDays: 7, now, timeZone: 'UTC' }),
    ).toBe('2026-10-12');
    expect(
      refillReminderDate({ explicitDate: null, estimate: { remainingUnits: 2, daysLeft: 2 }, thresholdDays: 7, now, timeZone: 'UTC' }),
    ).toBe('2026-10-09');
  });
});
