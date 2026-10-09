/**
 * Ask FAITH orchestrator: route → (escalate | refuse | retrieve) → optional on-device generation
 * → guard. Works fully without a model (deterministic answer); never calls the network.
 */
import type { SqlExecutor } from '../db/sql';
import { listMedications } from '../db/repo/medications';
import type { EscalationResult } from '../domain/escalation';
import type { Profile } from '../domain/types';
import { guardOutput } from './guard';
import type { InferenceEngine } from './inference/types';
import { getArticle, type KnowledgeArticle } from './knowledge/library';
import { searchLibrary } from './knowledge/search';
import { buildContextText, buildMessages } from './prompt';
import type { ReportedValue } from './reported';
import { retrieve, type Fact } from './retrieval';
import { routeQuestion, type Intent } from './router';
import { hybridLibrarySearch, type Embedder } from './semantic';

/** A follow-up the person can tap, e.g. saving a value they mentioned. `href` is an app route. */
export interface AnswerAction {
  label: string;
  href: string;
}

const q = (params: Record<string, string | number | null | undefined>) =>
  Object.entries(params)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');

/** Offers to record a stated value in the right form, pre-filled. Nothing is saved until the person confirms. */
export function actionsForReported(reported: ReportedValue | null): AnswerAction[] {
  if (!reported) return [];
  if (reported.kind === 'lab') {
    const { biomarker, value, unit } = reported;
    return [{ label: `Save ${value} ${unit} as ${biomarker.name}`, href: `/care/lab/add?${q({ biomarker: biomarker.id, value, unit })}` }];
  }
  const r = reported.reading;
  if (r.type === 'blood_pressure') {
    return [{ label: `Save ${r.systolic}/${r.diastolic} mmHg as a blood pressure reading`, href: `/vitals/new?${q({ type: 'blood_pressure', systolic: r.systolic, diastolic: r.diastolic, pulse: r.pulse })}` }];
  }
  const unit = 'unit' in r ? r.unit : null;
  const context = r.type === 'glucose' ? r.context : null;
  const names: Record<string, string> = { glucose: 'glucose', weight: 'weight', pulse: 'pulse', spo2: 'oxygen', temperature: 'temperature' };
  return [{ label: `Save ${r.value}${unit ? ` ${unit}` : ''} as a ${names[r.type]} reading`, href: `/vitals/new?${q({ type: r.type, value: r.value, unit, context })}` }];
}

export interface AssistantAnswer {
  question: string;
  createdAt: string;
  intent: Intent;
  escalation: EscalationResult | null;
  refusal: string | null;
  headline: string;
  facts: Fact[];
  references: KnowledgeArticle[];
  generated: { text: string; engineLabel: string; durationMs: number; tokensPerSecond: number | null } | null;
  generationNote: string | null;
  limitations: string[];
  /** How records and articles were found: keywords only, or keywords plus on-device embeddings. */
  searchMode: 'keyword' | 'semantic';
  /** Follow-ups the person can tap, such as saving a value they mentioned. */
  actions: AnswerAction[];
}

export interface AnswerParams {
  db: SqlExecutor;
  profile: Profile;
  question: string;
  now: Date;
  timeZone: string;
  engine?: InferenceEngine | null;
  /** Optional on-device embedding model for semantic search. */
  embedder?: Embedder | null;
  onToken?: (token: string) => void;
}

const REFUSALS: Partial<Record<Intent, string>> = {
  dose_change:
    "I can't advise on changing, skipping, doubling or making up doses. Please follow the instructions from your prescriber or pharmacist — what you recorded is shown below. If you've missed a dose, check the medicine leaflet or ask your pharmacist, and don't take extra to catch up unless they have told you to.",
  prescribe:
    "I can't recommend or prescribe medicines. Your clinician or pharmacist can advise on what's right for you. I can show your recorded medications or help you prepare questions for your next visit.",
  diagnosis:
    "I can't diagnose conditions. Here is a summary of your recorded readings that you could discuss with your clinician — I can also help you prepare questions.",
};

const MODEL_INTENTS: Intent[] = ['readings_summary', 'medication_lookup', 'lab_summary', 'appointments', 'clinician_questions', 'explain_term', 'general', 'reported_value'];

function headlineFor(intent: Intent, factCount: number, days: number): string {
  if (intent === 'reported_value') return 'Here is the value you mentioned, next to the reference ranges and your own records.';
  if (factCount === 0 && intent !== 'explain_term') return "I couldn't find matching records on this device.";
  switch (intent) {
    case 'readings_summary':
      return `Here is what your recorded readings show for the last ${days} day${days === 1 ? '' : 's'}.`;
    case 'medication_lookup':
      return 'These are the medication details you recorded.';
    case 'lab_summary':
      return 'These are the lab results and tests you recorded.';
    case 'appointments':
      return 'Here is what is coming up in your care plan.';
    case 'clinician_questions':
      return 'Questions you could bring to your clinician, based on your recent records:';
    case 'explain_term':
      return 'Here is an explanation from the offline reference library.';
    case 'unit_conversion':
      return 'Converted with a fixed formula on this device.';
    default:
      return 'Here is what I found in your records and the reference library.';
  }
}

