/**
 * Biomarker catalog: the lab tests people commonly bring home on a report, with their usual units
 * and published reference scales. One source of truth for entering results, reading scanned
 * reports, and understanding values typed into the chat.
 *
 * Reference bands are [low, high) in the canonical unit. Labels name the band the way the cited
 * source does and never say "normal", "safe" or "fine". Everything here is general reference, not
 * personalised, and DRAFT pending clinical review. The range printed on a person's own report, and
 * targets set by their clinician, take precedence.
 */
export interface ReferenceBand {
  label: string;
  low: number | null;
  high: number | null;
}

export interface BiomarkerReference {
  bands: ReferenceBand[];
  /** Who the scale applies to and its limits, in one or two sentences. */
  note: string;
  sourceIds: string[];
}

export type BiomarkerCategory = 'glucose' | 'lipids' | 'kidney' | 'liver' | 'electrolytes' | 'blood' | 'thyroid' | 'other';

export interface Biomarker {
  id: string;
  name: string;
  /** Lower-case words and abbreviations that identify this test in text (chat, OCR, labels). */
  aliases: string[];
  category: BiomarkerCategory;
  /** Units people see on reports; the first is canonical (reference bands use it). */
  units: string[];
  decimals: number;
  /** Converts a value in any listed unit into the canonical unit; null when not convertible. */
  convert?: (value: number, fromUnit: string) => number | null;
  reference: BiomarkerReference | null;
  /** Library article that explains the test, when there is one. */
  articleId: string | null;
  /** Tests FAITH tracks as vitals rather than lab results (meter-style glucose). */
  readingType?: 'glucose';
  readingContext?: 'fasting' | 'random';
}

export const CATEGORY_LABEL: Record<BiomarkerCategory, string> = {
  glucose: 'Blood sugar',
  lipids: 'Cholesterol and fats',
  kidney: 'Kidney',
  liver: 'Liver',
  electrolytes: 'Salts (electrolytes)',
  blood: 'Blood count',
  thyroid: 'Thyroid',
  other: 'Other',
};

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;
const linear = (factors: Record<string, number>, decimals: number) => (value: number, fromUnit: string) =>
  fromUnit in factors ? round(value * factors[fromUnit], decimals) : null;

