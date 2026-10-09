/**
 * Rebuilds printed rows from OCR line boxes. ML Kit often returns table columns as separate blocks
 * ("HbA1c" in one, "7.2 %" in another); grouping lines by vertical position and sorting each group
 * left-to-right restores "HbA1c 7.2 % 4.0-5.6" so the row parsers can read it. A box joins a row
 * when its centre is close to the row's centre or its vertical span overlaps the row's by at least
 * half, which keeps slightly tilted photos together.
 */
export interface OcrLine {
  text: string;
  frame?: { left: number; top: number; width: number; height: number };
}

export function linesToRows(lines: OcrLine[]): string[] {
  const boxed = lines.filter((l) => l.frame && l.text.trim());
  if (boxed.length < lines.filter((l) => l.text.trim()).length) {
    // Without geometry, keep ML Kit's reading order.
    return lines.map((l) => l.text.trim()).filter(Boolean);
  }
  const items = boxed
    .map((l) => {
      const f = l.frame as NonNullable<OcrLine['frame']>;
      return { text: l.text.trim(), left: f.left, top: f.top, bottom: f.top + f.height, center: f.top + f.height / 2, height: f.height };
    })
    .sort((a, b) => a.center - b.center || a.left - b.left);
  const heights = items.map((i) => i.height).sort((a, b) => a - b);
  const tolerance = Math.max(4, heights[Math.floor(heights.length / 2)] * 0.55);

  const rows: { center: number; top: number; bottom: number; items: typeof items }[] = [];
  for (const item of items) {
    const row = rows.find((r) => {
      if (Math.abs(r.center - item.center) <= tolerance) return true;
      const overlap = Math.min(r.bottom, item.bottom) - Math.max(r.top, item.top);
      return overlap >= 0.5 * Math.min(item.height, r.bottom - r.top);
    });
    if (row) {
      row.items.push(item);
      row.center = row.items.reduce((s, i) => s + i.center, 0) / row.items.length;
      row.top = Math.min(row.top, item.top);
      row.bottom = Math.max(row.bottom, item.bottom);
    } else {
      rows.push({ center: item.center, top: item.top, bottom: item.bottom, items: [item] });
    }
  }
  return rows
    .sort((a, b) => a.center - b.center)
    .map((r) =>
      r.items
        .sort((a, b) => a.left - b.left)
        .map((i) => i.text)
        .join(' '),
    );
}
