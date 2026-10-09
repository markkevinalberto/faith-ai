import type { ChatMessage, GenerateOptions, InferenceEngine } from '@/ai/inference/types';
import { extractLabReport, extractLabel, parseJsonObject } from '@/ai/scan/extract';
import { groundFields, isGrounded } from '@/ai/scan/grounding';
import { linesToRows } from '@/ai/scan/layout';
import { parseLabReport, parseReference, parseRowLine, parseRowLines } from '@/ai/scan/labReportParser';
import { frequencyFromInstructions, parseLabel, suggestTimes } from '@/ai/scan/labelParser';

const LABEL = `SAMPLE PHARMACY
Rx# 004512   Date: 10/01/2026
PATIENT: TEST PERSON
METFORMIN HCL 500 MG TABLET
Take 1 tablet by mouth twice daily
with meals
Qty: 60   Refills: 2
Dr. Maria Example`;

describe('prescription label parser', () => {
  it('extracts name, strength, form, instructions, quantity and prescriber', () => {
    const d = parseLabel(LABEL);
    expect(d.name).toBe('Metformin HCl');
    expect(d.strength).toBe('500 mg');
    expect(d.form).toBe('Tablet');
    expect(d.instructions).toBe('Take 1 tablet by mouth twice daily with meals');
    expect(d.quantity).toBe(60);
    expect(d.prescriber).toBe('Dr. Maria Example');
    expect(d.timesPerDay).toBe(2);
    expect(d.suggestedTimes).toEqual(['08:00', '20:00']);
  });

  it('recognises as-needed and bedtime directions', () => {
    expect(frequencyFromInstructions('Take 1 tablet every 6 hours as needed for pain').asNeeded).toBe(true);
    expect(parseLabel('ATORVASTATIN 20MG TAB\nTake one tablet at bedtime').suggestedTimes).toEqual(['21:00']);
    expect(suggestTimes(3, false)).toEqual(['08:00', '14:00', '20:00']);
  });

  it('returns nulls instead of guessing when text is unreadable', () => {
    const d = parseLabel('blurry photo\n### ###');
    expect(d).toMatchObject({ name: null, strength: null, instructions: null, quantity: null, suggestedTimes: [] });
  });
});

const REPORT = `SAMPLE DIAGNOSTICS LAB
Patient: Test Person   Age: 58
Test Result Units Reference Range
HbA1c 7.2 % 4.0 - 5.6 H
Glucose, Fasting 126 mg/dL 70-99 H
LDL Cholesterol 104 mg/dL <100 H
eGFR 78 mL/min/1.73m2 >=60
Creatinine: 1.1 mg/dL (0.6-1.2)
Page 1 of 2`;

