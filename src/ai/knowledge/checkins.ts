/**
 * Follow-up questions FAITH asks after a reading or lab result, the way a nurse would, with one-tap
 * answers. Each answer has a fixed, guideline-based reply (draft, pending clinical review); a few
 * symptom answers are red flags and bring up the urgent safety card. The answer is saved with the
 * reading so the care team (and Ask FAITH) can see it later. Replies never change a medicine or dose
 * and never diagnose.
 */
import type { RangePosition } from '../../domain/targets';
import type { GlucoseContext } from '../../domain/types';
import type { Biomarker } from './biomarkers';

export interface CheckinAnswer {
  id: string;
  label: string;
  /** What FAITH says back. */
  reply: string;
  /** Saved with the reading, e.g. "Late or large meal the night before: yes". */
  note: string;
  /** A red-flag answer: show the safety card (with a Call button) at this level. */
  urgency?: 'emergency' | 'urgent';
  sourceIds: string[];
}

export interface CheckinQuestion {
  id: string;
  text: string;
  answers: CheckinAnswer[];
}

const yesNo = (
  id: string,
  text: string,
  noteLabel: string,
  yes: { reply: string; urgency?: 'emergency' | 'urgent' },
  no: { reply: string },
  sourceIds: string[],
): CheckinQuestion => ({
  id,
  text,
  answers: [
    { id: `${id}.yes`, label: 'Yes', reply: yes.reply, urgency: yes.urgency, note: `${noteLabel}: yes`, sourceIds },
    { id: `${id}.no`, label: 'No', reply: no.reply, note: `${noteLabel}: no`, sourceIds },
  ],
});

export const CHECKINS = {
  lateMeal: yesNo(
    'glucose.late_meal',
    'Did you have a late or large meal last night?',
    'Late or large meal the night before',
    { reply: 'Thank you. A late or large evening meal often raises the next morning’s reading. An earlier, lighter dinner may help; see whether your morning numbers change.' },
    { reply: 'Thank you. If your morning readings stay high even after light dinners, show them to your care team at your next visit.' },
    ['ada-soc'],
  ),
  starchyMeal: yesNo(
    'glucose.starchy_meal',
    'Did this meal have rice, bread, noodles or a sweet drink?',
    'Starchy or sweet meal',
    { reply: 'Thank you. Those foods raise glucose the most. Filling half your plate with vegetables and a quarter with rice or bread can help.' },
    { reply: 'Thank you. Write down what you ate; your care team can help you find what raises your readings.' },
    ['ada-soc'],
  ),
  highGlucoseSymptoms: yesNo(
    'glucose.high_symptoms',
    'Are you very thirsty, passing a lot of urine, or unusually tired?',
    'Thirst, frequent urination or tiredness with high glucose',
    {
      reply: 'High glucose with these symptoms needs attention. Contact your care team today. If you are vomiting, drowsy or feel very unwell, call your local emergency number.',
      urgency: 'urgent',
    },
    { reply: 'Good. Drink water and check again as your care plan advises.' },
    ['ada-soc-hyperglycemic-crises'],
  ),
  lowGlucoseSymptoms: yesNo(
    'glucose.low_symptoms',
    'Do you feel shaky, sweaty, confused, or is your heart racing?',
    'Low-glucose symptoms',
    {
      reply: 'Follow your low-glucose plan now and check again in 15 minutes. If you are confused or cannot swallow safely, someone should call your local emergency number.',
      urgency: 'urgent',
    },
    { reply: 'Thank you. Eat your next meal on time, recheck as your plan advises, and tell your care team about low readings.' },
    ['ada-soc-hypoglycemia'],
  ),
  missedMeal: yesNo(
    'glucose.missed_meal',
    'Did you skip or delay a meal, or exercise more than usual?',
    'Missed or delayed meal, or extra exercise',
    { reply: 'That is a common cause of low readings. Try to keep meals regular, and tell your care team so they can check your plan.' },
    { reply: 'Thank you. Please tell your care team about this low reading; they may want to review your treatment.' },
    ['ada-soc-hypoglycemia'],
  ),
  rested: yesNo(
    'bp.rested',
    'Were you sitting quietly for at least 5 minutes before measuring?',
    'Rested 5 minutes before measuring',
    { reply: 'Thank you. Take a second reading in 1 to 2 minutes and save it too, so your care team sees the full picture.' },
    { reply: 'Readings taken without resting are often higher. Sit quietly for 5 minutes, then measure again and save it.' },
    ['ish-2020'],
  ),
  bpRedFlags: yesNo(
    'bp.red_flags',
    'Do you have chest pain, a severe headache, shortness of breath, weakness, or trouble seeing or speaking?',
    'Red-flag symptoms with high blood pressure',
    { reply: 'These symptoms with high blood pressure can be an emergency. Call your local emergency number now.', urgency: 'emergency' },
    { reply: 'Good. Rest, go easy on salty food today, and keep measuring at the same times each day.' },
    ['aha-hypertensive-crisis'],
  ),
  dizzy: yesNo(
    'bp.dizzy',
    'Do you feel dizzy, lightheaded or faint?',
    'Dizzy or lightheaded with low blood pressure',
    { reply: 'Sit or lie down now and stand up slowly. If you faint, feel confused or have chest pain, call your local emergency number. Tell your care team about these readings.' },
    { reply: 'Good. Stand up slowly, drink water, and tell your care team if low readings keep happening.' },
    ['aha-low-bp'],
  ),
  medsToday: yesNo(
    'meds.today',
    'Did you take your medicines as prescribed today?',
    'Took medicines as prescribed today',
    { reply: 'Well done. Taking them as prescribed helps keep your readings steady.' },
    {
      reply: 'Thank you for telling me. Don’t take extra to catch up; follow your medicine leaflet or ask your pharmacist about a missed dose. Tell your care team if you often miss doses.',
    },
    ['who-adherence'],
  ),
  homeGlucose: yesNo(
    'hba1c.home_checks',
    'Do you check your blood sugar at home?',
    'Checks blood sugar at home',
    { reply: 'Great. Bring your readings to your next visit; they help your care team understand this result.' },
    { reply: 'Ask your care team whether home checks would help you, and how often to do them.' },
    ['ada-soc'],
  ),
  friedFood: yesNo(
    'lipids.fried_food',
    'Do you eat fried or fatty food on most days?',
    'Fried or fatty food most days',
    { reply: 'Grilling, steaming or boiling instead of frying, and choosing fish or beans more often, can help your cholesterol.' },
    { reply: 'Good. Keep active, and ask your care team what cholesterol goal is right for you.' },
    ['nhlbi-atp3'],
  ),
  painRelievers: yesNo(
    'kidney.pain_relievers',
    'Do you often take pain relievers such as ibuprofen or mefenamic acid?',
    'Often takes pain relievers',
    { reply: 'Some pain relievers can strain the kidneys. Ask your pharmacist or doctor whether yours suit you.' },
    { reply: 'Good. Keeping your blood pressure and glucose within your targets also helps protect your kidneys.' },
    ['kdigo-2024'],
  ),
} satisfies Record<string, CheckinQuestion>;

