/**
 * Practical tips FAITH shows right after a blood pressure, glucose or lab result is saved.
 * Draft, pending clinical review.
 *
 * Every tip is general self-care, measurement technique, or when to involve the care team, taken from
 * the guideline cited with it. Tips never tell anyone to start, stop or change a medicine or dose,
 * never diagnose, and never set a personal goal; personal targets come only from the clinician.
 * The on-device model may reword a tip, but it cannot add one (see coach.ts).
 */
import type { RangePosition } from '../../domain/targets';
import type { GlucoseContext } from '../../domain/types';
import type { Biomarker, Placement } from './biomarkers';

export interface Tip {
  id: string;
  text: string;
  sourceIds: string[];
}

const tip = (id: string, text: string, ...sourceIds: string[]): Tip => ({ id, text, sourceIds });

export const TIPS = {
  // Blood glucose
  glucoseHighFasting: tip(
    'glucose.high.fasting',
    'A higher morning reading can follow a late or large evening meal. Note what you ate the night before, so you and your care team can spot patterns.',
    'ada-soc',
  ),
  glucoseHighAfterMeal: tip(
    'glucose.high.after_meal',
    'After-meal readings rise most with sweet drinks, rice, bread and other starchy foods. A smaller portion of these, or a short walk after eating, often helps.',
    'ada-soc',
  ),
  glucoseHighOther: tip('glucose.high.other', 'Drink water, and write down anything that may explain the reading, such as a big meal, stress, poor sleep or feeling unwell.', 'ada-soc'),
  glucoseActivity: tip('glucose.activity', 'Moving more, such as brisk walking on most days of the week, helps your body use glucose better.', 'ada-soc', 'who-diabetes'),
  glucoseHighRepeated: tip(
    'glucose.high.repeated',
    'Several of your recent readings at this time of day are above your target. Share them with your care team, who may review your treatment. Please don’t change it on your own.',
    'ada-soc',
  ),
  glucoseLowPlan: tip('glucose.low.plan', 'Follow the low-glucose plan your care team gave you, then check again as it advises.', 'ada-soc-hypoglycemia'),
  glucoseLowNote: tip(
    'glucose.low.note',
    'Write down what happened before this reading, such as a missed or late meal or extra activity, and tell your care team about any low readings.',
    'ada-soc-hypoglycemia',
  ),
  glucoseWithin: tip('glucose.within', 'Well done. Checking at the same times each day makes your pattern easier to see.', 'ada-soc'),
  glucoseNoContext: tip(
    'glucose.no_context',
    'Next time, choose when the reading was taken (fasting, before or after a meal). Then FAITH can compare it with the right target.',
    'ada-soc',
  ),

  // Blood pressure
  bpMeasure: tip(
    'bp.measure',
    'For the most accurate reading, sit quietly for 5 minutes first, with your back supported, feet flat and arm resting at heart level. Avoid coffee, smoking and exercise for 30 minutes before.',
    'ish-2020',
  ),
  bpRecheck: tip('bp.recheck', 'One reading is only part of the picture. Take a second reading 1 to 2 minutes later and record both.', 'ish-2020', 'esc-2024-bp'),
  bpSalt: tip(
    'bp.salt',
    'Eating less salt helps lower blood pressure. Go easy on salty sauces like soy sauce, patis and bagoong, instant noodles, and canned or processed meats.',
    'who-hearts',
    'ish-2020',
  ),
  bpActivity: tip('bp.activity', 'Regular activity, such as 30 minutes of brisk walking on most days, can help lower blood pressure.', 'ish-2020'),
  bpHighRepeated: tip(
    'bp.high.repeated',
    'Several of your recent readings are above your target. Share them with your care team, who may review your treatment. Please don’t change it on your own.',
    'ish-2020',
  ),
  bpLow: tip('bp.low', 'If you feel dizzy or lightheaded, sit or lie down, and stand up slowly. Tell your care team if low readings come with dizziness or fainting.', 'aha-low-bp'),
  bpWithin: tip('bp.within', 'Well done. Measuring at the same times each day, for example morning and evening, makes your pattern easier to follow.', 'ish-2020', 'esc-2024-bp'),

  // General medical care (not lifestyle): medicines as prescribed and routine checks
  medsAsPrescribed: tip(
    'meds.as_prescribed',
    'Take your medicines as prescribed. If you often miss doses or have side effects, tell your care team rather than stopping on your own.',
    'who-adherence',
  ),
  diabetesChecks: tip('diabetes.checks', 'People with diabetes are advised to have eye, kidney and foot checks every year. Ask your care team when yours are due.', 'ada-soc'),
  diabetesFeet: tip('diabetes.feet', 'Look at your feet every day for cuts, blisters or sores, and tell your care team about any that do not heal.', 'ada-soc'),

  // Pulse and oxygen
  pulseMeasure: tip('pulse.measure', 'Rest for a few minutes before checking your pulse, and note if you have just had coffee or been active.', 'aha-heart-rate'),
  spo2Measure: tip('spo2.measure', 'Sit still with warm hands while measuring. Cold fingers, movement and nail polish can lower the reading.', 'who-pulse-oximetry'),

  // Lab results
  hba1cAbove: tip(
    'hba1c.above',
    'HbA1c reflects your average glucose over about 3 months, so changes in meals and activity show up slowly. Ask your care team what HbA1c goal is right for you.',
    'ada-soc',
  ),
  hba1cLog: tip('hba1c.log', 'Bring your home glucose readings to your next visit. They help explain your HbA1c.', 'ada-soc'),
  lipidsFood: tip(
    'lipids.food',
    'Choose fish, beans, vegetables, fruit and whole grains more often, and cut back on fatty meats, fried food and food cooked in coconut or palm oil.',
    'nhlbi-atp3',
  ),
  lipidsActivity: tip('lipids.activity', 'Regular physical activity and keeping a healthy weight help improve cholesterol and triglyceride levels.', 'nhlbi-atp3'),
  triglyceridesSugar: tip('triglycerides.sugar', 'Triglycerides rise with sugary drinks, sweets, large servings of rice and alcohol. Cutting back on these often helps.', 'nhlbi-atp3'),
  hdlLow: tip('hdl.low', 'Being active and not smoking both help raise HDL, the protective cholesterol.', 'nhlbi-atp3'),
  kidneyProtect: tip('kidney.protect', 'Keeping your blood pressure and blood glucose within your targets is one of the best ways to protect your kidneys.', 'kdigo-2024'),
  kidneyPainRelievers: tip(
    'kidney.pain_relievers',
    'Before using any over-the-counter pain reliever, ask your pharmacist or doctor whether it suits your kidneys.',
    'kdigo-2024',
  ),
  kidneyRepeat: tip('kidney.repeat', 'Kidney results can vary from test to test. Your care team may repeat the test to confirm.', 'kdigo-2024'),
  liverCauses: tip(
    'liver.causes',
    'Liver test results can rise with alcohol, some medicines and supplements, and extra body weight. Ask your care team what may explain yours.',
    'medlineplus-labs',
  ),
  potassiumSalt: tip('potassium.salt_substitute', 'Many salt substitutes contain potassium. Check with your care team before using them.', 'medlineplus-labs'),
  hemoglobinLow: tip(
    'hemoglobin.low',
    'Low haemoglobin has many possible causes. Ask your care team whether you need more tests before trying iron tablets or other remedies.',
    'who-haemoglobin',
  ),
  labDiscuss: tip('lab.discuss', 'Bring this result to your next visit and ask what it means for you. FAITH can add it to your list of questions.', 'medlineplus-labs'),
  labWithin: tip('lab.within', 'Your care team will tell you how often to repeat this test. Keeping your results in FAITH makes changes easy to see.', 'medlineplus-labs'),
} satisfies Record<string, Tip>;

