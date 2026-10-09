/**
 * Medication supply estimation for refill reminders. Purely arithmetic on user-entered counts;
 * it never changes the prescription.
 */
import { addDays, localDateKey } from './time';
import type { LocalDate } from './types';

export interface SupplyInput {
  /** Units on hand when the count was last updated. */
  supplyCount: number | null;
  unitsPerDose: number | null;
  /** Doses recorded as taken since the count was updated. */
  takenSinceUpdate: number;
  averageDailyDoses: number;
}

export interface SupplyEstimate {
  remainingUnits: number;
  daysLeft: number | null;
}

export function estimateSupply(input: SupplyInput): SupplyEstimate | null {
  if (input.supplyCount === null || input.unitsPerDose === null || input.unitsPerDose <= 0) return null;
  const remainingUnits = Math.max(0, input.supplyCount - input.takenSinceUpdate * input.unitsPerDose);
  const perDay = input.averageDailyDoses * input.unitsPerDose;
  const daysLeft = perDay > 0 ? Math.floor(remainingUnits / perDay) : null;
  return { remainingUnits, daysLeft };
}

/**
 * Date on which to remind about a refill: an explicit refill date wins; otherwise the day the
 * estimated supply drops to `thresholdDays`.
 */
export function refillReminderDate(params: {
  explicitDate: LocalDate | null;
  estimate: SupplyEstimate | null;
  thresholdDays: number | null;
  now: Date;
  timeZone: string;
}): LocalDate | null {
  if (params.explicitDate) return params.explicitDate;
  if (!params.estimate || params.estimate.daysLeft === null || params.thresholdDays === null) return null;
  const today = localDateKey(params.now, params.timeZone);
  const offset = params.estimate.daysLeft - params.thresholdDays;
  return addDays(today, Math.max(0, offset));
}
