import { BIOMARKERS, describeBands, findBiomarker, getBiomarker, placeValue } from '@/ai/knowledge/biomarkers';
import { getSource } from '@/ai/knowledge/sources';
import { parseReportedValue } from '@/ai/reported';

describe('stated values in the chat', () => {
  it.each([
    ['my hba1c is 4,7', { kind: 'lab', biomarker: { id: 'hba1c' }, value: 4.7, unit: '%' }],
    ['HbA1c came back at 48 mmol/mol', { kind: 'lab', biomarker: { id: 'hba1c' }, value: 48, unit: 'mmol/mol' }],
    ['a1c 7.2%', { kind: 'lab', biomarker: { id: 'hba1c' }, value: 7.2, unit: '%' }],
    ['my LDL cholesterol was 104', { kind: 'lab', biomarker: { id: 'ldl' }, value: 104, unit: 'mg/dL' }],
    ['ldl 2.6', { kind: 'lab', biomarker: { id: 'ldl' }, value: 2.6, unit: 'mmol/L' }],
    ['egfr 78', { kind: 'lab', biomarker: { id: 'egfr' }, value: 78, unit: 'mL/min/1.73m²' }],
    ['uacr is 18 mg/g', { kind: 'lab', biomarker: { id: 'uacr' }, value: 18, unit: 'mg/g' }],
    ['total cholesterol 210 mg/dl', { kind: 'lab', biomarker: { id: 'total-cholesterol' }, value: 210, unit: 'mg/dL' }],
    ['my creatinine is 1.1', { kind: 'lab', biomarker: { id: 'creatinine' }, value: 1.1, unit: 'mg/dL' }],
    ['potassium 4.6', { kind: 'lab', biomarker: { id: 'potassium' }, value: 4.6, unit: 'mmol/L' }],
    ['sgpt 45', { kind: 'lab', biomarker: { id: 'alt' }, value: 45, unit: 'U/L' }],
  ])('%p', (text, expected) => {
    expect(parseReportedValue(text)).toMatchObject(expected);
  });

  it('treats blood sugar tests as readings, including Philippine lab shorthand', () => {
    expect(parseReportedValue('fbs 5.6 this morning')).toMatchObject({ kind: 'reading', reading: { type: 'glucose', value: 5.6, unit: 'mmol/L', context: 'fasting' } });
    expect(parseReportedValue('my rbs was 180')).toMatchObject({ kind: 'reading', reading: { type: 'glucose', value: 180, unit: 'mg/dL', context: 'random' } });
    expect(parseReportedValue('my sugar is 145 after lunch')).toMatchObject({ kind: 'reading', reading: { type: 'glucose', value: 145, unit: 'mg/dL', context: 'after_meal' } });
    expect(parseReportedValue('bp 130/85 pulse 72')).toMatchObject({ kind: 'reading', reading: { type: 'blood_pressure', systolic: 130, diastolic: 85, pulse: 72 } });
  });

  it('ignores questions without a value and conversions', () => {
    expect(parseReportedValue('what is hba1c')).toBeNull();
    expect(parseReportedValue('what were my latest lab results?')).toBeNull();
    expect(parseReportedValue('convert 7.2 mmol/L to mg/dL')).toBeNull();
    expect(parseReportedValue('how has my blood pressure been this month?')).toBeNull();
    expect(parseReportedValue('is my cholesterol ok')).toBeNull();
  });
});

describe('biomarker catalog', () => {
  it('finds tests by alias, preferring the longer match', () => {
    expect(findBiomarker('LDL Cholesterol')?.biomarker.id).toBe('ldl');
    expect(findBiomarker('Cholesterol, Total')?.biomarker.id).toBe('total-cholesterol');
    expect(findBiomarker('Glucose, Fasting')?.biomarker.id).toBe('fbs');
    expect(findBiomarker('SGOT')?.biomarker.id).toBe('ast');
    expect(findBiomarker('Vitamin D')).toBeNull();
  });

  it('places HbA1c values against the ADA thresholds', () => {
    const hba1c = getBiomarker('hba1c');
    expect(hba1c).not.toBeNull();
    if (!hba1c) return;
    expect(placeValue(hba1c, 4.7, '%')?.index).toBe(0);
    expect(placeValue(hba1c, 5.7, '%')?.index).toBe(1);
    expect(placeValue(hba1c, 6.4, '%')?.index).toBe(1);
    expect(placeValue(hba1c, 6.5, '%')?.index).toBe(2);
    expect(placeValue(hba1c, 48, 'mmol/mol')).toMatchObject({ canonicalValue: 6.5, index: 2 });
    expect(placeValue(hba1c, 4.7, 'mg/dL')).toBeNull();
    expect(describeBands(hba1c)).toMatch(/^below 5\.7 %: below the range ADA uses for prediabetes; 5\.7 to below 6\.5 %/);
  });

  it('converts units before placing a value', () => {
    expect(placeValue(getBiomarker('ldl')!, 2.6, 'mmol/L')).toMatchObject({ canonicalValue: 101, index: 2 });
    expect(placeValue(getBiomarker('egfr')!, 78, 'mL/min/1.73m²')?.band.label).toMatch(/G2/);
    expect(placeValue(getBiomarker('uacr')!, 18, 'mg/g')?.band.label).toMatch(/A1/);
    expect(placeValue(getBiomarker('hemoglobin')!, 125, 'g/L')).toMatchObject({ canonicalValue: 12.5, index: 1 });
  });

  it('never labels a band as normal or safe, and cites only known sources', () => {
    for (const b of BIOMARKERS) {
      expect(b.units.length).toBeGreaterThan(0);
      if (!b.reference) continue;
      for (const band of b.reference.bands) {
        expect(band.label).not.toMatch(/\b(normal|safe|fine|healthy)\b/i);
        expect(band.say).not.toMatch(/\b(normal|safe|fine|healthy)\b/i);
        expect(band.say.length).toBeLessThan(60);
      }
      expect(new Set(b.reference.bands.map((band) => band.say)).size).toBe(b.reference.bands.length);
      for (const id of b.reference.sourceIds) expect(getSource(id)).not.toBeNull();
      // Bands must be ascending and contiguous.
      for (let i = 1; i < b.reference.bands.length; i++) expect(b.reference.bands[i].low).toBe(b.reference.bands[i - 1].high);
    }
  });
});