/**
 * "What to eat" advice, using foods common in the Philippines. General healthy-eating guidance from the
 * cited guidelines (ADA plate method, DASH-style eating in ISH/WHO, NCEP therapeutic lifestyle diet),
 * never a prescribed diet. Kidney patients are pointed to their care team where advice differs.
 */
export const FOOD = {
  glucose: tip(
    'food.glucose',
    'Fill half your plate with vegetables like pechay, kangkong, sitaw, malunggay or ampalaya; a quarter with fish, chicken without skin, tofu or monggo; and a quarter with rice, preferably a smaller cup or brown rice. Choose water instead of soft drinks and sweet juices.',
    'ada-soc',
  ),
  lowGlucose: tip(
    'food.low_glucose',
    'Keep a quick sugar with you, such as glucose tablets, hard candy or a small juice, and eat regular meals with some rice, bread or fruit plus protein.',
    'ada-soc-hypoglycemia',
  ),
  bloodPressure: tip(
    'food.blood_pressure',
    'Eat more vegetables, fruit, fish, beans and low-fat milk. Cook with less salt, soy sauce, patis and bagoong, and add flavour with calamansi, garlic, onion and ginger instead. If you have kidney disease, ask your care team before eating more high-potassium fruit like bananas.',
    'ish-2020',
    'who-hearts',
  ),
  lipids: tip(
    'food.lipids',
    'Choose fish, monggo and other beans, oats, vegetables and fruit. Grill, steam or boil instead of frying, and cut back on pork fat, chicharon, lechon skin and dishes cooked with a lot of gata.',
    'nhlbi-atp3',
  ),
  triglycerides: tip(
    'food.triglycerides',
    'Cut back on soft drinks, sweet juices, kakanin and other sweets, large servings of rice, and alcohol. Fish such as bangus, tamban or sardines are good choices.',
    'nhlbi-atp3',
  ),
  kidney: tip(
    'food.kidney',
    'Use less salt and avoid processed and canned foods. Ask your care team how much protein and which fruits suit your kidneys before changing your diet.',
    'kdigo-2024',
  ),
} satisfies Record<string, Tip>;