export interface ReadingCheckinInput {
  type: 'glucose' | 'blood_pressure' | 'pulse' | 'spo2';
  position: RangePosition | null;
  glucoseContext?: GlucoseContext | null;
  hasMedications?: boolean;
}

/** One or two questions, most important first (red-flag questions lead). */
export function questionsForReading(i: ReadingCheckinInput): CheckinQuestion[] {
  if (i.type === 'glucose') {
    if (i.position === 'above') return [CHECKINS.highGlucoseSymptoms, i.glucoseContext === 'after_meal' ? CHECKINS.starchyMeal : CHECKINS.lateMeal];
    if (i.position === 'below') return [CHECKINS.lowGlucoseSymptoms, CHECKINS.missedMeal];
    if (i.position === 'within' && i.hasMedications) return [CHECKINS.medsToday];
    return [];
  }
  if (i.type === 'blood_pressure') {
    if (i.position === 'above') return [CHECKINS.bpRedFlags, CHECKINS.rested];
    if (i.position === 'below') return [CHECKINS.dizzy];
    if (i.position === 'within' && i.hasMedications) return [CHECKINS.medsToday];
  }
  return [];
}

export function questionsForLab(biomarker: Biomarker, direction: 'below' | 'within' | 'above' | null): CheckinQuestion[] {
  if (direction === null || direction === 'within') return [];
  switch (biomarker.category) {
    case 'glucose':
      return biomarker.id === 'hba1c' ? [CHECKINS.homeGlucose] : [];
    case 'lipids':
      return [CHECKINS.friedFood];
    case 'kidney':
      return [CHECKINS.painRelievers];
    default:
      return [];
  }
}
