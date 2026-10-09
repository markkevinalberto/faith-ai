/**
 * App-wide text size, chosen on the welcome screen or in Settings. Many FAITH users are older adults,
 * and the browser build has no system font scaling, so FAITH offers its own. The choice multiplies
 * every AppText and text field on top of the phone's own font size, with the total capped so layouts
 * stay usable. Stored per device in app_settings (it is not health data).
 */
import { useSyncExternalStore } from 'react';

export type TextSizeId = 'standard' | 'large' | 'xlarge';

export const TEXT_SIZES: { id: TextSizeId; label: string; scale: number }[] = [
  { id: 'standard', label: 'Standard', scale: 1 },
  { id: 'large', label: 'Large', scale: 1.15 },
  { id: 'xlarge', label: 'Extra large', scale: 1.3 },
];

/** Largest combined size (FAITH's choice × the phone's font scale) before text stops growing. */
export const MAX_TOTAL_TEXT_SCALE = 1.8;

let current: TextSizeId = 'standard';
const listeners = new Set<() => void>();

export function parseTextSize(value: string | null): TextSizeId {
  return TEXT_SIZES.some((s) => s.id === value) ? (value as TextSizeId) : 'standard';
}

export function textScaleOf(id: TextSizeId): number {
  return TEXT_SIZES.find((s) => s.id === id)?.scale ?? 1;
}

export function getTextSize(): TextSizeId {
  return current;
}

export function setTextSize(id: TextSizeId): void {
  if (id === current) return;
  current = id;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTextSize(): { id: TextSizeId; scale: number } {
  const id = useSyncExternalStore(subscribe, getTextSize, getTextSize);
  return { id, scale: textScaleOf(id) };
}
