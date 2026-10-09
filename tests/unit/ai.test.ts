import { hba1cMmolMolToPercent, hba1cPercentToMmolMol, parseConversion } from '@/ai/conversions';
import { guardOutput } from '@/ai/guard';
import { LIBRARY } from '@/ai/knowledge/library';
import { searchLibrary } from '@/ai/knowledge/search';
import { SOURCES } from '@/ai/knowledge/sources';
import { parseTimeframeDays, routeQuestion, type RouteContext } from '@/ai/router';

const ctx: RouteContext = { glucoseUnit: 'mg/dL', emergencyNumber: null, medicationNames: ['Metformin', 'Lisinopril'] };

describe('safety & intent router', () => {
  it.each([
    ['I have chest pain and my arm hurts', 'emergency'],
    ['I think I am having a stroke', 'emergency'],
    ['I missed my metformin dose, should I take two now?', 'dose_change'],
    ['Should I double my insulin tonight?', 'dose_change'],
    ['Can I stop taking lisinopril?', 'dose_change'],
    ['What medicine should I take for a headache?', 'prescribe'],
    ['Do I have diabetes?', 'diagnosis'],
    ['Convert 7.2 mmol/L to mg/dL', 'unit_conversion'],
    ['Summarize my glucose this week', 'readings_summary'],
    ['How has my blood pressure been this month?', 'readings_summary'],
    ['What were my latest lab results?', 'lab_summary'],
    ['What is HbA1c?', 'explain_term'],
    ['When is my next appointment?', 'appointments'],
    ['How do I take Metformin?', 'medication_lookup'],
    ['Prepare questions for my next appointment', 'clinician_questions'],
    ['What should I ask my doctor?', 'clinician_questions'],
  ])('%p → %p', (q, intent) => {
    expect(routeQuestion(q, ctx).intent).toBe(intent);
  });

  it('answers a stated value as a value, not as a definition', () => {
    const r = routeQuestion('my hba1c is 4,7', ctx);
    expect(r.intent).toBe('reported_value');
    expect(r.reported).toMatchObject({ kind: 'lab', value: 4.7, unit: '%' });
    expect(routeQuestion('fbs 5.6 this morning', ctx).intent).toBe('reported_value');
    expect(routeQuestion('what is hba1c', ctx).intent).toBe('explain_term');
    expect(routeQuestion('what were my latest lab results?', ctx).intent).toBe('lab_summary');
    expect(routeQuestion('I missed my metformin, should I take two?', ctx).intent).toBe('dose_change');
    expect(routeQuestion('my sugar is 45', ctx)).toMatchObject({ intent: 'reported_value', escalation: { ruleId: 'glucose.level2_low' } });
  });

  it('checks emergencies before anything else', () => {
    expect(routeQuestion('Should I double my dose? I have chest pain', ctx).intent).toBe('emergency');
  });

  it('escalates readings typed into the question', () => {
    expect(routeQuestion('my sugar is 45, what does that mean', ctx).escalation?.ruleId).toBe('glucose.level2_low');
    expect(routeQuestion('bp 185/125 this morning', ctx).escalation?.ruleId).toBe('bp.severe');
    expect(routeQuestion('my sugar was 2.8 mmol/L', ctx).escalation?.ruleId).toBe('glucose.level2_low');
    expect(routeQuestion('my sugar is 6.1', { ...ctx, glucoseUnit: 'mmol/L' }).escalation).toBeNull();
    expect(routeQuestion('my oxygen is 87%', ctx).escalation?.level).toBe('urgent');
  });

  it('extracts mentioned medications and timeframes', () => {
    expect(routeQuestion('instructions for metformin please', ctx).mentionedMedications).toEqual(['Metformin']);
    expect(parseTimeframeDays('last 3 days')).toBe(3);
    expect(parseTimeframeDays('past 2 weeks')).toBe(14);
    expect(parseTimeframeDays('this month')).toBe(30);
    expect(parseTimeframeDays('anything')).toBe(14);
  });
});

