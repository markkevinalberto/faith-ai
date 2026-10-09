/**
 * Deterministic parser for prescription / pharmacy label text (from on-device OCR).
 * It only reads what is printed; suggested reminder times are derived from the printed frequency
 * and must be confirmed by the user. It never proposes a dose.
 */
export interface LabelDraft {
  name: string | null;
  strength: string | null;
  form: string | null;
  instructions: string | null;
  quantity: number | null;
  prescriber: string | null;
  timesPerDay: number | null;
  asNeeded: boolean;
  suggestedTimes: string[];
}

const STRENGTH = /(\d+(?:[.,]\d+)?)\s*(mg|mcg|µg|ug|g|ml|iu|units?|%)\b(?:\s*\/\s*(\d+(?:[.,]\d+)?)?\s*(ml|tab|dose))?/i;
const FORM_WORDS: [RegExp, string][] = [
  [/\b(tablets?|tabs?)\b/i, 'Tablet'],
  [/\b(capsules?|caps?)\b/i, 'Capsule'],
  [/\b(injection|injectable|pen|vial|syringe)\b/i, 'Injection'],
  [/\b(inhaler|puffs?)\b/i, 'Inhaler'],
  [/\b(solution|suspension|syrup|liquid|oral soln)\b/i, 'Liquid'],
  [/\b(drops?)\b/i, 'Drops'],
  [/\b(patch(es)?)\b/i, 'Patch'],
];
const DIRECTION_START = /^\s*(take|inject|apply|use|inhale|instill|place|dissolve|chew|give|insert|spray)\b/i;
const STOP_LINE = /^\s*(qty|quantity|refills?|rx|dr\.?|doctor|prescriber|date|exp|lot|#|disp|pharmacist|store|keep|warning|caution)\b/i;
const SALT_CASE: Record<string, string> = { HCL: 'HCl', ER: 'ER', XR: 'XR', SR: 'SR', XL: 'XL', DR: 'DR', HCTZ: 'HCTZ', MR: 'MR' };
const NAME_NOISE = /\b(tablets?|tabs?|capsules?|caps?|oral|film[- ]coated|f\.?c\.?|solution|suspension|injection|rx|generic|brand)\b/gi;

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => SALT_CASE[w.toUpperCase()] ?? (w === w.toUpperCase() && w.length > 1 ? w[0] + w.slice(1).toLowerCase() : w))
    .join(' ');
}

function sentenceCase(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (!t) return t;
  const lower = t === t.toUpperCase() ? t.toLowerCase() : t;
  return lower[0].toUpperCase() + lower.slice(1);
}

export function frequencyFromInstructions(instr: string): { timesPerDay: number | null; asNeeded: boolean; bedtime: boolean } {
  const t = instr.toLowerCase();
  const asNeeded = /\b(as needed|when needed|if needed|prn)\b/.test(t);
  const bedtime = /\b(at bedtime|before bed|at night|hs)\b/.test(t);
  let timesPerDay: number | null = null;
  if (/\b(four times|4 times|qid|every 6 hours|q6h)\b/.test(t)) timesPerDay = 4;
  else if (/\b(three times|3 times|thrice|tid|every 8 hours|q8h)\b/.test(t)) timesPerDay = 3;
  else if (/\b(twice|two times|2 times|bid|every 12 hours|q12h)\b/.test(t)) timesPerDay = 2;
  else if (/\b(once|one time|1 time|daily|every day|every morning|every night|qd|od)\b/.test(t) || bedtime) timesPerDay = 1;
  return { timesPerDay, asNeeded, bedtime };
}

export function suggestTimes(timesPerDay: number | null, bedtime: boolean): string[] {
  if (bedtime && (timesPerDay === 1 || timesPerDay === null)) return ['21:00'];
  switch (timesPerDay) {
    case 1:
      return ['08:00'];
    case 2:
      return ['08:00', '20:00'];
    case 3:
      return ['08:00', '14:00', '20:00'];
    case 4:
      return ['08:00', '12:00', '16:00', '20:00'];
    default:
      return [];
  }
}

export function parseLabel(ocrText: string): LabelDraft {
  const lines = ocrText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let name: string | null = null;
  let strength: string | null = null;
  for (const line of lines) {
    const m = STRENGTH.exec(line);
    if (!m || DIRECTION_START.test(line) || STOP_LINE.test(line)) continue;
    strength = `${m[1].replace(',', '.')} ${m[2].toLowerCase() === 'iu' ? 'IU' : m[2].toLowerCase().replace('ug', 'mcg')}${m[3] || m[4] ? `/${m[3] ?? ''}${m[4] ? ` ${m[4].toLowerCase()}` : ''}`.replace('/ ', '/') : ''}`;
    const before = line.slice(0, m.index).replace(NAME_NOISE, ' ').replace(/[^A-Za-z0-9 +\-/]/g, ' ').trim();
    if (/[A-Za-z]{3,}/.test(before)) name = titleCase(before);
    break;
  }

  let form: string | null = null;
  for (const [re, label] of FORM_WORDS) {
    if (lines.some((l) => re.test(l) && !DIRECTION_START.test(l))) {
      form = label;
      break;
    }
  }

  let instructions: string | null = null;
  const start = lines.findIndex((l) => DIRECTION_START.test(l));
  if (start >= 0) {
    const parts = [lines[start]];
    for (let i = start + 1; i < lines.length && parts.length < 4; i++) {
      if (STOP_LINE.test(lines[i]) || STRENGTH.test(lines[i]) && !/\b(with|by|before|after|every|daily|times)\b/i.test(lines[i])) break;
      parts.push(lines[i]);
    }
    instructions = sentenceCase(parts.join(' '));
  }

  const qty = /\b(?:qty|quantity|disp(?:ense)?|#)\s*[:.]?\s*(\d{1,4})\b/i.exec(ocrText);
  const doc = /\b(?:[Dd][Rr]\.?|[Dd]octor|DOCTOR|[Pp]rescriber|PRESCRIBER)[ \t]*[:.]?[ \t]*([A-Z][A-Za-z.'-]+(?:[ \t]+[A-Z][A-Za-z.'-]+){0,3})/.exec(ocrText);
  const freq = instructions ? frequencyFromInstructions(instructions) : { timesPerDay: null, asNeeded: false, bedtime: false };

  return {
    name,
    strength,
    form,
    instructions,
    quantity: qty ? Number(qty[1]) : null,
    prescriber: doc ? `Dr. ${titleCase(doc[1]).replace(/^Dr\.?\s*/i, '')}` : null,
    timesPerDay: freq.timesPerDay,
    asNeeded: freq.asNeeded,
    suggestedTimes: freq.asNeeded ? [] : suggestTimes(freq.timesPerDay, freq.bedtime),
  };
}