// Order matters for alias matching: LDL and HDL before the generic "cholesterol".
export const BIOMARKERS: Biomarker[] = [
  {
    id: 'hba1c',
    name: 'HbA1c',
    aliases: ['hba1c', 'a1c', 'hb a1c', 'glycated hemoglobin', 'glycated haemoglobin', 'glycosylated hemoglobin', 'hemoglobin a1c', 'haemoglobin a1c'],
    category: 'glucose',
    units: ['%', 'mmol/mol'],
    decimals: 1,
    convert: (v, u) => (u === '%' ? v : u === 'mmol/mol' ? round(v / 10.929 + 2.15, 1) : null),
    reference: {
      bands: [
        { label: 'below the range ADA uses for prediabetes', low: null, high: 5.7 },
        { label: 'the range ADA uses for prediabetes', low: 5.7, high: 6.5 },
        { label: 'the range ADA uses to diagnose diabetes, when confirmed by repeat testing', low: 6.5, high: null },
      ],
      note: 'ADA diagnostic thresholds for people not already diagnosed. For many non-pregnant adults who have diabetes, ADA cites a general goal below 7%; individual goals vary.',
      sourceIds: ['ada-soc'],
    },
    articleId: 'hba1c',
  },
  {
    id: 'fbs',
    name: 'Fasting blood sugar (FBS)',
    aliases: ['fbs', 'fasting blood sugar', 'fasting glucose', 'fasting plasma glucose', 'fpg', 'fasting sugar', 'glucose, fasting', 'glucose fasting'],
    category: 'glucose',
    units: ['mg/dL', 'mmol/L'],
    decimals: 0,
    convert: linear({ 'mg/dL': 1, 'mmol/L': 18.0182 }, 0),
    reference: {
      bands: [
        { label: 'below 70 mg/dL, the level guidelines treat as low (hypoglycaemia)', low: null, high: 70 },
        { label: 'the fasting range ADA cites for people without diabetes', low: 70, high: 100 },
        { label: 'the range ADA uses for prediabetes (impaired fasting glucose)', low: 100, high: 126 },
        { label: 'the range ADA uses to diagnose diabetes, when confirmed by repeat testing', low: 126, high: null },
      ],
      note: 'ADA diagnostic thresholds for a fasting laboratory test. For many adults who have diabetes, the general pre-meal target is 80–130 mg/dL (4.4–7.2 mmol/L); your clinician may set another.',
      sourceIds: ['ada-soc'],
    },
    articleId: 'fasting-glucose',
    readingType: 'glucose',
    readingContext: 'fasting',
  },
  {
    id: 'rbs',
    name: 'Random blood sugar (RBS)',
    aliases: ['rbs', 'random blood sugar', 'random glucose', 'random plasma glucose', 'cbg', 'hgt', 'capillary blood glucose'],
    category: 'glucose',
    units: ['mg/dL', 'mmol/L'],
    decimals: 0,
    convert: linear({ 'mg/dL': 1, 'mmol/L': 18.0182 }, 0),
    reference: {
      bands: [
        { label: 'below 70 mg/dL, the level guidelines treat as low (hypoglycaemia)', low: null, high: 70 },
        { label: 'below the 200 mg/dL level ADA uses, with symptoms, to diagnose diabetes', low: 70, high: 200 },
        { label: 'at or above 200 mg/dL, the random-glucose level ADA uses, together with symptoms, to diagnose diabetes', low: 200, high: null },
      ],
      note: 'A random reading depends on when you last ate. For many adults who have diabetes, the general after-meal peak target is below 180 mg/dL (10.0 mmol/L).',
      sourceIds: ['ada-soc'],
    },
    articleId: 'post-meal-glucose',
    readingType: 'glucose',
    readingContext: 'random',
  },
  {
    id: 'ldl',
    name: 'LDL cholesterol',
    aliases: ['ldl', 'ldl cholesterol', 'ldl-c', 'low density lipoprotein', 'bad cholesterol'],
    category: 'lipids',
    units: ['mg/dL', 'mmol/L'],
    decimals: 0,
    convert: linear({ 'mg/dL': 1, 'mmol/L': 38.67 }, 0),
    reference: {
      bands: [
        { label: 'below 70 mg/dL, the ADA goal for adults with diabetes and established heart or vessel disease', low: null, high: 70 },
        { label: 'below 100 mg/dL, the ADA goal for many adults with diabetes without heart disease', low: 70, high: 100 },
        { label: 'at or above 100 mg/dL, above the general ADA goal for adults with diabetes', low: 100, high: 160 },
        { label: '160 mg/dL and above, the level NCEP labels high', low: 160, high: null },
      ],
      note: 'LDL goals depend on overall cardiovascular risk and are set individually; statin decisions are for your clinician.',
      sourceIds: ['ada-soc', 'nhlbi-atp3'],
    },
    articleId: 'lipids',
  },
  {
    id: 'hdl',
    name: 'HDL cholesterol',
    aliases: ['hdl', 'hdl cholesterol', 'hdl-c', 'high density lipoprotein', 'good cholesterol'],
    category: 'lipids',
    units: ['mg/dL', 'mmol/L'],
    decimals: 0,
    convert: linear({ 'mg/dL': 1, 'mmol/L': 38.67 }, 0),
    reference: {
      bands: [
        { label: 'below 40 mg/dL, the level NCEP labels low', low: null, high: 40 },
        { label: '40 to below 60 mg/dL', low: 40, high: 60 },
        { label: '60 mg/dL and above, the level NCEP labels high (protective)', low: 60, high: null },
      ],
      note: 'ADA cites general goals above 40 mg/dL for men and above 50 mg/dL for women.',
      sourceIds: ['nhlbi-atp3', 'ada-soc'],
    },
    articleId: 'lipids',
  },
  {
    id: 'triglycerides',
    name: 'Triglycerides',
    aliases: ['triglycerides', 'triglyceride', 'tg', 'trig'],
    category: 'lipids',
    units: ['mg/dL', 'mmol/L'],
    decimals: 0,
    convert: linear({ 'mg/dL': 1, 'mmol/L': 88.57 }, 0),
    reference: {
      bands: [
        { label: 'below 150 mg/dL, the level NCEP and ADA cite as the general goal', low: null, high: 150 },
        { label: '150 to below 200 mg/dL, the range NCEP labels borderline high', low: 150, high: 200 },
        { label: '200 to below 500 mg/dL, the range NCEP labels high', low: 200, high: 500 },
        { label: '500 mg/dL and above, the level NCEP labels very high', low: 500, high: null },
      ],
      note: 'Triglycerides are usually measured fasting; a recent meal raises them.',
      sourceIds: ['nhlbi-atp3', 'ada-soc'],
    },
    articleId: 'lipids',
  },
  {
    id: 'total-cholesterol',
    name: 'Total cholesterol',
    aliases: ['total cholesterol', 'cholesterol', 'cholesterol total', 'cholesterol, total', 'tc'],
    category: 'lipids',
    units: ['mg/dL', 'mmol/L'],
    decimals: 0,
    convert: linear({ 'mg/dL': 1, 'mmol/L': 38.67 }, 0),
    reference: {
      bands: [
        { label: 'below 200 mg/dL, the level NCEP labels desirable', low: null, high: 200 },
        { label: '200 to below 240 mg/dL, the range NCEP labels borderline high', low: 200, high: 240 },
        { label: '240 mg/dL and above, the level NCEP labels high', low: 240, high: null },
      ],
      note: 'Total cholesterol is read together with LDL, HDL and triglycerides.',
      sourceIds: ['nhlbi-atp3'],
    },
    articleId: 'lipids',
  },
  {
    id: 'creatinine',
    name: 'Creatinine',
    aliases: ['creatinine', 'crea', 'serum creatinine'],
    category: 'kidney',
    units: ['mg/dL', 'µmol/L'],
    decimals: 2,
    convert: linear({ 'mg/dL': 1, 'µmol/L': 1 / 88.4 }, 2),
    reference: {
      bands: [
        { label: 'below the typical adult laboratory range (about 0.6–1.2 mg/dL)', low: null, high: 0.6 },
        { label: 'within the typical adult laboratory range (about 0.6–1.2 mg/dL)', low: 0.6, high: 1.3 },
        { label: 'above the typical adult laboratory range (about 0.6–1.2 mg/dL)', low: 1.3, high: null },
      ],
      note: 'Creatinine depends on muscle mass, age and sex, and laboratories print their own range; kidney function is judged from eGFR and urine albumin, not creatinine alone.',
      sourceIds: ['medlineplus-labs'],
    },
    articleId: 'egfr',
  },
  {
    id: 'egfr',
    name: 'eGFR (kidney filtration)',
    aliases: ['egfr', 'gfr', 'estimated gfr', 'glomerular filtration rate'],
    category: 'kidney',
    units: ['mL/min/1.73m²'],
    decimals: 0,
    reference: {
      bands: [
        { label: 'KDIGO G5, kidney failure (below 15)', low: null, high: 15 },
        { label: 'KDIGO G4, severely decreased (15–29)', low: 15, high: 30 },
        { label: 'KDIGO G3b, moderately to severely decreased (30–44)', low: 30, high: 45 },
        { label: 'KDIGO G3a, mildly to moderately decreased (45–59)', low: 45, high: 60 },
        { label: 'KDIGO G2, mildly decreased (60–89)', low: 60, high: 90 },
        { label: 'KDIGO G1, 90 and above', low: 90, high: null },
      ],
      note: 'KDIGO stages apply when a result persists for more than 3 months and are read together with urine albumin (UACR). A single result can vary with hydration, diet and muscle mass.',
      sourceIds: ['kdigo-2024'],
    },
    articleId: 'egfr',
  },
  {
    id: 'uacr',
    name: 'Urine albumin-creatinine ratio (UACR)',
    aliases: ['uacr', 'acr', 'microalbumin', 'urine albumin', 'albumin creatinine ratio', 'albumin to creatinine ratio', 'urine albumin-creatinine ratio', 'urine albumin/creatinine'],
    category: 'kidney',
    units: ['mg/g', 'mg/mmol'],
    decimals: 0,
    convert: linear({ 'mg/g': 1, 'mg/mmol': 8.84 }, 0),
    reference: {
      bands: [
        { label: 'KDIGO A1, below 30 mg/g', low: null, high: 30 },
        { label: 'KDIGO A2, moderately increased (30–300 mg/g)', low: 30, high: 300 },
        { label: 'KDIGO A3, severely increased (above 300 mg/g)', low: 300, high: null },
      ],
      note: 'KDIGO categories apply when a result persists on repeat testing; exercise, infection and fever can raise a single result.',
      sourceIds: ['kdigo-2024', 'ada-soc'],
    },
    articleId: 'uacr',
  },
  {
    id: 'bun',
    name: 'Blood urea nitrogen (BUN)',
    aliases: ['bun', 'blood urea nitrogen', 'urea nitrogen', 'urea'],
    category: 'kidney',
    units: ['mg/dL', 'mmol/L'],
    decimals: 0,
    convert: linear({ 'mg/dL': 1, 'mmol/L': 2.8 }, 0),
    reference: {
      bands: [
        { label: 'below the typical adult laboratory range (about 7–20 mg/dL)', low: null, high: 7 },
        { label: 'within the typical adult laboratory range (about 7–20 mg/dL)', low: 7, high: 21 },
        { label: 'above the typical adult laboratory range (about 7–20 mg/dL)', low: 21, high: null },
      ],
      note: 'Laboratories print their own range; dehydration, diet and some medicines change BUN.',
      sourceIds: ['medlineplus-labs'],
    },
    articleId: 'egfr',
  },
  {
    id: 'uric-acid',
    name: 'Uric acid',
    aliases: ['uric acid', 'urate', 'blood uric acid'],
    category: 'kidney',
    units: ['mg/dL', 'µmol/L'],
    decimals: 1,
    convert: linear({ 'mg/dL': 1, 'µmol/L': 1 / 59.48 }, 1),
    reference: {
      bands: [
        { label: 'below the typical adult laboratory range (about 3.5–7.2 mg/dL)', low: null, high: 3.5 },
        { label: 'within the typical adult laboratory range (about 3.5–7.2 mg/dL)', low: 3.5, high: 7.3 },
        { label: 'above the typical adult laboratory range (about 3.5–7.2 mg/dL)', low: 7.3, high: null },
      ],
      note: 'Typical ranges differ slightly for women and men and between laboratories; the printed range on your report takes precedence.',
      sourceIds: ['medlineplus-labs'],
    },
    articleId: null,
  },
  {
    id: 'alt',
    name: 'ALT / SGPT (liver)',
    aliases: ['alt', 'sgpt', 'alanine aminotransferase', 'alanine transaminase'],
    category: 'liver',
    units: ['U/L'],
    decimals: 0,
    reference: {
      bands: [
        { label: 'within the typical adult laboratory range (about 7–56 U/L)', low: null, high: 57 },
        { label: 'above the typical adult laboratory range (about 7–56 U/L)', low: 57, high: null },
      ],
      note: 'Laboratories print their own range; some medicines and a recent heavy meal or exercise can raise ALT.',
      sourceIds: ['medlineplus-labs'],
    },
    articleId: null,
  },
  {
    id: 'ast',
    name: 'AST / SGOT (liver)',
    aliases: ['ast', 'sgot', 'aspartate aminotransferase', 'aspartate transaminase'],
    category: 'liver',
    units: ['U/L'],
    decimals: 0,
    reference: {
      bands: [
        { label: 'within the typical adult laboratory range (about 8–33 U/L)', low: null, high: 34 },
        { label: 'above the typical adult laboratory range (about 8–33 U/L)', low: 34, high: null },
      ],
      note: 'Laboratories print their own range; AST also rises with muscle injury and intense exercise.',
      sourceIds: ['medlineplus-labs'],
    },
    articleId: null,
  },
  {
    id: 'sodium',
    name: 'Sodium (Na)',
    aliases: ['sodium', 'serum sodium', 'na+'],
    category: 'electrolytes',
    units: ['mmol/L'],
    decimals: 0,
    reference: {
      bands: [
        { label: 'below the typical adult laboratory range (135–145 mmol/L)', low: null, high: 135 },
        { label: 'within the typical adult laboratory range (135–145 mmol/L)', low: 135, high: 146 },
        { label: 'above the typical adult laboratory range (135–145 mmol/L)', low: 146, high: null },
      ],
      note: 'Laboratories print their own range; fluid balance and some medicines change sodium.',
      sourceIds: ['medlineplus-labs'],
    },
    articleId: null,
  },
  {
    id: 'potassium',
    name: 'Potassium (K)',
    aliases: ['potassium', 'serum potassium', 'k+'],
    category: 'electrolytes',
    units: ['mmol/L'],
    decimals: 1,
    reference: {
      bands: [
        { label: 'below the typical adult laboratory range (3.5–5.0 mmol/L)', low: null, high: 3.5 },
        { label: 'within the typical adult laboratory range (3.5–5.0 mmol/L)', low: 3.5, high: 5.1 },
        { label: 'above the typical adult laboratory range (3.5–5.0 mmol/L)', low: 5.1, high: null },
      ],
      note: 'Laboratories print their own range; several blood pressure and kidney medicines affect potassium, so results outside the range are for your clinician to judge promptly.',
      sourceIds: ['medlineplus-labs'],
    },
    articleId: null,
  },
  {
    id: 'hemoglobin',
    name: 'Hemoglobin (Hgb)',
    aliases: ['hemoglobin', 'haemoglobin', 'hgb', 'hb'],
    category: 'blood',
    units: ['g/dL', 'g/L'],
    decimals: 1,
    convert: linear({ 'g/dL': 1, 'g/L': 0.1 }, 1),
    reference: {
      bands: [
        { label: "below 12 g/dL, WHO's anaemia threshold for non-pregnant women (13 g/dL for men)", low: null, high: 12 },
        { label: "between WHO's thresholds for women (12 g/dL) and men (13 g/dL)", low: 12, high: 13 },
        { label: "at or above WHO's anaemia thresholds for both women and men", low: 13, high: null },
      ],
      note: 'WHO thresholds at sea level for adults; pregnancy and altitude change them.',
      sourceIds: ['who-haemoglobin'],
    },
    articleId: null,
  },
  {
    id: 'tsh',
    name: 'TSH (thyroid)',
    aliases: ['tsh', 'thyroid stimulating hormone', 'thyrotropin'],
    category: 'thyroid',
    units: ['mIU/L'],
    decimals: 2,
    reference: {
      bands: [
        { label: 'below the typical adult laboratory range (about 0.4–4.0 mIU/L)', low: null, high: 0.4 },
        { label: 'within the typical adult laboratory range (about 0.4–4.0 mIU/L)', low: 0.4, high: 4.01 },
        { label: 'above the typical adult laboratory range (about 0.4–4.0 mIU/L)', low: 4.01, high: null },
      ],
      note: 'Laboratories print their own range, and targets differ during pregnancy and thyroid treatment.',
      sourceIds: ['medlineplus-labs'],
    },
    articleId: null,
  },
];