/** The food tip that fits a reading, or null when food advice isn't relevant (pulse, oxygen, low BP). */
export function foodForReading(type: ReadingTipInput['type'], position: RangePosition | null): Tip | null {
  if (type === 'glucose') return position === 'below' ? FOOD.lowGlucose : FOOD.glucose;
  if (type === 'blood_pressure') return position === 'below' ? null : FOOD.bloodPressure;
  return null;
}

/** The food tip for a lab result outside its goal band, or null. */
export function foodForLab(biomarker: Biomarker, placement: Placement | null): Tip | null {
  if (!placement || labDirection(biomarker, placement) === 'within') return null;
  switch (biomarker.id) {
    case 'hba1c':
      return FOOD.glucose;
    case 'ldl':
    case 'hdl':
    case 'total-cholesterol':
      return FOOD.lipids;
    case 'triglycerides':
      return FOOD.triglycerides;
    case 'egfr':
    case 'uacr':
    case 'creatinine':
    case 'bun':
      return FOOD.kidney;
    default:
      return null;
  }
}

export interface ReadingTipInput {
  type: 'glucose' | 'blood_pressure' | 'pulse' | 'spo2';
  /** Position against the clinician target or general reference; null when there is nothing to compare with. */
  position: RangePosition | null;
  glucoseContext?: GlucoseContext | null;
  /** True when several recent readings (same type and context) were also above the target. */
  repeatedlyAbove?: boolean;
  /** The person has active medicines recorded, so the "as prescribed" tip applies. */
  hasMedications?: boolean;
}

