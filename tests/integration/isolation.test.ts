import { addLabResult, createLabTest, getLabTest, listLabTests } from '@/db/repo/care';
import { applyDoseAction, listEventsForLocalDate, syncDoseEvents } from '@/db/repo/doseEvents';
import { deleteMedication, getMedication, listMedications } from '@/db/repo/medications';
import { addReading, deleteReading, listReadings } from '@/db/repo/vitals';
import { NotFoundError, type SqlDatabase } from '@/db/sql';
import { makeMedication, makeProfile } from './helpers/fixtures';
import { createMigratedDatabase } from './helpers/nodeDb';

let db: SqlDatabase;
beforeEach(async () => {
  db = await createMigratedDatabase();
});
afterEach(async () => {
  await db.close();
});

describe('profile isolation', () => {
  it('repositories never return or modify another profile’s records', async () => {
    const a = await makeProfile(db, 'Test Person A');
    const b = await makeProfile(db, 'Test Person B');
    const medA = await makeMedication(db, a.id);
    const readingA = await addReading(db, a.id, { type: 'pulse', value: 70, valueCanonical: 70, unit: 'bpm', measuredAt: '2026-10-09T08:00:00Z', timezone: 'UTC' });
    const labA = await createLabTest(db, a.id, { name: 'Lipid panel' });
    await syncDoseEvents(db, a.id, { now: new Date('2026-10-09T07:00:00Z'), timeZone: 'UTC' });
    const [eventA] = await listEventsForLocalDate(db, a.id, '2026-10-09');

    expect(await listMedications(db, b.id)).toEqual([]);
    expect(await getMedication(db, b.id, medA)).toBeNull();
    expect(await listReadings(db, b.id)).toEqual([]);
    expect(await listLabTests(db, b.id)).toEqual([]);
    expect(await getLabTest(db, b.id, labA)).toBeNull();
    expect(await listEventsForLocalDate(db, b.id, '2026-10-09')).toEqual([]);

    await expect(deleteMedication(db, b.id, medA)).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteReading(db, b.id, readingA)).rejects.toBeInstanceOf(NotFoundError);
    await expect(applyDoseAction(db, b.id, eventA.id, { type: 'take', at: '2026-10-09T08:00:00Z' })).rejects.toBeInstanceOf(NotFoundError);

    // A's data is untouched.
    expect(await getMedication(db, a.id, medA)).not.toBeNull();
    expect(await listReadings(db, a.id)).toHaveLength(1);
  });

  it('composite foreign keys block cross-profile references at the database level', async () => {
    const a = await makeProfile(db, 'Test Person A');
    const b = await makeProfile(db, 'Test Person B');
    const medA = await makeMedication(db, a.id);
    const labA = await createLabTest(db, a.id, { name: 'Lipid panel' });
    const now = '2026-10-09T00:00:00Z';

    // B cannot attach a schedule or dose event to A's medication.
    await expect(
      db.runAsync(
        "INSERT INTO medication_schedules (id, profile_id, medication_id, time_of_day, created_at, updated_at) VALUES ('s-x', ?, ?, '09:00', ?, ?)",
        [b.id, medA, now, now],
      ),
    ).rejects.toThrow(/FOREIGN KEY/);
    await expect(
      db.runAsync(
        `INSERT INTO medication_events (id, profile_id, medication_id, scheduled_for, local_date, local_time, timezone, status, status_changed_at, status_actor, created_at, updated_at)
         VALUES ('e-x', ?, ?, ?, '2026-10-09', '09:00', 'UTC', 'upcoming', ?, 'system', ?, ?)`,
        [b.id, medA, now, now, now, now],
      ),
    ).rejects.toThrow(/FOREIGN KEY/);
    // B cannot add a result to A's lab test.
    await expect(addLabResult(db, b.id, labA, { analyte: 'LDL', valueNum: 100, resultDate: '2026-10-09' })).rejects.toThrow(/FOREIGN KEY/);
  });
});