describe('lab report parser', () => {
  it('extracts rows exactly as printed', () => {
    const rows = parseLabReport(REPORT);
    expect(rows.map((r) => r.analyte)).toEqual(['HbA1c', 'Glucose, Fasting', 'LDL Cholesterol', 'eGFR', 'Creatinine']);
    expect(rows[0]).toMatchObject({ valueNum: 7.2, unit: '%', refLow: 4, refHigh: 5.6, flag: 'H' });
    expect(rows[1]).toMatchObject({ valueNum: 126, unit: 'mg/dL', refLow: 70, refHigh: 99 });
    expect(rows[2]).toMatchObject({ valueNum: 104, refHigh: 100, refLow: null, refText: '<100' });
    expect(rows[3]).toMatchObject({ valueNum: 78, unit: 'mL/min/1.73m2', refLow: 60 });
    expect(rows[4]).toMatchObject({ valueNum: 1.1, refLow: 0.6, refHigh: 1.2 });
  });

  it('rebuilds rows when the value is printed on the line after the name', () => {
    const rows = parseLabReport('HbA1c\n7.2 %\n4.0 - 5.6\nLDL Cholesterol\n104 mg/dL\nCreatinine\n1.1 mg/dL (0.6-1.2)');
    expect(rows.map((r) => [r.analyte, r.valueNum, r.confidence])).toEqual([
      ['HbA1c', 7.2, 'low'],
      ['LDL Cholesterol', 104, 'low'],
      ['Creatinine', 1.1, 'low'],
    ]);
    expect(rows[0]).toMatchObject({ unit: '%', refLow: 4, refHigh: 5.6 });
    expect(rows[2]).toMatchObject({ refLow: 0.6, refHigh: 1.2 });
  });

  it('pairs a column of names with a column of values read separately by OCR', () => {
    const rows = parseLabReport('Test\nHbA1c\nGlucose, Fasting\nLDL Cholesterol\nResult\n7.2 %\n126 mg/dL 70-99 H\n104 mg/dL');
    expect(rows.map((r) => [r.analyte, r.valueNum, r.unit])).toEqual([
      ['HbA1c', 7.2, '%'],
      ['Glucose, Fasting', 126, 'mg/dL'],
      ['LDL Cholesterol', 104, 'mg/dL'],
    ]);
    expect(rows[1]).toMatchObject({ refLow: 70, refHigh: 99, flag: 'H', confidence: 'low' });
  });

  it('does not pair header or patient lines with stray numbers', () => {
    expect(parseLabReport('Patient: Test Person\n58\nPage\n1 of 2\nDate\n10/01/2026')).toEqual([]);
    expect(parseLabReport(REPORT).every((r) => r.confidence === 'high')).toBe(true);
  });

  it('strips dot leaders from test names', () => {
    expect(parseLabReport('Thyroid Stimulating Hormone ......... 2.1 mIU/L ( 0.4 - 4.0 )')[0]).toMatchObject({ analyte: 'Thyroid Stimulating Hormone', valueNum: 2.1, refLow: 0.4, refHigh: 4 });
  });

  it('parses reference formats', () => {
    expect(parseReference('(3.5 - 5.0)')).toEqual({ low: 3.5, high: 5, text: '3.5 - 5.0' });
    expect(parseReference('≥ 60')).toMatchObject({ low: 60, high: null });
    expect(parseReference(null)).toEqual({ low: null, high: null, text: null });
    expect(parseReference('Normal: up to 40')).toMatchObject({ high: 40, low: null });
    expect(parseReference('above 60')).toMatchObject({ low: 60, high: null });
  });

  it('reads Philippine-style rows: two unit systems, flags before ranges, labelled ranges, OCR misreads, thousands', () => {
    const rows = parseLabReport(`CLINICAL CHEMISTRY
Fasting Blood Sugar 104 mg/dL 5.78 mmol/L 70 - 100 mg/dL H
Cholesterol, Total 210 mg/dL Desirable: <200
Triglycerides 1.9 mmoI/L H 0.3 - 1.7
SGPT (ALT) 45 U/L 0 - 41 H
HbA1c 7.2 % 4.0 - 6.0 HPLC
Platelet Count 250,000 /uL 150,000 - 400,000`);
    expect(rows.map((r) => [r.analyte, r.valueNum, r.unit, r.refLow, r.refHigh, r.flag])).toEqual([
      ['Fasting Blood Sugar', 104, 'mg/dL', 70, 100, 'H'],
      ['Cholesterol, Total', 210, 'mg/dL', null, 200, null],
      ['Triglycerides', 1.9, 'mmol/L', 0.3, 1.7, 'H'],
      ['SGPT (ALT)', 45, 'U/L', 0, 41, 'H'],
      ['HbA1c', 7.2, '%', 4, 6, null],
      ['Platelet Count', 250000, '/uL', 150000, 400000, null],
    ]);
    expect(rows.map((r) => r.biomarkerId)).toEqual(['fbs', 'total-cholesterol', 'triglycerides', 'alt', 'hba1c', null]);
    expect(rows.every((r) => r.confidence === 'high')).toBe(true);
  });

  it('splits two tests printed side by side on one line', () => {
    expect(parseRowLines('Glucose 104 mg/dL 70-100 Cholesterol 190 mg/dL <200').map((r) => [r.analyte, r.valueNum, r.refText])).toEqual([
      ['Glucose', 104, '70-100'],
      ['Cholesterol', 190, '<200'],
    ]);
  });

  it('keeps codes in names and leaves dates, prose and bare reference lines alone', () => {
    expect(parseRowLine('CA 19-9 12 U/mL 0 - 37')).toMatchObject({ analyte: 'CA 19-9', valueNum: 12, unit: 'U/mL', refHigh: 37 });
    expect(parseRowLine('25-OH Vitamin D 30 ng/mL 30 - 100')).toMatchObject({ analyte: '25-OH Vitamin D', valueNum: 30, unit: 'ng/mL' });
    expect(parseRowLine('WBC 7.5 x 10^9/L 4.0 - 11.0')).toMatchObject({ valueNum: 7.5, unit: 'x10^9/L', refLow: 4, refHigh: 11 });
    expect(parseRowLine('Collected 10/01/2026 08:15')).toBeNull();
    expect(parseRowLine('Your glucose was measured at 104 mg/dL')).toBeNull();
    expect(parseRowLine('Glucose 70 - 100 mg/dL')).toBeNull();
    expect(parseRowLine('Tel 09171234567')).toBeNull();
  });
});

describe('grounding', () => {
  it('keeps only values present in the source text', () => {
    expect(isGrounded('Metformin HCl', LABEL)).toBe(true);
    expect(isGrounded('500 mg', LABEL)).toBe(true);
    expect(isGrounded('1000 mg', LABEL)).toBe(false);
    const { kept, dropped } = groundFields({ name: 'Metformin', strength: '850 mg', prescriber: 'Dr. Maria Example' }, LABEL);
    expect(kept).toEqual({ name: 'Metformin', prescriber: 'Dr. Maria Example' });
    expect(dropped).toEqual(['strength']);
  });
});