/** Up to three tips for a saved reading, most relevant first. */
export function tipsForReading(i: ReadingTipInput): Tip[] {
  const out: Tip[] = [];
  if (i.type === 'glucose') {
    if (i.position === null) out.push(TIPS.glucoseNoContext);
    else if (i.position === 'below') out.push(TIPS.glucoseLowPlan, TIPS.glucoseLowNote);
    else if (i.position === 'within') out.push(TIPS.glucoseWithin, TIPS.diabetesFeet, TIPS.diabetesChecks);
    else {
      out.push(i.glucoseContext === 'fasting' ? TIPS.glucoseHighFasting : i.glucoseContext === 'after_meal' ? TIPS.glucoseHighAfterMeal : TIPS.glucoseHighOther);
      out.push(TIPS.glucoseActivity);
      if (i.repeatedlyAbove) out.push(TIPS.glucoseHighRepeated);
    }
  } else if (i.type === 'blood_pressure') {
    if (i.position === 'above') {
      // Salt is covered by the food advice (FOOD.bloodPressure) shown alongside.
      out.push(TIPS.bpRecheck, TIPS.bpActivity);
      if (i.repeatedlyAbove) out.push(TIPS.bpHighRepeated);
    } else if (i.position === 'below') out.push(TIPS.bpLow, TIPS.bpMeasure);
    else if (i.position === 'within') out.push(TIPS.bpWithin, ...(i.hasMedications ? [TIPS.medsAsPrescribed] : []));
    else out.push(TIPS.bpMeasure);
  } else if (i.type === 'pulse') out.push(TIPS.pulseMeasure);
  else out.push(TIPS.spo2Measure);
  return out.slice(0, 3);
}

/** Up to three tips for a lab result, chosen by test and by which side of the goal band it falls. */
export function tipsForLab(biomarker: Biomarker, placement: Placement | null): Tip[] {
  if (!placement) return [TIPS.labDiscuss];
  const direction = labDirection(biomarker, placement);
  if (direction === 'within') return [TIPS.labWithin];
  const out: Tip[] = [];
  switch (biomarker.id) {
    case 'hba1c':
      out.push(TIPS.hba1cAbove, TIPS.hba1cLog, TIPS.diabetesChecks);
      break;
    // Food choices for these come from foodForLab, shown alongside.
    case 'ldl':
    case 'total-cholesterol':
    case 'triglycerides':
      out.push(TIPS.lipidsActivity);
      break;
    case 'hdl':
      out.push(TIPS.hdlLow);
      break;
    case 'egfr':
    case 'uacr':
    case 'creatinine':
    case 'bun':
      out.push(TIPS.kidneyProtect, TIPS.kidneyRepeat, TIPS.kidneyPainRelievers);
      break;
    case 'alt':
    case 'ast':
      out.push(TIPS.liverCauses);
      break;
    case 'potassium':
      if (direction === 'above') out.push(TIPS.potassiumSalt);
      break;
    case 'hemoglobin':
      // The middle band is below the threshold for men only, so the anaemia tip waits for the lowest band.
      if (placement.index === 0) out.push(TIPS.hemoglobinLow);
      break;
    default:
      break;
  }
  out.push(TIPS.labDiscuss);
  return out.slice(0, 3);
}

/**
 * Which side of the goal (or typical) band a result is on. For tests where lower is better the goal
 * band is the lowest one; for HDL and eGFR higher is better; otherwise it is the "typical" band.
 */
export function labDirection(biomarker: Biomarker, placement: Placement): 'below' | 'within' | 'above' {
  const bands = placement.reference.bands;
  const last = bands.length - 1;
  const i = placement.index;
  switch (biomarker.id) {
    case 'hba1c':
    case 'triglycerides':
    case 'total-cholesterol':
    case 'uacr':
      return i === 0 ? 'within' : 'above';
    case 'ldl':
      // Below 70 and below 100 are both under the general ADA goal.
      return i <= 1 ? 'within' : 'above';
    case 'hdl':
      return i === 0 ? 'below' : 'within';
    case 'hemoglobin':
      return i === last ? 'within' : 'below';
    case 'egfr':
      // G1 and G2 (60 and above) are not decreased enough to be a CKD stage on their own.
      return i >= last - 1 ? 'within' : 'below';
    default: {
      const typical = bands.findIndex((b) => /^within the typical|range for people without diabetes|below the 200/.test(b.say));
      if (typical === -1) return 'within';
      return i < typical ? 'below' : i > typical ? 'above' : 'within';
    }
  }
}