export function getBiomarker(id: string): Biomarker | null {
  return BIOMARKERS.find((b) => b.id === id) ?? null;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const ALIAS_PATTERNS = BIOMARKERS.map((b) => ({
  biomarker: b,
  re: new RegExp(`(^|[^a-z0-9])(${b.aliases.map(escape).join('|')})(?=$|[^a-z0-9])`, 'i'),
}));

/** Finds the biomarker a piece of text (a chat message, an OCR row, a stored analyte name) refers to. */
export function findBiomarker(text: string): { biomarker: Biomarker; index: number; length: number } | null {
  const t = text.toLowerCase();
  let best: { biomarker: Biomarker; index: number; length: number } | null = null;
  for (const { biomarker, re } of ALIAS_PATTERNS) {
    const m = re.exec(t);
    if (!m) continue;
    const index = m.index + m[1].length;
    // Prefer the earliest match; on a tie, the longer alias (so "ldl cholesterol" beats "cholesterol").
    if (!best || index < best.index || (index === best.index && m[2].length > best.length)) best = { biomarker, index, length: m[2].length };
  }
  return best;
}

export interface Placement {
  canonicalValue: number;
  canonicalUnit: string;
  band: ReferenceBand;
  index: number;
  reference: BiomarkerReference;
}

/** Converts into the canonical unit and finds the band; null when the unit is unknown or there is no scale. */
export function placeValue(biomarker: Biomarker, value: number, unit: string): Placement | null {
  if (!biomarker.reference) return null;
  const canonicalUnit = biomarker.units[0];
  const canonicalValue = unit === canonicalUnit ? value : (biomarker.convert?.(value, unit) ?? null);
  if (canonicalValue === null || !Number.isFinite(canonicalValue)) return null;
  const index = biomarker.reference.bands.findIndex((b) => (b.low === null || canonicalValue >= b.low) && (b.high === null || canonicalValue < b.high));
  if (index < 0) return null;
  return { canonicalValue, canonicalUnit, band: biomarker.reference.bands[index], index, reference: biomarker.reference };
}

export function describeBandRange(band: ReferenceBand, unit: string): string {
  if (band.low !== null && band.high !== null) return `${band.low} to below ${band.high} ${unit}`;
  if (band.high !== null) return `below ${band.high} ${unit}`;
  if (band.low !== null) return `${band.low} ${unit} and above`;
  return 'any value';
}

/** The whole scale as one sentence fragment, for the assistant's facts. */
export function describeBands(biomarker: Biomarker): string {
  if (!biomarker.reference) return '';
  return biomarker.reference.bands.map((b) => `${describeBandRange(b, biomarker.units[0])}: ${b.label}`).join('; ');
}

/** Biomarkers grouped for a picker, in a sensible order. */
export function biomarkersByCategory(): { category: BiomarkerCategory; label: string; items: Biomarker[] }[] {
  const order: BiomarkerCategory[] = ['glucose', 'lipids', 'kidney', 'liver', 'electrolytes', 'blood', 'thyroid', 'other'];
  return order.map((category) => ({ category, label: CATEGORY_LABEL[category], items: BIOMARKERS.filter((b) => b.category === category) })).filter((g) => g.items.length > 0);
}
