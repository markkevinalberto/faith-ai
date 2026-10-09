/**
 * Curated offline reference library (versioned). Plain-language education, paraphrased from the
 * cited sources. Status: DRAFT — pending clinical review. Never diagnostic or prescriptive.
 */
export const LIBRARY_VERSION = '2026.10.0-draft';
export const LIBRARY_AUTHORED_ON = '2026-10-09';

export interface KnowledgeArticle {
  id: string;
  title: string;
  aliases: string[];
  tags: string[];
  summary: string;
  body: string;
  sourceIds: string[];
  reviewStatus: 'draft_pending_clinical_review';
  authoredOn: string;
  lastClinicalReview: string | null;
}

const draft = { reviewStatus: 'draft_pending_clinical_review' as const, authoredOn: LIBRARY_AUTHORED_ON, lastClinicalReview: null };

export const LIBRARY: KnowledgeArticle[] = [
  {
    id: 'hba1c',
    title: 'HbA1c (A1C)',
    aliases: ['a1c', 'hba1c', 'glycated hemoglobin', 'glycated haemoglobin', 'haemoglobin a1c', 'hemoglobin a1c'],
    tags: ['diabetes', 'lab', 'glucose', 'hba1c'],
    summary: 'A blood test that reflects your average glucose over roughly the past 2–3 months.',
    body:
      'HbA1c measures how much glucose has attached to haemoglobin in red blood cells. Because red cells live for a few months, it reflects average glucose over roughly the previous 2–3 months rather than a single moment. It is reported as a percentage (NGSP) or in mmol/mol (IFCC); for example 7% corresponds to about 53 mmol/mol. Many adults with diabetes are given an individual HbA1c goal by their clinician — a commonly cited general goal is below 7%, but your own target may differ. Conditions affecting red blood cells (such as anaemia or recent blood loss) can make HbA1c less reliable.',
    sourceIds: ['ada-soc', 'ngsp-ifcc'],
    ...draft,
  },
  {
    id: 'fasting-glucose',
    title: 'Fasting glucose',
    aliases: ['fasting blood sugar', 'fasting sugar', 'fbs', 'fasting glucose', 'morning sugar', 'pre-meal glucose', 'before meal glucose'],
    tags: ['diabetes', 'glucose'],
    summary: 'A glucose reading taken after not eating for at least 8 hours, usually first thing in the morning.',
    body:
      'A fasting reading is taken after at least 8 hours without food or caloric drinks — usually before breakfast. For many non-pregnant adults with diabetes, guidelines describe a general pre-meal target of about 80–130 mg/dL (4.4–7.2 mmol/L), but targets are individual and your clinician may set a different range. Recording the reading context (fasting, before or after a meal) makes your history much easier to interpret.',
    sourceIds: ['ada-soc'],
    ...draft,
  },
  {
    id: 'post-meal-glucose',
    title: 'After-meal (postprandial) glucose',
    aliases: ['postprandial', 'post meal', 'after meal', 'after eating', '2 hour glucose', 'post-prandial'],
    tags: ['diabetes', 'glucose'],
    summary: 'A glucose reading taken 1–2 hours after starting a meal.',
    body:
      'After eating, glucose rises and then falls again. A postprandial reading is usually taken 1–2 hours after the start of a meal. Guidelines describe a general peak target below 180 mg/dL (10.0 mmol/L) for many non-pregnant adults with diabetes, though your clinician may set a different goal. Comparing before- and after-meal readings can help your care team understand how meals affect you.',
    sourceIds: ['ada-soc'],
    ...draft,
  },
  {
    id: 'hypoglycemia',
    title: 'Low glucose (hypoglycaemia)',
    aliases: ['hypo', 'hypoglycemia', 'hypoglycaemia', 'low sugar', 'low blood sugar', 'low glucose'],
    tags: ['diabetes', 'glucose', 'safety'],
    summary: 'Glucose below 70 mg/dL (3.9 mmol/L); below 54 mg/dL (3.0 mmol/L) is considered clinically significant.',
    body:
      'Guidelines classify low glucose in levels: below 70 mg/dL (3.9 mmol/L) is level 1, below 54 mg/dL (3.0 mmol/L) is level 2, and any low with confusion or needing someone else’s help is level 3 (severe). Symptoms can include shakiness, sweating, hunger, fast heartbeat, confusion or irritability. Many care plans use a "15-15" approach — about 15 g of fast-acting carbohydrate, then recheck after 15 minutes — but follow the specific plan your care team gave you. Severe hypoglycaemia is an emergency. Tell your clinician about repeated lows; your treatment may need review.',
    sourceIds: ['ada-soc-hypoglycemia'],
    ...draft,
  },
  {
    id: 'hyperglycemia',
    title: 'High glucose and ketones',
    aliases: ['hyperglycemia', 'hyperglycaemia', 'high sugar', 'high blood sugar', 'ketones', 'dka', 'ketoacidosis'],
    tags: ['diabetes', 'glucose', 'safety'],
    summary: 'Persistently high glucose can lead to dehydration and, in some people, a build-up of ketones.',
    body:
      'High glucose can cause thirst, frequent urination, tiredness and blurred vision. Very high levels — especially with vomiting, abdominal pain, deep or fast breathing, or drowsiness — can signal a hyperglycaemic emergency such as diabetic ketoacidosis (DKA) or hyperosmolar hyperglycaemic state, which need urgent care. Some care plans include checking ketones when glucose is above a set level or during illness. Follow your sick-day plan and contact your care team if readings stay high.',
    sourceIds: ['ada-soc-hyperglycemic-crises'],
    ...draft,
  },
  {
    id: 'blood-pressure-numbers',
    title: 'Blood pressure numbers',
    aliases: ['systolic', 'diastolic', 'blood pressure', 'bp', 'mmhg', 'top number', 'bottom number'],
    tags: ['hypertension', 'blood_pressure'],
    summary: 'Systolic (top) is pressure when the heart beats; diastolic (bottom) is pressure between beats.',
    body:
      'Blood pressure is written as two numbers in mmHg, such as 128/82. The first (systolic) is the pressure in your arteries when the heart contracts; the second (diastolic) is the pressure while the heart relaxes between beats. International guidelines generally define hypertension from repeated office readings of 140/90 mmHg or more (lower thresholds are used for home averages), and many adults on treatment are given a target below 130/80 if tolerated. Single readings vary a lot — averages of several home readings are more informative.',
    sourceIds: ['ish-2020', 'esc-2024-bp'],
    ...draft,
  },
  {
    id: 'home-bp-technique',
    title: 'Measuring blood pressure at home',
    aliases: ['how to measure blood pressure', 'home blood pressure', 'bp technique', 'cuff', 'measure bp'],
    tags: ['hypertension', 'blood_pressure', 'how-to'],
    summary: 'Rest 5 minutes, sit with back supported and arm at heart level, take 2 readings 1 minute apart.',
    body:
      'For reliable home readings: avoid caffeine, exercise and smoking for 30 minutes beforehand; empty your bladder; sit quietly for 5 minutes with your back supported, feet flat and arm resting at heart level; use a validated upper-arm cuff of the right size on bare skin; do not talk during the measurement. Take two readings about one minute apart, in the morning and evening, and record both. Guidelines suggest measuring over several days (for example 3–7) before a clinic review.',
    sourceIds: ['ish-2020', 'esc-2024-bp', 'who-hearts'],
    ...draft,
  },
  {
    id: 'hypertensive-crisis',
    title: 'Very high blood pressure (hypertensive crisis)',
    aliases: ['hypertensive crisis', 'hypertensive emergency', 'very high blood pressure', '180/120'],
    tags: ['hypertension', 'blood_pressure', 'safety'],
    summary: 'Readings of 180/120 mmHg or higher need prompt attention; with symptoms, it is an emergency.',
    body:
      'A reading of 180/120 mmHg or higher is often called a hypertensive crisis. If it comes with symptoms such as chest pain, shortness of breath, back pain, numbness or weakness, change in vision or difficulty speaking, call emergency services. Without symptoms, rest for a few minutes and measure again; if it is still this high, contact your clinician promptly. Do not change your medicines on your own.',
    sourceIds: ['aha-hypertensive-crisis', 'ish-2020'],
    ...draft,
  },
  {
    id: 'pulse',
    title: 'Pulse (heart rate)',
    aliases: ['pulse', 'heart rate', 'bpm', 'resting heart rate'],
    tags: ['pulse', 'heart'],
    summary: 'The number of heartbeats per minute; a commonly cited adult resting range is 60–100.',
    body:
      'Your pulse is the number of times your heart beats per minute (bpm). A commonly cited resting range for adults is 60–100 bpm, but fitness, medicines (such as beta-blockers) and illness affect it. Measure after sitting quietly for a few minutes. Tell your clinician about a resting pulse that is often outside your usual range, or one that feels irregular, especially with dizziness, fainting or chest discomfort.',
    sourceIds: ['aha-heart-rate'],
    ...draft,
  },
  {
    id: 'spo2',
    title: 'Oxygen saturation (SpO₂)',
    aliases: ['spo2', 'oxygen', 'oxygen saturation', 'pulse oximeter', 'o2 sat', 'sats'],
    tags: ['spo2'],
    summary: 'The percentage of haemoglobin carrying oxygen, measured with a finger pulse oximeter.',
    body:
      'A pulse oximeter estimates how much of your blood’s haemoglobin is carrying oxygen. In healthy adults at sea level it is typically 95% or higher. Cold fingers, movement, nail polish and poor circulation can cause false low readings, and readings may be less accurate on darker skin tones. A reading below 90% needs prompt medical assessment; follow any personal targets your clinician has given you, especially if you have lung disease.',
    sourceIds: ['who-pulse-oximetry'],
    ...draft,
  },
  {
    id: 'egfr',
    title: 'eGFR (kidney function)',
    aliases: ['egfr', 'gfr', 'kidney function', 'creatinine', 'ckd'],
    tags: ['lab', 'kidney'],
    summary: 'An estimate of how well the kidneys filter blood, calculated from a creatinine blood test.',
    body:
      'eGFR (estimated glomerular filtration rate) is calculated from a creatinine blood test plus age and sex. It is reported in mL/min/1.73 m². Values of 60 or above are generally in the normal-to-mildly-reduced range; values below 60 for more than three months are one of the criteria for chronic kidney disease. Diabetes and high blood pressure can affect the kidneys, so many care plans include regular eGFR and urine albumin tests. Your clinician interprets eGFR together with other results.',
    sourceIds: ['kdigo-2024', 'ada-soc'],
    ...draft,
  },
  {
    id: 'uacr',
    title: 'Urine albumin (UACR)',
    aliases: ['uacr', 'microalbumin', 'albumin creatinine ratio', 'urine albumin', 'acr'],
    tags: ['lab', 'kidney'],
    summary: 'A urine test that looks for small amounts of protein (albumin) — an early sign of kidney stress.',
    body:
      'The urine albumin-to-creatinine ratio (UACR) checks for albumin leaking into the urine. It is usually reported in mg/g or mg/mmol. A UACR of 30 mg/g (3 mg/mmol) or more on repeat testing is considered increased. Exercise, infection, fever and very high glucose can raise it temporarily, so abnormal results are usually repeated. It is commonly checked at least yearly in people with diabetes.',
    sourceIds: ['kdigo-2024', 'ada-soc'],
    ...draft,
  },
  {
    id: 'lipids',
    title: 'Cholesterol and lipid panel',
    aliases: ['cholesterol', 'ldl', 'hdl', 'triglycerides', 'lipid panel', 'lipids'],
    tags: ['lab', 'heart'],
    summary: 'A blood test measuring LDL ("bad") cholesterol, HDL, and triglycerides.',
    body:
      'A lipid panel usually reports total cholesterol, LDL cholesterol, HDL cholesterol and triglycerides, in mg/dL or mmol/L. LDL is the main target of cholesterol treatment because higher levels are linked to cardiovascular disease. Targets depend on your overall cardiovascular risk, so they are set individually by your clinician. Some labs require fasting before the test — check your preparation notes.',
    sourceIds: ['ada-soc', 'who-hearts'],
    ...draft,
  },
  {
    id: 'time-in-range',
    title: 'Time in range (CGM)',
    aliases: ['time in range', 'tir', 'cgm', 'continuous glucose monitor'],
    tags: ['diabetes', 'glucose'],
    summary: 'The share of time glucose stays within a target range, usually 70–180 mg/dL, on a CGM.',
    body:
      'With continuous glucose monitoring, "time in range" is the percentage of readings between 70 and 180 mg/dL (3.9–10.0 mmol/L). A commonly cited goal for many adults is more than 70% of the time in range with less than 4% below 70 mg/dL, though goals are individualised. FAITH shows how many of your recorded fingerstick readings fall within your target, which is not the same as CGM time in range.',
    sourceIds: ['ada-soc'],
    ...draft,
  },
  {
    id: 'glucose-units',
    title: 'mg/dL and mmol/L',
    aliases: ['mg/dl', 'mmol/l', 'mmol', 'units', 'convert glucose'],
    tags: ['glucose', 'units'],
    summary: 'Two units for glucose: divide mg/dL by 18 to get mmol/L.',
    body:
      'Glucose is reported in mg/dL in some countries (such as the United States and the Philippines) and mmol/L in others (such as the UK and Canada). To convert, divide mg/dL by about 18 (FAITH uses 18.0182) to get mmol/L, or multiply mmol/L by 18 to get mg/dL. For example 126 mg/dL ≈ 7.0 mmol/L. Your meter shows one unit; you can choose your preferred display unit in FAITH settings.',
    sourceIds: ['ada-soc'],
    ...draft,
  },
  {
    id: 'missed-dose',
    title: 'If you miss a dose',
    aliases: ['missed dose', 'forgot my medicine', 'forgot to take', 'missed pill', 'skipped dose'],
    tags: ['medication', 'safety'],
    summary: 'Check your medicine leaflet or ask your pharmacist — do not take extra to catch up unless told to.',
    body:
      'What to do after a missed dose depends on the medicine, how late you are, and your own treatment plan. The leaflet that came with your medicine usually explains this, and your pharmacist can advise. Do not take extra doses to make up for a missed one unless your prescriber or pharmacist has told you to. FAITH records doses as taken, skipped or not confirmed so you can discuss patterns with your care team; it never changes your plan.',
    sourceIds: ['who-adherence'],
    ...draft,
  },
  {
    id: 'sick-day',
    title: 'Sick days with diabetes or high blood pressure',
    aliases: ['sick day', 'sick-day rules', 'illness', 'flu', 'vomiting', 'diarrhea', 'diarrhoea'],
    tags: ['diabetes', 'hypertension', 'safety'],
    summary: 'Illness can affect glucose and some medicines; follow your sick-day plan and contact your team.',
    body:
      'Infections and dehydration can raise or lower glucose and can affect how some medicines work. Many care teams give a written sick-day plan covering how often to check glucose, ketone testing, fluids, and which medicines may need to be paused temporarily. Only change or pause medicines if your plan or clinician says so. Seek urgent care for persistent vomiting, inability to keep fluids down, very high or very low readings, or drowsiness.',
    sourceIds: ['ada-soc', 'ada-soc-hyperglycemic-crises'],
    ...draft,
  },
  {
    id: 'adherence',
    title: 'Keeping track of medicines',
    aliases: ['adherence', 'compliance', 'taking medicine regularly', 'pill reminders', 'routine'],
    tags: ['medication'],
    summary: 'Linking doses to daily routines and using reminders can make schedules easier to follow.',
    body:
      'Long-term medicines work best when taken as prescribed, but busy days make that hard. Linking doses to a daily habit (such as brushing teeth), using reminders, and keeping a short record of what happened can help. If side effects, cost or a complicated schedule make it difficult, tell your clinician or pharmacist — there may be simpler options. Recording "skipped" honestly is more useful to your care team than leaving gaps.',
    sourceIds: ['who-adherence'],
    ...draft,
  },
];

export function getArticle(id: string): KnowledgeArticle | null {
  return LIBRARY.find((a) => a.id === id) ?? null;
}
