/**
 * Deterministic parser for lab report text (from on-device OCR). Extracts rows exactly as printed;
 * it does not interpret results. The user reviews every row before anything is saved.
 *
 * A printed row is read token by token: the test name, then the result, then any mix of unit,
 * a second value in other units (reports often print mg/dL and mmol/L side by side), the reference
 * range (with or without a label like "Normal:" and a trailing unit), a flag (H, L, *, ↑) and
 * method words (HPLC, NGSP), in any order. Two tests printed side by side on one line become two
 * rows. Known test names are recognised from the biomarker catalog so OCR noise around a name does
 * not hide a result.
 *
 * Three layouts are handled, in order of confidence:
 * 1. one or more printed rows per line
 * 2. the name on one line and its value (plus unit or range) on the next one or two lines
 * 3. a whole column of names followed by a whole column of values (OCR read column by column)
 * Rows rebuilt by 2 and 3 are marked `confidence: 'low'` so the review screen asks for a closer look.
 */
import { findBiomarker } from '../knowledge/biomarkers';

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
  /** Catalog id when the printed name is a known test (e.g. 'hba1c'), for reference bands later. */
  biomarkerId: string | null;
}

const UNIT = String.raw`(?:%|mmHg|bpm|x\s?10\^?\d+\s?\/\s?[A-Za-z]+|[µu]?[A-Za-z]{1,6}\/[A-Za-z0-9.]+(?:\/\d+(?:\.\d+)?\s?m[²2])?|\/[µu]?[A-Za-z]{1,3}\d?|fL|pg)`;
const NUM = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+(?:[.,]\d+)?)`;
const CMP = String.raw`(?:<=|>=|≤|≥|<|>)`;
const RANGE_CORE = String.raw`(?:${CMP}\s*${NUM}|(?:up to|below|under|less than|above|over|more than|at least)\s*${NUM}|${NUM}\s*(?:-|–|—|to)\s*${NUM})`;

const HEADER_WORDS = /^(test|tests|result|results|unit|units|reference|range|ref|patient|name|age|sex|date|page|specimen|collected|reported|physician|doctor|lab|laboratory|address|tel|phone|id|no|time|normal|flag|value|values|method|remarks?)$/i;
const NOISE_WORDS = /\b(patient|name|age|sex|dob|date|page|tel|phone|specimen|collected|reported|physician|doctor|address|time|signature|verified|birthday|room|bed)\b/i;
/** A "name" made only of filler, e.g. the "of" in "1 of 2". */
const STOP_WORDS = /^(of|and|or|the|to|at|in|on|for|by|per|with|from)$/i;
/** Sentences ("your glucose was measured at 104") are left to the grounded AI step, not read as rows. */
const PROSE_WORDS = /\b(was|were|is|are|measured|found|showed|shows|your|please|see|result|results)\b/i;

const VALUE_TOKEN = new RegExp(String.raw`(?<![A-Za-z0-9.,])(${CMP})?\s*(${NUM})(?![0-9])`, 'g');
const AFTER_VALUE_RANGE = /^\s*(?:-|–|—|to)\s*\d/;
const UNIT_AT_START = new RegExp(String.raw`^\s*(${UNIT})(?![A-Za-z])`);
const FLAG_AT_START = /^\s*[([]?\s*(HH|LL|H|L|HIGH|LOW|A|ABN|ABNORMAL|\*|↑|↓)\s*[)\]]?(?=\s|$)/i;
const RANGE_AT_START = new RegExp(
  String.raw`^\s*(?:(?:ref(?:erence)?|normal|desirable|optimal|range|rr|nr|target)\s*(?:range|value)?\s*[:.]?\s*)?(\(?\s*${RANGE_CORE}\s*\)?)(?:\s*${UNIT}(?![A-Za-z]))?`,
  'i',
);
const SI_PAIR_AT_START = new RegExp(String.raw`^\s*${NUM}\s*${UNIT}(?![A-Za-z])`);
const WORD_AT_START = /^\s*[A-Za-z(][A-Za-z()/.+'\-]*(?=\s|$)/;
const DATE_OR_TIME = /^\s*\d{1,2}[/.:-]\d{1,2}([/.:-]\d{2,4})?\s*/;

const VALUE_START = new RegExp(String.raw`^(?:${CMP})?\s*${NUM}(?:\s|$)`);
const RANGE_ONLY = new RegExp(String.raw`^\(?\s*${RANGE_CORE}\s*\)?\s*$`, 'i');
const UNIT_ONLY = new RegExp(String.raw`^${UNIT}$`, 'i');

function num(s: string | undefined): number | null {
  if (!s) return null;
  // "250,000" is thousands; "5,8" is a decimal comma.
  const cleaned = /^\d{1,3}(?:,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Common OCR misreads inside unit tokens (mmoI/L, mg/dI). */
export function normalizeOcrUnits(s: string): string {
  // Only a lone I/1 at the end of a unit token is a misread L; "/1.73m2" must stay a number.
  return s
    .replace(/mmo[lI1]\s?\/\s?[lI1](?![\w.])/g, 'mmol/L')
    .replace(/([A-Za-zµ]{1,6})\/d[lI1](?![\w.])/g, '$1/dL')
    .replace(/([A-Za-zµ]{1,6})\/[I1](?![\w.])/g, '$1/L')
    .replace(/\bmmo[I1]\b/g, 'mmol');
}

export function parseReference(ref: string | null): { low: number | null; high: number | null; text: string | null } {
  if (!ref) return { low: null, high: null, text: null };
  const text = ref
    .replace(/[()[\]]/g, '')
    .replace(/^\s*(?:ref(?:erence)?|normal|desirable|optimal|range|rr|nr|target)\s*(?:range|value)?\s*[:.]?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  const range = new RegExp(String.raw`(${NUM})\s*(?:-|–|—|to)\s*(${NUM})`, 'i').exec(text);
  if (range) return { low: num(range[1]), high: num(range[2]), text };
  const lt = new RegExp(String.raw`(?:<=|≤|<|up to|below|under|less than)\s*(${NUM})`, 'i').exec(text);
  if (lt) return { low: null, high: num(lt[1]), text };
  const gt = new RegExp(String.raw`(?:>=|≥|>|above|over|more than|at least)\s*(${NUM})`, 'i').exec(text);
  if (gt) return { low: num(gt[1]), high: null, text };
  return { low: null, high: null, text };
}

function cleanName(raw: string): string {
  return raw
    .replace(/\.{2,}|_{2,}|…/g, ' ')
    .replace(/[\s,:\-.=|]+$/, '')
    .replace(/^[\s,:\-.=|]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Where the result number starts in a line, or null. Skips dates, times, codes like "CA 19-9" and "25-OH". */
function findValue(line: string): { start: number; end: number; cmp: string | null; value: string } | null {
  VALUE_TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = VALUE_TOKEN.exec(line)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    const after = line.slice(end);
    const digits = m[2].replace(/[.,]/g, '');
    if (digits.length >= 7) continue; // phone numbers, IDs
    if (/[A-Za-z0-9]-$/.test(line.slice(0, start))) continue; // the "9" of "CA 19-9"
    if (/^[/:.]\d/.test(after)) continue; // 10/01/2026, 08:15
    if (/^-[A-Za-z]/.test(after) || /^-\d/.test(after)) continue; // 25-OH, CA 19-9
    if (AFTER_VALUE_RANGE.test(after)) return null; // "70 - 100": a reference line, not a result
    if (/^\s+of\s+\d/i.test(after)) continue; // "1 of 2"
    return { start, end, cmp: m[1] ?? null, value: m[2] };
  }
  return null;
}

function buildRow(name: string, value: { cmp: string | null; value: string }, rest: string, sourceLine: string): { row: LabRowDraft; leftover: string } {
  let unit: string | null = null;
  let flag: string | null = null;
  let ref: string | null = null;
  let r = rest;
  const unitM = UNIT_AT_START.exec(r);
  if (unitM) {
    unit = unitM[1].replace(/\s+/g, '');
    r = r.slice(unitM[0].length);
  }
  let leftover = '';
  for (let guard = 0; guard < 12 && r.trim(); guard++) {
    const f = FLAG_AT_START.exec(r);
    if (f) {
      if (!flag) flag = f[1].toUpperCase().replace('HIGH', 'H').replace('LOW', 'L').replace('ABNORMAL', 'ABN').replace('↑', 'H').replace('↓', 'L');
      r = r.slice(f[0].length);
      continue;
    }
    const rg = RANGE_AT_START.exec(r);
    if (rg) {
      if (!ref) ref = rg[1];
      r = r.slice(rg[0].length);
      continue;
    }
    const si = SI_PAIR_AT_START.exec(r);
    if (si) {
      // The same result in other units; the first printed value is kept.
      r = r.slice(si[0].length);
      continue;
    }
    const w = WORD_AT_START.exec(r);
    if (w) {
      // A word followed later by a number is probably the next test on the same line.
      if (findValue(r)) {
        leftover = r;
        break;
      }
      r = r.slice(w[0].length);
      continue;
    }
    break;
  }
  const parsedRef = parseReference(ref);
  const n = num(value.value);
  const known = findBiomarker(name);
  return {
    row: {
      // Always the name as printed; the catalog only tells us which test it is.
      analyte: name,
      valueNum: value.cmp ? null : n,
      valueText: value.cmp ? `${value.cmp}${value.value}` : null,
      unit,
      refLow: parsedRef.low,
      refHigh: parsedRef.high,
      refText: parsedRef.text,
      flag,
      sourceLine,
      confidence: 'high',
      biomarkerId: known?.biomarker.id ?? null,
    },
    leftover,
  };
}

/** Every printed row on one line (two tests side by side give two rows). Empty for headers and noise. */
export function parseRowLines(raw: string): LabRowDraft[] {
  const line = normalizeOcrUnits(raw.replace(/\s+/g, ' ').trim());
  if (line.length < 4 || DATE_OR_TIME.test(line)) return [];
  const rows: LabRowDraft[] = [];
  let text = line;
  for (let guard = 0; guard < 6 && text.trim(); guard++) {
    const v = findValue(text);
    if (!v) break;
    const name = cleanName(text.slice(0, v.start));
    if (!/[A-Za-z]{2,}/.test(name) || name.length > 80 || HEADER_WORDS.test(name) || NOISE_WORDS.test(name) || PROSE_WORDS.test(name) || STOP_WORDS.test(name.replace(/^[\d\s.,-]+/, ''))) break;
    const { row, leftover } = buildRow(name, v, text.slice(v.end), line);
    rows.push(row);
    text = leftover;
  }
  return rows;
}

/** The first printed row on a line, or null for headers, noise and anything that is not "name value". */
export function parseRowLine(raw: string): LabRowDraft | null {
  return parseRowLines(raw)[0] ?? null;
}

/** A test name on its own line: starts with a letter, no measurement, not a header. */
function isNameLine(l: string): boolean {
  return /^[A-Za-z(]/.test(l) && /[A-Za-z]{2,}/.test(l) && !HEADER_WORDS.test(l) && !NOISE_WORDS.test(l) && !VALUE_START.test(l) && parseRowLine(l) === null && !/\d+(?:[.,]\d+)?\s*(%|mg|mmol|g\/|mL|IU|µ|u\/)/i.test(l);
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

  // 1. One or more rows per line.
  lines.forEach((line, i) => {
    const rows = parseRowLines(line);
    if (rows.length) {
      rows.forEach((row, k) => found.push({ pos: i + k / 10, row }));
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
