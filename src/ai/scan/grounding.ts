/**
 * Grounding checks for AI extraction: every value the model returns must literally appear in the
 * source text (OCR output or transcript). Anything not found is dropped — the model may reformat,
 * but never invent.
 */
export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[“”"'`’]/g, '')
    .replace(/[^a-z0-9.%/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when `value` (or all of its words) appears in `source`. */
export function isGrounded(value: string | number | null | undefined, source: string): boolean {
  if (value === null || value === undefined) return false;
  const v = normalizeForMatch(String(value));
  if (!v) return false;
  const src = normalizeForMatch(source);
  if (src.includes(v)) return true;
  const words = v.split(' ').filter((w) => w.length > 1);
  return words.length > 0 && words.every((w) => src.includes(w));
}

export function groundFields<T extends Record<string, string | number | null | undefined>>(fields: T, source: string): { kept: Partial<T>; dropped: (keyof T)[] } {
  const kept: Partial<T> = {};
  const dropped: (keyof T)[] = [];
  for (const key of Object.keys(fields) as (keyof T)[]) {
    const val = fields[key];
    if (val === null || val === undefined || val === '') continue;
    if (isGrounded(val, source)) kept[key] = val;
    else dropped.push(key);
  }
  return { kept, dropped };
}
