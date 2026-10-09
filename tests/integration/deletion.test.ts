import { countProfileRows, deleteProfileData, exportProfileData, readingsToCsv } from '@/db/dataManagement';
import { addDocument, addLabResult, createAppointment, createLabTest } from '@/db/repo/care';
import { syncDoseEvents } from '@/db/repo/doseEvents';
import { SETTINGS, addCondition, getSetting, setSetting, upsertTarget } from '@/db/repo/profiles';
import { recordScheduled } from '@/db/repo/reminderJobs';
import { addCustomType, addReading, listReadings } from '@/db/repo/vitals';
import { NotFoundError, type SqlDatabase } from '@/db/sql';
import { makeReminder } from '@/domain/reminders';
import { makeMedication, makeProfile } from './helpers/fixtures';
import { createMigratedDatabase } from './helpers/nodeDb';

let db: SqlDatabase;
beforeEach(async () => {
  db = await createMigratedDatabase();
});
afterEach(async () => {
  await db.close();
});

async function populate(profileId: string, tag: string) {
  await addCondition(db, profileId, { name: `Condition ${tag}`, category: 'diabetes_type2' });
  await upsertTarget(db, profileId, { metric: 'glucose_fasting', low: 80, high: 130, unit: 'mg/dL', setBy: `Clinician ${tag}` });
  await makeMedication(db, profileId, { name: `Med ${tag}` });
  await syncDoseEvents(db, profileId, { now: new Date('2026-10-09T07:00:00Z'), timeZone: 'UTC' });
  await addReading(db, profileId, { type: 'glucose', value: 110, valueCanonical: 110, unit: 'mg/dL', measuredAt: '2026-10-09T07:00:00Z', timezone: 'UTC', notes: `note ${tag}` });
  const ct = await addCustomType(db, profileId, `Custom ${tag}`, 'u');
  await addReading(db, profileId, { type: 'custom', customTypeId: ct, value: 1, valueCanonical: 1, unit: 'u', measuredAt: '2026-10-09T07:00:00Z', timezone: 'UTC' });
  const lab = await createLabTest(db, profileId, { name: `Lab ${tag}` });
  await addLabResult(db, profileId, lab, { analyte: 'HbA1c', valueNum: 6.9, unit: '%', resultDate: '2026-10-09' });
  const appt = await createAppointment(db, profileId, { title: `Visit ${tag}`, startsAt: '2026-10-20T01:00:00Z', timezone: 'UTC' });
  await addDocument(db, profileId, { title: 'Report', relativePath: `documents/${profileId}/report-${tag}.pdf`, labTestId: lab });
  await addDocument(db, profileId, { title: 'Letter', relativePath: `documents/${profileId}/letter-${tag}.pdf`, appointmentId: appt });
  await recordScheduled(
    db,
    makeReminder({ jobKey: `appointment:${appt}`, kind: 'appointment', profileId, entityId: appt, fireAt: '2026-10-20T00:00:00Z', title: 't', body: 'b', categoryId: null }),
    `carely.appointment:${appt}`,
  );
}

describe('export', () => {
  it('exports only the selected profile’s data', async () => {
    const a = await makeProfile(db, 'Test Person A');
    const b = await makeProfile(db, 'Test Person B');
    await populate(a.id, 'A');
    await populate(b.id, 'B');
    const exp = await exportProfileData(db, a.id, '2026-10-09T09:00:00Z');
    expect(exp.format).toBe('carely-export');
    expect(exp.profile.id).toBe(a.id);
    expect(exp.medications).toHaveLength(1);
    expect(exp.doseEvents.length).toBeGreaterThan(0);
    expect(exp.readings).toHaveLength(2);
    const json = JSON.stringify(exp);
    expect(json).not.toContain(b.id);
    expect(json).not.toContain('Test Person B');
    expect(json).not.toContain('Med B');
  });

  it('writes CSV with escaping and formula-injection protection', async () => {
    const a = await makeProfile(db);
    await addReading(db, a.id, {
      type: 'glucose',
      value: 140,
      valueCanonical: 140,
      unit: 'mg/dL',
      measuredAt: '2026-10-09T07:00:00Z',
      timezone: 'UTC',
      notes: '=HYPERLINK("http://example.invalid","x"), after "lunch"',
    });
    const csv = readingsToCsv(await listReadings(db, a.id), a);
    const [header, row] = csv.trim().split('\n');
    expect(header.split(',')[0]).toBe('measured_at_utc');
    expect(row).toContain(`"'=HYPERLINK(""http://example.invalid"",""x""), after ""lunch"""`);
  });
});

describe('permanent deletion', () => {
  it('removes every row belonging to the profile and nothing else', async () => {
    const a = await makeProfile(db, 'Test Person A');
    const b = await makeProfile(db, 'Test Person B');
    await populate(a.id, 'A');
    await populate(b.id, 'B');
    await setSetting(db, SETTINGS.activeProfileId, a.id);
    const before = await countProfileRows(db, b.id);
    expect(await countProfileRows(db, a.id)).toBeGreaterThan(20);

    const res = await deleteProfileData(db, a.id);
    expect(res.remainingRows).toBe(0);
    expect(res.documentPaths.sort()).toEqual([`documents/${a.id}/letter-A.pdf`, `documents/${a.id}/report-A.pdf`]);
    expect(await countProfileRows(db, a.id)).toBe(0);
    expect(await countProfileRows(db, b.id)).toBe(before);
    expect(await getSetting(db, SETTINGS.activeProfileId)).toBeNull();

    // No orphaned rows anywhere (e.g. lab_results via lab_tests, events via medications).
    const fk = await db.getAllAsync('PRAGMA foreign_key_check');
    expect(fk).toEqual([]);
  });

  it('reports a missing profile', async () => {
    await expect(deleteProfileData(db, 'does-not-exist')).rejects.toBeInstanceOf(NotFoundError);
  });
});