describe('deterministic conversions', () => {
  it('converts glucose, HbA1c, weight and temperature', () => {
    expect(parseConversion('convert 7.2 mmol/L to mg/dL')?.output).toEqual({ value: 130, unit: 'mg/dL' });
    expect(parseConversion('what is 126 mg/dL in mmol')?.output).toEqual({ value: 7, unit: 'mmol/L' });
    expect(parseConversion('a1c 7% in mmol/mol')?.output).toEqual({ value: 53, unit: 'mmol/mol' });
    expect(parseConversion('a1c 53 mmol/mol to percent')?.output).toEqual({ value: 7, unit: '%' });
    expect(parseConversion('convert 70 kg to lb')?.output).toEqual({ value: 154.3, unit: 'lb' });
    expect(parseConversion('convert 98.6 °F to celsius')?.output).toEqual({ value: 37, unit: '°C' });
    expect(parseConversion('hello there')).toBeNull();
  });

  it('uses the IFCC–NGSP master equation', () => {
    expect(hba1cPercentToMmolMol(6.5)).toBeCloseTo(47.5, 0);
    expect(hba1cMmolMolToPercent(hba1cPercentToMmolMol(8))).toBeCloseTo(8, 10);
  });
});

describe('output guard', () => {
  const context = 'FACTS: Average 142 mg/dL over 14 days; 9 of 12 readings within target of 80–130 mg/dL.';

  it('accepts grounded, non-directive text', () => {
    const g = guardOutput('Your average glucose was 142 mg/dL over the last 14 days. It may help to discuss this with your clinician.', context);
    expect(g).toEqual({ ok: true, violations: [], text: expect.any(String) });
  });

  it.each([
    ['You should take an extra dose tonight.', 'dose_instruction'],
    ['Increase your dose of insulin.', 'dose_change'],
    ['Stop taking metformin for now.', 'stop_start_medicine'],
    ['You have diabetes.', 'diagnosis'],
    ['Your reading is normal.', 'safety_claim'],
    ['There is no need to see a doctor.', 'discourage_care'],
  ])('rejects %p', (text, rule) => {
    expect(guardOutput(text, context).violations).toContain(rule);
  });

  it('allows safety-promoting negations', () => {
    expect(guardOutput("Don't stop taking your medicine without talking to your clinician first.", context).ok).toBe(true);
    expect(guardOutput('FAITH cannot tell whether a reading is safe for you.', context).ok).toBe(true);
  });

  it('rejects numbers that are not in the provided facts', () => {
    const g = guardOutput('Your average glucose was 155 mg/dL.', context);
    expect(g.ok).toBe(false);
    expect(g.violations[0]).toMatch(/^unsupported_number:155/);
  });

  it('can require phrases to be repeated verbatim', () => {
    const ctx = 'FACTS: 4.7 % is below the range ADA uses for prediabetes (below 5.7 %).';
    expect(guardOutput('Your 4.7 % is below the range ADA uses for prediabetes.', ctx, { requiredPhrases: ['below the range ADA uses for prediabetes'] }).ok).toBe(true);
    const r = guardOutput('Your 4.7 % is within the range ADA uses for prediabetes.', ctx, { requiredPhrases: ['below the range ADA uses for prediabetes'] });
    expect(r.ok).toBe(false);
    expect(r.violations[0]).toMatch(/^missing_phrase:/);
  });

  it('strips chat-template tokens', () => {
    expect(guardOutput('assistant: Hello there.<|im_end|>', context).text).toBe('Hello there.');
  });
});

describe('offline knowledge library', () => {
  it('finds relevant articles', () => {
    expect(searchLibrary('What is A1C?')[0].article.id).toBe('hba1c');
    expect(searchLibrary('low blood sugar symptoms')[0].article.id).toBe('hypoglycemia');
    expect(searchLibrary('how to measure blood pressure at home')[0].article.id).toBe('home-bp-technique');
    expect(searchLibrary('zzzz qqqq')).toEqual([]);
  });

  it('cites only known sources and is marked as draft pending review', () => {
    for (const a of LIBRARY) {
      expect(a.sourceIds.length).toBeGreaterThan(0);
      for (const s of a.sourceIds) expect(SOURCES[s]).toBeDefined();
      expect(a.reviewStatus).toBe('draft_pending_clinical_review');
    }
  });
});
