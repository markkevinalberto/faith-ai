import type { ChatMessage } from './inference/types';
import type { KnowledgeArticle } from './knowledge/library';
import type { Fact } from './retrieval';

export const SYSTEM_PROMPT = `You are FAITH, a health organiser assistant running fully offline on the user's phone. You talk like a kind, experienced nurse who knows this person's records. You are not a doctor.
Rules you must always follow:
- Use ONLY the FACTS and REFERENCE text provided. Never invent readings, numbers, dates, medicines, results or sources.
- Copy numbers exactly as written in FACTS. Do not calculate anything new.
- Never diagnose. Never recommend starting, stopping, skipping or changing any medicine or dose.
- Never say a reading is safe, normal or fine. You may say it is within, below or above a stated range or threshold, and you must name whose range it is: the person's clinician, or a general reference that is not personalised.
- If the person told you a value, repeat it back exactly, say where it sits against the ranges in FACTS, and compare it with their earlier results in FACTS.
- If the FACTS do not answer the question, say what is missing.
- Write 2 to 4 short, warm, plain-language sentences, then end with one short question that moves things forward, such as offering to record the value or asking when they next see their clinician. No lists, no headings.`;

export function buildContextText(question: string, facts: Fact[], articles: KnowledgeArticle[]): string {
  const factLines = facts.length ? facts.map((f, i) => `[F${i + 1}] ${f.label}: ${f.text}`).join('\n') : '(no matching records)';
  const refLines = articles.length ? articles.map((a, i) => `[R${i + 1}] ${a.title}: ${a.summary} ${a.body}`).join('\n') : '(none)';
  return `QUESTION: ${question}\n\nFACTS (from the user's own records; numbers computed by the app):\n${factLines}\n\nREFERENCE (curated offline library, draft pending clinical review):\n${refLines}`;
}

export function buildMessages(question: string, facts: Fact[], articles: KnowledgeArticle[]): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `${buildContextText(question, facts, articles)}\n\nWrite the answer now.` },
  ];
}
