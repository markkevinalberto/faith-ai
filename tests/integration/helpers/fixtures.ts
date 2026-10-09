import { createMedication, type MedicationInput } from '@/db/repo/medications';
import { createProfile } from '@/db/repo/profiles';
import type { SqlDatabase } from '@/db/sql';

export const T_SETUP = '2026-10-01T00:00:00.000Z';

export function makeProfile(db: SqlDatabase, displayName = 'Test Person A', timezone = 'UTC') {
  return createProfile(
    db,
    { displayName, locale: 'en-US', timezone, glucoseUnit: 'mg/dL', weightUnit: 'kg', temperatureUnit: 'C' },
    T_SETUP,
  );
}

export function makeMedication(db: SqlDatabase, profileId: string, partial: Partial<MedicationInput> = {}, now = T_SETUP) {
  return createMedication(
    db,
    profileId,
    {
      name: 'Testamine',
      strength: '10 mg',
      doseInstructions: 'Take 1 tablet with food (as written on the label).',
      startDate: '2026-10-01',
      schedules: [{ timeOfDay: '08:00', daysOfWeek: [] }],
      ...partial,
    },
    now,
  );
}