describe('OCR layout', () => {
  it('re-joins table columns that OCR returned as separate blocks', () => {
    const rows = linesToRows([
      { text: 'HbA1c', frame: { left: 10, top: 100, width: 60, height: 20 } },
      { text: 'LDL Cholesterol', frame: { left: 10, top: 130, width: 120, height: 20 } },
      { text: '7.2 %', frame: { left: 200, top: 102, width: 40, height: 20 } },
      { text: '104 mg/dL', frame: { left: 200, top: 131, width: 70, height: 20 } },
      { text: '4.0-5.6', frame: { left: 320, top: 99, width: 50, height: 20 } },
    ]);
    expect(rows).toEqual(['HbA1c 7.2 % 4.0-5.6', 'LDL Cholesterol 104 mg/dL']);
  });

  it('keeps reading order when there is no geometry', () => {
    expect(linesToRows([{ text: 'a' }, { text: ' b ' }])).toEqual(['a', 'b']);
  });
});

/** Fake on-device model that returns a fixed JSON reply. */
function fakeEngine(reply: string): InferenceEngine & { calls: { messages: ChatMessage[]; opts: GenerateOptions }[] } {
  const calls: { messages: ChatMessage[]; opts: GenerateOptions }[] = [];
  return {
    id: 'fake',
    label: 'Fake model',
    runsOnDevice: true,
    calls,
    isReady: () => true,
    stop: async () => undefined,
    generate: async (messages, opts) => {
      calls.push({ messages, opts });
      return { text: reply, tokens: 10, durationMs: 5, tokensPerSecond: null, interrupted: false };
    },
  };
}

describe('grounded AI extraction', () => {
  const SMUDGED = `GLIPIZIDE
5 MG
TAKE ONE TABLET BY MOUTH
EVERY MORNING WITH BREAKFAST
QTY 30`;

  it('does not call the model when the parser already read every field', async () => {
    const engine = fakeEngine('{}');
    const { meta } = await extractLabel(LABEL, engine);
    expect(engine.calls).toHaveLength(0);
    expect(meta.usedModel).toBe(false);
  });

  it('fills missing fields with model output only when it appears in the scanned text', async () => {
    const engine = fakeEngine(
      JSON.stringify({ name: 'Glipizide', strength: '10 mg', form: 'tablet', instructions: 'Take one tablet by mouth every morning with breakfast', quantity: '30', prescriber: 'Dr. Invented Person' }),
    );
    const { draft, meta } = await extractLabel(SMUDGED, engine);
    expect(engine.calls[0].opts.jsonSchema).toBeDefined();
    expect(engine.calls[0].opts.temperature).toBe(0);
    expect(draft.name).toBe('Glipizide');
    expect(draft.instructions).toBe('Take one tablet by mouth every morning with breakfast');
    expect(draft.suggestedTimes).toEqual(['08:00']);
    // The parser read "5 MG"; the model's "10 mg" never replaces parser output.
    expect(draft.strength).toBe('5 mg');
    expect(meta.aiDropped).toContain('prescriber');
    expect(draft.prescriber).toBeNull();
  });

  it('adds lab rows the parser missed, dropping any not printed on the report', async () => {
    const text = `TSH (thyroid) result: 2.1 mIU/L normal 0.4 to 4.0\nPotassium 4.6 mmol/L 3.5-5.1`;
    const engine = fakeEngine(
      JSON.stringify({
        results: [
          { analyte: 'TSH', value: '2.1', unit: 'mIU/L', reference: '0.4 to 4.0', flag: '' },
          { analyte: 'Vitamin D', value: '31', unit: 'ng/mL', reference: '30-100', flag: '' },
        ],
      }),
    );
    const { rows, meta } = await extractLabReport(text, engine);
    expect(rows.map((r) => r.analyte)).toEqual(['Potassium', 'TSH']);
    expect(rows[1]).toMatchObject({ valueNum: 2.1, unit: 'mIU/L', refLow: 0.4, refHigh: 4 });
    expect(meta.aiFilled).toEqual(['TSH']);
    expect(meta.aiDropped).toEqual(['Vitamin D']);
  });

  it('survives malformed model output', async () => {
    expect(parseJsonObject('sure! {"a": 1} hope that helps')).toEqual({ a: 1 });
    expect(parseJsonObject('no json')).toBeNull();
    const { draft, meta } = await extractLabel(SMUDGED, fakeEngine('not json'));
    expect(draft.strength).toBe('5 mg');
    expect(meta.note).toMatch(/did not return readable output/);
  });
});
