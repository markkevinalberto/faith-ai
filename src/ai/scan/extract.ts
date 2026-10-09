/**
 * Scan extraction pipeline: on-device OCR text → deterministic parser → (optional) on-device LLM
 * fills only the fields the parser missed, constrained to a JSON schema. Every value the model
 * returns must literally appear in the scanned text, otherwise it is dropped. The user reviews and
 * confirms everything before it is saved; nothing here writes to the database.
 */
import type { InferenceEngine } from '../inference/types';
import { findBiomarker } from '../knowledge/biomarkers';
import { groundFields, isGrounded, normalizeForMatch } from './grounding';
import { parseLabReport, parseReference, type LabRowDraft } from './labReportParser';
import { frequencyFromInstructions, parseLabel, suggestTimes, type LabelDraft } from './labelParser';

export interface ExtractionMeta {
  usedModel: boolean;
  modelLabel: string | null;
  /** Fields (or rows) the on-device model added after grounding. */
  aiFilled: string[];
  /** Model outputs discarded because they were not in the scanned text. */
  aiDropped: string[];
  note: string | null;
}

const LABEL_FIELDS = ['name', 'strength', 'form', 'instructions', 'quantity', 'prescriber'] as const;
type LabelField = (typeof LABEL_FIELDS)[number];

const LABEL_SCHEMA = {
  type: 'object',
  properties: Object.fromEntries(LABEL_FIELDS.map((f) => [f, { type: 'string' }])),
  required: [...LABEL_FIELDS],
  additionalProperties: false,
};

const LAB_SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      maxItems: 25,
      items: {
        type: 'object',
        properties: { analyte: { type: 'string' }, value: { type: 'string' }, unit: { type: 'string' }, reference: { type: 'string' }, flag: { type: 'string' } },
        required: ['analyte', 'value', 'unit', 'reference', 'flag'],
        additionalProperties: false,
      },
    },
  },
  required: ['results'],
  additionalProperties: false,
};

const EXTRACT_SYSTEM =
  'You copy information from text that was read from a photo. Copy values exactly as printed. If something is not printed, use an empty string. Never guess, correct, convert or add anything that is not in the text. Output JSON only.';

export function parseJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const v = JSON.parse(text.slice(start, end + 1)) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const emptyMeta = (): ExtractionMeta => ({ usedModel: false, modelLabel: null, aiFilled: [], aiDropped: [], note: null });

export async function extractLabel(ocrText: string, engine: InferenceEngine | null): Promise<{ draft: LabelDraft; meta: ExtractionMeta }> {
  const draft = parseLabel(ocrText);
  const meta = emptyMeta();
  const missing = LABEL_FIELDS.filter((f) => draft[f] === null);
  if (missing.length === 0 || !engine?.isReady() || ocrText.trim().length < 8) return { draft, meta };

  try {
    const r = await engine.generate(
      [
        { role: 'system', content: EXTRACT_SYSTEM },
        {
          role: 'user',
          content: `Text read from a medicine label:\n<<<\n${ocrText.slice(0, 1500)}\n>>>\nReturn JSON with: name (medicine name only, no strength), strength (for example "500 mg"), form (for example "tablet"), instructions (the directions for use), quantity (number of units dispensed), prescriber (the doctor's name).`,
        },
      ],
      { maxTokens: 200, temperature: 0, timeoutMs: 60_000, jsonSchema: LABEL_SCHEMA },
    );
    meta.usedModel = true;
    meta.modelLabel = engine.label;
    const json = parseJsonObject(r.text);
    if (!json) {
      meta.note = 'The on-device model did not return readable output, so only the parser results are shown.';
      return { draft, meta };
    }
    const proposed: Partial<Record<LabelField, string>> = {};
    for (const f of missing) {
      const v = str(json[f]);
      if (v) proposed[f] = v;
    }
    const { kept, dropped } = groundFields(proposed, ocrText);
    meta.aiDropped = dropped.map(String);
    const next: LabelDraft = { ...draft };
    for (const [field, value] of Object.entries(kept) as [LabelField, string][]) {
      if (field === 'quantity') {
        const n = Number(value.replace(/[^\d]/g, ''));
        if (Number.isInteger(n) && n > 0 && n < 10_000) next.quantity = n;
        else continue;
      } else if (field === 'form') {
        next.form = value[0].toUpperCase() + value.slice(1).toLowerCase();
      } else {
        next[field] = value;
      }
      meta.aiFilled.push(field);
    }
    if (meta.aiFilled.includes('instructions') && next.instructions) {
      const freq = frequencyFromInstructions(next.instructions);
      next.timesPerDay = freq.timesPerDay;
      next.asNeeded = freq.asNeeded;
      next.suggestedTimes = freq.asNeeded ? [] : suggestTimes(freq.timesPerDay, freq.bedtime);
    }
    return { draft: next, meta };
  } catch (e) {
    meta.note = `The on-device model could not finish (${e instanceof Error ? e.message : 'unknown error'}); showing the parser results.`;
    return { draft, meta };
  }
}

