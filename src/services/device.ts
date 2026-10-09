import * as Localization from 'expo-localization';

import { deviceTimeZone, isValidTimeZone } from '../domain/time';
import type { GlucoseUnit, TemperatureUnit, WeightUnit } from '../domain/types';

export function currentTimeZone(): string {
  try {
    const tz = Localization.getCalendars()[0]?.timeZone;
    if (tz && isValidTimeZone(tz)) return tz;
  } catch {
    // fall back below
  }
  return deviceTimeZone();
}

export function currentLocale(): string {
  try {
    return Localization.getLocales()[0]?.languageTag ?? 'en-US';
  } catch {
    return 'en-US';
  }
}

export function currentRegion(): string | null {
  try {
    return Localization.getLocales()[0]?.regionCode ?? null;
  } catch {
    return null;
  }
}

/** Regions where meters commonly report mmol/L. Users can always change this. */
const MMOL_REGIONS = new Set(['GB', 'IE', 'CA', 'AU', 'NZ', 'ZA', 'NL', 'SE', 'NO', 'DK', 'FI', 'CN', 'HK', 'MY', 'RU', 'CZ', 'SK', 'HU', 'KZ', 'UA']);

export function defaultUnits(region: string | null): { glucoseUnit: GlucoseUnit; weightUnit: WeightUnit; temperatureUnit: TemperatureUnit } {
  const r = (region ?? '').toUpperCase();
  return {
    glucoseUnit: MMOL_REGIONS.has(r) ? 'mmol/L' : 'mg/dL',
    weightUnit: r === 'US' || r === 'LR' || r === 'MM' ? 'lb' : 'kg',
    temperatureUnit: r === 'US' || r === 'LR' ? 'F' : 'C',
  };
}
