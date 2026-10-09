/**
 * Output guard for model-generated text. If any rule trips, the generated text is discarded and
 * the deterministic record summary is shown instead (the UI says why).
 */
export interface GuardResult {
  ok: boolean;
  violations: string[];
  text: string;
}

interface Rule {
  id: string;
  re: RegExp;
  /** If the match is preceded by one of these within ~40 chars, it is allowed (e.g. "don't stop taking"). */
  allowIfPrecededBy?: RegExp;
}

const NEGATION = /(don'?t|do not|never|not|without (first )?(talking|speaking|checking)|before (talking|speaking)|unless|avoid)\b[^.]{0,40}$/i;

const RULES: Rule[] = [
  {
    id: 'dose_instruction',
    re: /\b(take|use|inject|give|have)\s+(an?\s+)?(extra|additional|double|two|2|another|more|less|half|smaller|larger|bigger)\b[^.]{0,40}\b(dose|doses|tablets?|pills?|units?|mg|capsules?|insulin)\b/i,
    allowIfPrecededBy: NEGATION,
  },
  {
    id: 'dose_change',
    // Up to three words may sit in between, e.g. "increase your metformin dose".
    re: /\b(increase|decrease|reduce|raise|lower|double|halve|adjust|change|up|cut)\s+(your|the|this|that)?\s*(?:[\w-]+\s+){0,3}?(dose|doses|dosage|insulin|medication|medications|medicine|medicines)\b/i,
    allowIfPrecededBy: NEGATION,
  },
  {
    id: 'stop_start_medicine',
    re: /\b(stop|start|skip|discontinue|quit|pause)\s+((taking|using)\b|(your|the|this|that)?\s*(?:[\w-]+\s+){0,2}?(medication|medicine|insulin|pills?|tablets?|treatment|dose)\b)/i,
    allowIfPrecededBy: NEGATION,
  },
  {
    id: 'diagnosis',
    re: /\byou\s+(have|probably have|likely have|may have|might have|are suffering from|are showing signs of|are diabetic|are hypertensive)\b/i,
  },
  {
    id: 'safety_claim',
    re: /\b(is|are|looks?|seems?|was|were)\s+(perfectly\s+|completely\s+|totally\s+|quite\s+)?(safe|normal|fine|healthy|nothing to worry about|okay|ok)\b/i,
    allowIfPrecededBy: /\b(not|cannot|can't|whether|if)\b[^.]{0,30}$/i,
  },
  { id: 'discourage_care', re: /\b(no need to|don'?t need to|do not need to|unnecessary to)\s+(see|call|contact|visit|talk)/i },
  { id: 'cloud_claim', re: /\b(as an ai (language )?model|i am (chatgpt|gpt|gemini|claude))\b/i },
];

function precededBy(text: string, index: number, re: RegExp): boolean {
  return re.test(text.slice(Math.max(0, index - 60), index));
}

function numbersIn(s: string): string[] {
  return (s.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(',', '.').replace(/\.0+$/, ''));
}

export interface GuardOptions {
  /**
   * Phrases the output must contain verbatim (case-insensitive), e.g. the exact reference-band label
   * for a value the person stated. Small models paraphrase "below the prediabetes range" into "within
   * the prediabetes range"; requiring the label keeps the answer tied to the computed fact.
   */
  requiredPhrases?: string[];
  /**
   * Words the output must not contain at all (whole words, case-insensitive). The tips note uses this
   * for the person's own medicine names and dose words: tips are never about medicines.
   */
  forbiddenTerms?: string[];
}

/**
 * @param context all text the model was given (facts, references, question). Every number in the
 *                output must appear in the context (small counting numbers up to 10 are allowed).
 */
export function guardOutput(raw: string, context: string, options: GuardOptions = {}): GuardResult {
  const text = raw
    .replace(/<\|im_end\|>|<\|endoftext\|>|<\/?s>/g, '')
    .replace(/^\s*(assistant|carely)\s*:\s*/i, '')
    .trim();
  const violations: string[] = [];
  if (text.length === 0) violations.push('empty');
  for (const rule of RULES) {
    const re = new RegExp(rule.re.source, rule.re.flags.includes('g') ? rule.re.flags : `${rule.re.flags}g`);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (rule.allowIfPrecededBy && precededBy(text, m.index, rule.allowIfPrecededBy)) continue;
      violations.push(rule.id);
      break;
    }
  }
  const allowed = new Set(numbersIn(context));
  const unsupported = numbersIn(text).filter((n) => !allowed.has(n) && !(Number.isInteger(Number(n)) && Number(n) <= 10));
  if (unsupported.length > 0) violations.push(`unsupported_number:${[...new Set(unsupported)].slice(0, 3).join('|')}`);
  const lower = text.toLowerCase().replace(/\s+/g, ' ');
  for (const phrase of options.requiredPhrases ?? []) {
    if (!lower.includes(phrase.toLowerCase().replace(/\s+/g, ' '))) violations.push(`missing_phrase:${phrase.slice(0, 40)}`);
  }
  for (const term of options.forbiddenTerms ?? []) {
    const t = term.trim().toLowerCase();
    if (t && new RegExp(`(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(lower)) violations.push(`forbidden_term:${t.slice(0, 30)}`);
  }
  return { ok: violations.length === 0, violations, text };
}
