/**
 * Deterministic parser for lab report text (from on-device OCR). Extracts rows exactly as printed;
 * it does not interpret results. The user reviews every row before anything is saved.
 *
 * Three layouts are handled, in order of confidence:
 * 1. one printed row per line: "HbA1c 7.2 % 4.0 - 5.6 H"
 * 2. the name on one line and its value (plus unit or range) on the next one or two lines
 * 3. a whole column of names followed by a whole column of values (OCR read column by column)
 * Rows rebuilt by 2 and 3 are marked `confidence: 'low'` so the review screen asks for a closer look.
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
  /** 'low' when the row was rebuilt from separate OCR lines and deserves a closer look. */
  confidence: 'high' | 'low';
}

const UNIT = String.raw`(%|mmHg|bpm|x\s?10\^?\d+\/[A-Za-z]+|[µu]?[A-Za-z]{1,6}\/[A-Za-z0-9.]+(?:\/\d+(?:\.\d+)?\s?m[²2])?|[µu]?[A-Za-z]{1,5}\/[A-Za-z]{1,3}|g\/dL|mg\/dL)`;
const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
const REF = String.raw`(\(?\s*(?:(?:<=|>=|≤|≥|<|>)\s*${NUM}|${NUM}\s*(?:[-–]|to)\s*${NUM})\s*\)?)`;
const ROW = new RegExp(
  String.raw`^(?<name>[A-Za-z][A-Za-z0-9 ,()\/.+\-]*?)\s*[:\-]?\s+(?<cmp>[<>]=?)?(?<value>\d+(?:[.,]\d+)?)\s*(?<unit>${UNIT})?\s*(?<ref>${REF})?\s*(?<flag>\b(?:H|L|HIGH|LOW|A|ABN|ABNORMAL)\b|\*)?\s*$`,
  'i',
);
const HEADER_WORDS = /^(test|tests|result|results|unit|units|reference|range|ref|patient|name|age|sex|date|page|specimen|collected|reported|physician|doctor|lab|laboratory|address|tel|phone|id|no|time|normal|flag|value|values)$/i;
const NOISE_WORDS = /\b(patient|name|age|sex|dob|date|page|tel|phone|specimen|collected|reported|physician|doctor|address|time|signature|verified)\b/i;
const VALUE_START = /^(?:[<>]=?|≤|≥)?\s*\d+(?:[.,]\d+)?(?:\s|$)/;
const RANGE_ONLY = new RegExp(String.raw`^\(?\s*(?:(?:<=|>=|≤|≥|<|>)\s*${NUM}|${NUM}\s*(?:[-–]|to)\s*${NUM})\s*\)?\s*$`, 'i');
const UNIT_ONLY = new RegExp(String.raw`^${UNIT}$`, 'i');

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

/** Parses one printed row. Returns null for headers, noise and anything that is not "name value". */
export function parseRowLine(raw: string): LabRowDraft | null {
  const line = raw.replace(/\s+/g, ' ').trim();
  if (line.length < 4) return null;
  const m = ROW.exec(line);
  if (!m?.groups) return null;
  const name = m.groups.name
    .replace(/\.{2,}|_{2,}/g, ' ')
    .replace(/[\s,:\-.]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!/[A-Za-z]{2,}/.test(name) || HEADER_WORDS.test(name) || NOISE_WORDS.test(name)) return null;
  const ref = parseReference(m.groups.ref ?? null);
  const value = num(m.groups.value);
  return {
    analyte: name,
    valueNum: m.groups.cmp ? null : value,
    valueText: m.groups.cmp ? `${m.groups.cmp}${m.groups.value}` : null,
    unit: m.groups.unit?.replace(/\s+/g, '') ?? null,
    refLow: ref.low,
    refHigh: ref.high,
    refText: ref.text,
    flag: m.groups.flag ? m.groups.flag.toUpperCase().replace('HIGH', 'H').replace('LOW', 'L') : null,
    sourceLine: line,
    confidence: 'high',
  };
}

/** A test name on its own line: starts with a letter, no measurement, not a header. */
function isNameLine(l: string): boolean {
  return /^[A-Za-z(]/.test(l) && /[A-Za-z]{2,}/.test(l) && !HEADER_WORDS.test(l) && !NOISE_WORDS.test(l) && !VALUE_START.test(l) && !ROW.test(l) && !/\d+(?:[.,]\d+)?\s*(%|mg|mmol|g\/|mL|IU|µ|u\/)/i.test(l);
}

/** A result on its own line: starts with a number (optionally with unit, range and flag). */
function isValueLine(l: string): boolean {
  return VALUE_START.test(l) && !RANGE_ONLY.test(l) && !/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(l) && !/^\d+\s+of\s+\d+$/i.test(l);
}

/** A unit or a reference range that spilled onto its own line. */
function isTrailerLine(l: string): boolean {
  return RANGE_ONLY.test(l) || UNIT_ONLY.test(l);
}

export function parseLabReport(ocrText: string): LabRowDraft[] {
  const lines = ocrText
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length >= 1);
  const found: { pos: number; row: LabRowDraft }[] = [];
  const used = new Set<number>();

  // 1. One row per line.
  lines.forEach((line, i) => {
    const row = parseRowLine(line);
    if (row) {
      found.push({ pos: i, row });
      used.add(i);
    }
  });

  // 2. Name above value (two-column tables read top to bottom), optionally a unit/range line after.
  for (let i = 0; i < lines.length - 1; i++) {
    if (used.has(i) || used.has(i + 1) || !isNameLine(lines[i]) || !isValueLine(lines[i + 1])) continue;
    let merged = `${lines[i]} ${lines[i + 1]}`;
    let span = 2;
    if (i + 2 < lines.length && !used.has(i + 2) && isTrailerLine(lines[i + 2])) {
      merged += ` ${lines[i + 2]}`;
      span = 3;
    }
    const row = parseRowLine(merged);
    if (!row) continue;
    found.push({ pos: i, row: { ...row, confidence: 'low' } });
    for (let k = 0; k < span; k++) used.add(i + k);
  }

  // 3. A column of names followed by a column of values.
  const names = lines.map((l, i) => i).filter((i) => !used.has(i) && isNameLine(lines[i]));
  const values = lines.map((l, i) => i).filter((i) => !used.has(i) && isValueLine(lines[i]));
  if (names.length >= 2 && names.length === values.length && names[names.length - 1] < values[0]) {
    names.forEach((ni, k) => {
      const row = parseRowLine(`${lines[ni]} ${lines[values[k]]}`);
      if (!row) return;
      found.push({ pos: ni, row: { ...row, confidence: 'low' } });
      used.add(ni);
      used.add(values[k]);
    });
  }

  return found.sort((a, b) => a.pos - b.pos).map((f) => f.row);
}