export async function answerQuestion(p: AnswerParams): Promise<AssistantAnswer> {
  const question = p.question.trim().slice(0, 500);
  const meds = await listMedications(p.db, p.profile.id);
  const route = routeQuestion(question, {
    glucoseUnit: p.profile.glucoseUnit,
    emergencyNumber: p.profile.emergencyNumber,
    medicationNames: meds.map((m) => m.medication.name),
  });
  const base: AssistantAnswer = {
    question,
    createdAt: p.now.toISOString(),
    intent: route.intent,
    escalation: route.escalation,
    refusal: null,
    headline: '',
    facts: [],
    references: [],
    generated: null,
    generationNote: null,
    limitations: [],
    searchMode: 'keyword',
    actions: [],
  };

  if (route.intent === 'emergency') {
    return { ...base, headline: 'This may be an emergency. Please get help now.' };
  }

  if (route.intent === 'unit_conversion' && route.conversion) {
    const c = route.conversion;
    return {
      ...base,
      headline: headlineFor('unit_conversion', 1, route.timeframeDays),
      facts: [{ id: 'conversion', kind: 'computed', label: 'Conversion', text: `${c.input.value} ${c.input.unit} ≈ ${c.output.value} ${c.output.unit} (formula: ${c.formula}).` }],
      references: c.sourceId === 'ngsp-ifcc' ? [getArticle('hba1c') as KnowledgeArticle] : c.input.unit.includes('mol') || c.input.unit.includes('mg') ? [getArticle('glucose-units') as KnowledgeArticle] : [],
    };
  }

  const ctx = { db: p.db, profile: p.profile, now: p.now, timeZone: p.timeZone };
  const embedder = p.embedder ?? null;
  const retrieval = await retrieve(route, question, ctx, embedder);
  let semantic = retrieval.mode === 'semantic';
  let references: KnowledgeArticle[];
  if (route.intent === 'dose_change') references = [getArticle('missed-dose') as KnowledgeArticle];
  else if (route.intent === 'prescribe') references = [];
  else if (route.intent === 'reported_value' && route.reported) {
    // The article that explains exactly this test or reading, nothing else.
    const r = route.reported;
    const id =
      r.kind === 'lab'
        ? r.biomarker.articleId
        : r.reading.type === 'glucose'
          ? r.reading.context === 'after_meal' || r.reading.context === 'random'
            ? 'post-meal-glucose'
            : 'fasting-glucose'
          : r.reading.type === 'blood_pressure'
            ? 'blood-pressure-numbers'
            : r.reading.type === 'spo2'
              ? 'spo2'
              : r.reading.type === 'pulse'
                ? 'pulse'
                : null;
    const article = id ? getArticle(id) : null;
    references = article ? [article] : [];
  } else {
    const k = route.intent === 'explain_term' ? 2 : 1;
    references = searchLibrary(question, k).map((r) => r.article);
    if (embedder) {
      try {
        const hybrid = await hybridLibrarySearch(question, embedder, { k });
        if (hybrid.length) references = hybrid;
        semantic = true;
      } catch {
        // Keyword results stand.
      }
    }
  }

  const answer: AssistantAnswer = {
    ...base,
    refusal: REFUSALS[route.intent] ?? null,
    headline: REFUSALS[route.intent] ? '' : headlineFor(route.intent, retrieval.facts.length + references.length, route.timeframeDays),
    facts: retrieval.facts,
    references,
    limitations: retrieval.limitations,
    searchMode: semantic ? 'semantic' : 'keyword',
    actions: route.intent === 'reported_value' ? actionsForReported(route.reported) : [],
  };

  if (!MODEL_INTENTS.includes(route.intent)) return answer;
  if (retrieval.facts.length === 0 && references.length === 0) return answer;

  const engine = p.engine ?? null;
  if (!engine || !engine.isReady()) {
    answer.generationNote = 'On-device model not loaded — showing the record summary and library text only.';
    return answer;
  }

  try {
    const result = await engine.generate(buildMessages(question, retrieval.facts, references), {
      maxTokens: 220,
      temperature: 0.2,
      timeoutMs: 90_000,
      onToken: p.onToken,
    });
    const guard = guardOutput(result.text, buildContextText(question, retrieval.facts, references), { requiredPhrases: retrieval.mustInclude });
    if (guard.ok) {
      answer.generated = { text: guard.text, engineLabel: engine.label, durationMs: result.durationMs, tokensPerSecond: result.tokensPerSecond };
    } else {
      answer.generationNote = `The on-device model's draft did not pass FAITH's safety checks (${guard.violations.join(', ')}), so only verified record facts are shown.`;
    }
  } catch (e) {
    answer.generationNote = `The on-device model could not finish (${e instanceof Error ? e.message : 'unknown error'}). Showing the record summary instead.`;
  }
  return answer;
}

export const SUGGESTED_QUESTIONS = [
  'Summarize my glucose this week',
  'How has my blood pressure been this month?',
  'How do I take my medications?',
  'What were my latest lab results?',
  'What is HbA1c?',
  'Prepare questions for my next appointment',
  'Convert 7.2 mmol/L to mg/dL',
];
