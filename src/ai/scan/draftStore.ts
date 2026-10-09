/**
 * In-memory hand-off of a reviewed scan draft from the scan screen to the medication form.
 * Nothing is persisted; the draft is consumed once and never placed in a route URL.
 */
import type { LabelDraft } from './labelParser';

let pending: LabelDraft | null = null;

export function putLabelDraft(draft: LabelDraft): void {
  pending = draft;
}

export function takeLabelDraft(): LabelDraft | null {
  const d = pending;
  pending = null;
  return d;
}