/** OCR rows that look like results (a word and a number) but the parser could not read. */
export function unparsedCandidateRows(ocrText: string, parsed: LabRowDraft[]): string[] {
  // Rows rebuilt from several lines carry the joined text, so exclude any line contained in one.
  const consumed = (l: string) => parsed.some((r) => r.sourceLine === l || r.sourceLine.includes(l));
  return ocrText
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l && !consumed(l) && /[A-Za-z]{2,}/.test(l) && /\d/.test(l) && !/\b(page|date|tel|phone|age|dob|id|no\.)\b/i.test(l))
    .slice(0, 25);
}

export async function extractLabReport(ocrText: string, engine: InferenceEngine | null): Promise<{ rows: LabRowDraft[]; meta: ExtractionMeta }> {
  const rows = parseLabReport(ocrText);
  const meta = emptyMeta();
  const candidates = unparsedCandidateRows(ocrText, rows);
  if (candidates.length === 0 || !engine?.isReady()) return { rows, meta };

  try {
    const r = await engine.generate(
      [
        { role: 'system', content: EXTRACT_SYSTEM },
        {
          role: 'user',
          content: `Lines read from a lab report:\n<<<\n${candidates.join('\n')}\n>>>\nList each test result on these lines. For each give: analyte (test name), value (the result exactly as printed), unit, reference (the printed reference range, or empty), flag (H, L or empty, only if printed).`,
        },
      ],
      { maxTokens: 450, temperature: 0, timeoutMs: 90_000, jsonSchema: LAB_SCHEMA },
    );
    meta.usedModel = true;
    meta.modelLabel = engine.label;
    const json = parseJsonObject(r.text);
    const results = Array.isArray(json?.results) ? (json.results as Record<string, unknown>[]) : [];
    const known = new Set(rows.map((x) => normalizeForMatch(x.analyte)));
    const added: LabRowDraft[] = [];
    for (const item of results) {
      const analyte = str(item.analyte);
      const value = str(item.value);
      if (!analyte || !value || known.has(normalizeForMatch(analyte))) continue;
      // Analyte and value must be printed together on one scanned line.
      const line = candidates.find((l) => isGrounded(analyte, l) && isGrounded(value, l));
      if (!line) {
        meta.aiDropped.push(analyte);
        continue;
      }
      const unit = str(item.unit);
      const reference = str(item.reference);
      const flag = str(item.flag).toUpperCase();
      const numeric = /^\d+(?:[.,]\d+)?$/.test(value) ? Number(value.replace(',', '.')) : null;
      const ref = reference && isGrounded(reference, line) ? parseReference(reference) : { low: null, high: null, text: null };
      added.push({
        analyte,
        valueNum: numeric,
        valueText: numeric === null ? value : null,
        unit: unit && isGrounded(unit, line) ? unit : null,
        refLow: ref.low,
        refHigh: ref.high,
        refText: ref.text,
        flag: (flag === 'H' || flag === 'L') && new RegExp(`\\b${flag}\\b`, 'i').test(line) ? flag : null,
        sourceLine: line,
        confidence: 'low',
        biomarkerId: findBiomarker(analyte)?.biomarker.id ?? null,
      });
      known.add(normalizeForMatch(analyte));
      meta.aiFilled.push(analyte);
    }
    return { rows: [...rows, ...added], meta };
  } catch (e) {
    meta.note = `The on-device model could not finish (${e instanceof Error ? e.message : 'unknown error'}); showing the parser results.`;
    return { rows, meta };
  }
}
