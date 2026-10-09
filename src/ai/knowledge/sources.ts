/**
 * Bibliography for the offline reference library and escalation rules.
 * Every article and rule cites one or more of these. Content derived from them is paraphrased
 * education, labelled "Draft — pending clinical review" until a licensed clinician signs off.
 */
export interface ReferenceSource {
  id: string;
  title: string;
  publisher: string;
  year: number;
  url: string;
}

export const SOURCES: Record<string, ReferenceSource> = {
  'ada-soc': {
    id: 'ada-soc',
    title: 'Standards of Care in Diabetes—2025',
    publisher: 'American Diabetes Association (Diabetes Care, Vol. 48, Suppl. 1)',
    year: 2025,
    url: 'https://diabetesjournals.org/care/issue/48/Supplement_1',
  },
  'ada-soc-hypoglycemia': {
    id: 'ada-soc-hypoglycemia',
    title: 'Standards of Care in Diabetes—2025, Section 6: Glycemic Goals and Hypoglycemia',
    publisher: 'American Diabetes Association',
    year: 2025,
    url: 'https://diabetesjournals.org/care/article/48/Supplement_1/S128/157561',
  },
  'ada-soc-hyperglycemic-crises': {
    id: 'ada-soc-hyperglycemic-crises',
    title: 'Hyperglycemic Crises in Adults With Diabetes: A Consensus Report',
    publisher: 'ADA / EASD / JBDS / AACE / DTS (Diabetes Care 2024;47:1257–1275)',
    year: 2024,
    url: 'https://diabetesjournals.org/care/article/47/8/1257/156808',
  },
  'ish-2020': {
    id: 'ish-2020',
    title: '2020 International Society of Hypertension Global Hypertension Practice Guidelines',
    publisher: 'International Society of Hypertension (Hypertension 2020;75:1334–1357)',
    year: 2020,
    url: 'https://www.ahajournals.org/doi/10.1161/HYPERTENSIONAHA.120.15026',
  },
  'esc-2024-bp': {
    id: 'esc-2024-bp',
    title: '2024 ESC Guidelines for the management of elevated blood pressure and hypertension',
    publisher: 'European Society of Cardiology (European Heart Journal 2024)',
    year: 2024,
    url: 'https://academic.oup.com/eurheartj/article/45/38/3912/7741010',
  },
  'aha-hypertensive-crisis': {
    id: 'aha-hypertensive-crisis',
    title: 'Hypertensive Crisis: When You Should Call 911 for High Blood Pressure',
    publisher: 'American Heart Association (patient education)',
    year: 2024,
    url: 'https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings/hypertensive-crisis-when-you-should-call-911-for-high-blood-pressure',
  },
  'aha-low-bp': {
    id: 'aha-low-bp',
    title: 'Low Blood Pressure – When Blood Pressure Is Too Low',
    publisher: 'American Heart Association (patient education)',
    year: 2024,
    url: 'https://www.heart.org/en/health-topics/high-blood-pressure/the-facts-about-high-blood-pressure/low-blood-pressure-when-blood-pressure-is-too-low',
  },
  'aha-heart-rate': {
    id: 'aha-heart-rate',
    title: 'All About Heart Rate (Pulse)',
    publisher: 'American Heart Association (patient education)',
    year: 2024,
    url: 'https://www.heart.org/en/health-topics/high-blood-pressure/the-facts-about-high-blood-pressure/all-about-heart-rate-pulse',
  },
  'who-pulse-oximetry': {
    id: 'who-pulse-oximetry',
    title: 'Pulse Oximetry Training Manual',
    publisher: 'World Health Organization',
    year: 2011,
    url: 'https://www.who.int/publications/i/item/WHO-IER-PSP-2011.1',
  },
  'who-hearts': {
    id: 'who-hearts',
    title: 'HEARTS: Technical package for cardiovascular disease management in primary health care',
    publisher: 'World Health Organization',
    year: 2020,
    url: 'https://www.who.int/publications/i/item/9789240001367',
  },
  'who-diabetes': {
    id: 'who-diabetes',
    title: 'Diabetes — fact sheet',
    publisher: 'World Health Organization',
    year: 2024,
    url: 'https://www.who.int/news-room/fact-sheets/detail/diabetes',
  },
  'who-fever-guidance': {
    id: 'who-fever-guidance',
    title: 'IMAI District Clinician Manual: Hospital care for adolescents and adults',
    publisher: 'World Health Organization',
    year: 2011,
    url: 'https://www.who.int/publications/i/item/9789241548290',
  },
  'who-emergency-care': {
    id: 'who-emergency-care',
    title: 'Basic Emergency Care: approach to the acutely ill and injured',
    publisher: 'World Health Organization / ICRC',
    year: 2018,
    url: 'https://www.who.int/publications/i/item/basic-emergency-care-approach-to-the-acutely-ill-and-injured',
  },
  'ngsp-ifcc': {
    id: 'ngsp-ifcc',
    title: 'IFCC–NGSP HbA1c master equation (NGSP % = 0.09148 × IFCC mmol/mol + 2.152)',
    publisher: 'NGSP / IFCC',
    year: 2010,
    url: 'https://ngsp.org/ifcc.asp',
  },
  'kdigo-2024': {
    id: 'kdigo-2024',
    title: 'KDIGO 2024 Clinical Practice Guideline for the Evaluation and Management of CKD',
    publisher: 'Kidney Disease: Improving Global Outcomes',
    year: 2024,
    url: 'https://kdigo.org/guidelines/ckd-evaluation-and-management/',
  },
  'who-adherence': {
    id: 'who-adherence',
    title: 'Adherence to long-term therapies: evidence for action',
    publisher: 'World Health Organization',
    year: 2003,
    url: 'https://www.who.int/publications/i/item/9241545992',
  },
  'nhlbi-atp3': {
    id: 'nhlbi-atp3',
    title: 'Third Report of the National Cholesterol Education Program (NCEP) Expert Panel (ATP III), Final Report',
    publisher: 'National Heart, Lung, and Blood Institute, NIH (Circulation 2002;106:3143–3421)',
    year: 2002,
    url: 'https://www.nhlbi.nih.gov/files/docs/resources/heart/atp3full.pdf',
  },
  'medlineplus-labs': {
    id: 'medlineplus-labs',
    title: 'Medical Tests (typical laboratory reference ranges for adults)',
    publisher: 'MedlinePlus, U.S. National Library of Medicine',
    year: 2025,
    url: 'https://medlineplus.gov/lab-tests/',
  },
  'who-haemoglobin': {
    id: 'who-haemoglobin',
    title: 'Guideline on haemoglobin cutoffs to define anaemia in individuals and populations',
    publisher: 'World Health Organization',
    year: 2024,
    url: 'https://www.who.int/publications/i/item/9789240088542',
  },
};

export function getSource(id: string): ReferenceSource | null {
  return SOURCES[id] ?? null;
}
