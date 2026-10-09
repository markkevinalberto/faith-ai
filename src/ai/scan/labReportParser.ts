/**
 * Deterministic parser for lab report text (from on-device OCR). Extracts rows exactly as printed;
 * it does not interpret results. The user reviews every row before anything is saved.
 */
export interface LabRowDraft {
  analyte: string;
  valueNum: number | null;
  valueText: string | null;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  refText: string | null;
  flag: string | null;
  sourceLine: string;
}

const UNIT = String.raw`(%|mmHg|bpm|x\s?10\^?\d+\/[A-Za-z]+|[µu]?[A-Za-z]{1,6}\/[A-Za-z0-9.]+(?:\/\d+(?:\.\d+)?\s?m[²2])?|[µu]?[A-Za-z]{1,5}\/[A-Za-z]{1,3}|g\/dL|mg\/dL)`;
const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
const REF = String.raw`(\(?\s*(?:(?:<=|>=|≤|≥|<|>)\s*${NUM}|${NUM}\s*[-–]\s*${NUM})\s*\)?)`;
const ROW = new RegExp(
  String.raw`^(?<name>[A-Za-z][A-Za-z0-9 ,()\/.+\-]*?)\s*[:\-]?\s+(?<cmp>[<>]=?)?(?<value>\d+(?:[.,]\d+)?)\s*(?<unit>${UNIT})?\s*(?<ref>${REF})?\s*(?<flag>\b(?:H|L|HIGH|LOW|A|ABN|ABNORMAL)\b|\*)?\s*$`,
  'i',
);
const HEADER_WORDS = /^(test|tests|result|results|unit|units|reference|range|ref|patient|name|age|sex|date|page|specimen|collected|reported|physician|doctor|lab|laboratory|address|tel|phone|id|no|time)$/i;

function num(s: string | undefined): number | null {
  if (!s) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function parseReference(ref: string | null): { low: number | null; high: number | null; text: string | null } {
  if (!ref) return { low: null, high: null, text: null };
  const text = ref.replace(/[()]/g, '').trim();
  const range = /(\d+(?:[.,]\d+)?)\s*(?:[-–]|to)\s*(\d+(?:[.,]\d+)?)/i.exec(text);
  if (range) return { low: num(range[1]), high: num(range[2]), text };
  const lt = /(<=|≤|<)\s*(\d+(?:[.,]\d+)?)/.exec(text);
  if (lt) return { low: null, high: num(lt[2]), text };
  const gt = /(>=|≥|>)\s*(\d+(?:[.,]\d+)?)/.exec(text);
  if (gt) return { low: num(gt[2]), high: null, text };
  return { low: null, high: null, text };
}

export function parseLabReport(ocrText: string): LabRowDraft[] {
  const rows: LabRowDraft[] = [];
  for (const raw of ocrText.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (line.length < 4) continue;
    const m = ROW.exec(line);
    if (!m?.groups) continue;
    const name = m.groups.name
      .replace(/\.{2,}|_{2,}/g, ' ')
      .replace(/[\s,:\-.]+$/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!/[A-Za-z]{2,}/.test(name) || HEADER_WORDS.test(name) || /\b(date|tel|phone|page|age)\b/i.test(name)) continue;
    const ref = parseReference(m.groups.ref ?? null);
    const value = num(m.groups.value);
    rows.push({
      analyte: name,
      valueNum: m.groups.cmp ? null : value,
      valueText: m.groups.cmp ? `${m.groups.cmp}${m.groups.value}` : null,
      unit: m.groups.unit?.replace(/\s+/g, '') ?? null,
      refLow: ref.low,
      refHigh: ref.high,
      refText: ref.text,
      flag: m.groups.flag ? m.groups.flag.toUpperCase().replace('HIGH', 'H').replace('LOW', 'L') : null,
      sourceLine: line,
    });
  }
  return rows;
}
