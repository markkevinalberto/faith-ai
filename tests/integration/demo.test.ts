import { answerQuestion } from '@/ai/answer';
import { countProfileRows, deleteProfileData } from '@/db/dataManagement';
import { listLabResults } from '@/db/repo/care';
import { listMedications } from '@/db/repo/medications';
import { listConditions, listProfiles } from '@/db/repo/profiles';
import { listReadings } from '@/db/repo/vitals';
import type { SqlDatabase } from '@/db/sql';
import { DEMO_CLINICIAN, DEMO_PROFILE_NAME, seedDemoProfile } from '@/services/demoSeed';
import { createMigratedDatabase } from './helpers/nodeDb';

const NOW = new Date('2026-10-09T09:00:00.000Z');
let db: SqlDatabase;
beforeEach(async () => {
  db = await createMigratedDatabase();
});
afterEach(async () => {
  await db.close();
});

describe('demo mode', () => {
  it('creates a clearly labelled, fictional demo profile with rich data', async () => {
    const p = await seedDemoProfile(db, { now: NOW, timeZone: 'Asia/Manila', locale: 'en-PH' });
    expect(p.isDemo).toBe(true);
    expect(p.displayName).toBe(DEMO_PROFILE_NAME);
    expect(p.remindersEnabled).toBe(false);
    expect(await listConditions(db, p.id)).toHaveLength(2);
    const meds = await listMedications(db, p.id);
    expect(meds.map((m) => m.medication.name)).toEqual(['Atorvastatin', 'Lisinopril', 'Metformin', 'Paracetamol']);
    expect(meds.every((m) => m.medication.doseInstructions.includes('sample'))).toBe(true);
    const readings = await listReadings(db, p.id);
    expect(readings.length).toBeGreaterThan(150);
    expect(readings.every((r) => r.source === 'demo')).toBe(true);
    expect(readings.every((r) => Date.parse(r.measuredAt) <= NOW.getTime())).toBe(true);
    expect((await listLabResults(db, p.id)).length).toBe(5);
    const statuses = await db.getAllAsync<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM medication_events WHERE profile_id = ? GROUP BY status', [p.id]);
    const by = Object.fromEntries(statuses.map((s) => [s.status, s.n]));
    expect(by.taken).toBeGreaterThan(50);
    expect(by.upcoming).toBeGreaterThan(0);
  });

  it('records recent supply counts so one refill alert is shown (Lisinopril) and Metformin is well stocked', async () => {
    const p = await seedDemoProfile(db, { now: NOW, timeZone: 'UTC', locale: 'en-US' });
    const a = await answerQuestion({ db, profile: p, question: 'How do I take my medications?', now: NOW, timeZone: 'UTC' });
    const days = (name: string) => Number(/roughly (\d+) day/.exec(a.facts.find((f) => f.label === `${name} · supply`)?.text ?? '')?.[1]);
    expect(days('Lisinopril')).toBeLessThanOrEqual(7);
    expect(days('Metformin')).toBeGreaterThan(7);
  });

  it('is deterministic for a given seed and time', async () => {
    const a = await seedDemoProfile(db, { now: NOW, timeZone: 'UTC', locale: 'en-US' });
    const b = await seedDemoProfile(db, { now: NOW, timeZone: 'UTC', locale: 'en-US' });
    const va = (await listReadings(db, a.id, { order: 'asc' })).map((r) => [r.type, r.valueCanonical, r.systolic, r.measuredAt]);
    const vb = (await listReadings(db, b.id, { order: 'asc' })).map((r) => [r.type, r.valueCanonical, r.systolic, r.measuredAt]);
    expect(va).toEqual(vb);
  });

  it('powers the assistant with clinician-sourced targets', async () => {
    const p = await seedDemoProfile(db, { now: NOW, timeZone: 'UTC', locale: 'en-US' });
    const a = await answerQuestion({ db, profile: p, question: 'Summarize my glucose this month', now: NOW, timeZone: 'UTC' });
    const fasting = a.facts.find((f) => f.id === 'glucose.context.fasting');
    expect(fasting?.text).toContain(`Set by ${DEMO_CLINICIAN}`);
    expect(a.facts.some((f) => f.id === 'glucose.lows')).toBe(true);
  });

  it('can be removed completely', async () => {
    const p = await seedDemoProfile(db, { now: NOW, timeZone: 'UTC', locale: 'en-US' });
    await deleteProfileData(db, p.id);
    expect(await countProfileRows(db, p.id)).toBe(0);
    expect(await listProfiles(db)).toEqual([]);
  });
});
