/**
 * Demo mode: a separate, clearly labelled profile filled with FICTIONAL sample data.
 * Deterministic (seeded PRNG) so demos are repeatable. Reminders are never scheduled for demo profiles.
 */
import { addLabResult, createAppointment, createLabTest } from '../db/repo/care';
import { logAudit } from '../db/repo/audit';
import { syncDoseEvents } from '../db/repo/doseEvents';
import { createMedication, updateSupply } from '../db/repo/medications';
import { addCondition, createProfile, upsertTarget } from '../db/repo/profiles';
import { insertReading, type ReadingInput } from '../db/repo/vitals';
import type { SqlDatabase } from '../db/sql';
import { addDays, localDateKey, zonedWallTimeToInstant } from '../domain/time';
import type { Profile } from '../domain/types';

export const DEMO_PROFILE_NAME = 'Alex Rivera (sample)';
export const DEMO_CLINICIAN = 'Dr. Maya Santos (fictional)';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number): number {
  const u = Math.max(rand(), 1e-9);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export interface DemoSeedOptions {
  now: Date;
  timeZone: string;
  locale: string;
  seed?: number;
}

export async function seedDemoProfile(db: SqlDatabase, opts: DemoSeedOptions): Promise<Profile> {
  const rand = mulberry32(opts.seed ?? 20261009);
  const tz = opts.timeZone;
  const today = localDateKey(opts.now, tz);
  const at = (daysAgo: number, time: string, jitterMin = 0) => {
    const base = zonedWallTimeToInstant(addDays(today, -daysAgo), time, tz).instant.getTime();
    return new Date(base + Math.round((rand() - 0.5) * 2 * jitterMin) * 60_000);
  };
  const setupIso = at(200, '09:00').toISOString();

  const profile = await createProfile(
    db,
    {
      displayName: DEMO_PROFILE_NAME,
      dateOfBirth: '1968-04-12',
      sex: 'unspecified',
      locale: opts.locale,
      timezone: tz,
      glucoseUnit: 'mg/dL',
      weightUnit: 'kg',
      temperatureUnit: 'C',
      isDemo: true,
      reminderPrivacy: true,
      remindersEnabled: false,
    },
    setupIso,
  );
  const pid = profile.id;

  await addCondition(db, pid, { name: 'Type 2 diabetes', category: 'diabetes_type2', diagnosedOn: '2019-03-01', notes: 'Sample record' }, setupIso);
  await addCondition(db, pid, { name: 'High blood pressure', category: 'hypertension', diagnosedOn: '2021-06-15', notes: 'Sample record' }, setupIso);
  await upsertTarget(db, pid, { metric: 'glucose_fasting', low: 80, high: 130, unit: 'mg/dL', setBy: DEMO_CLINICIAN, setOn: addDays(today, -85) }, setupIso);
  await upsertTarget(db, pid, { metric: 'glucose_after_meal', low: null, high: 180, unit: 'mg/dL', setBy: DEMO_CLINICIAN, setOn: addDays(today, -85) }, setupIso);
  await upsertTarget(db, pid, { metric: 'bp_systolic', low: null, high: 130, unit: 'mmHg', setBy: DEMO_CLINICIAN, setOn: addDays(today, -85) }, setupIso);
  await upsertTarget(db, pid, { metric: 'bp_diastolic', low: null, high: 80, unit: 'mmHg', setBy: DEMO_CLINICIAN, setOn: addDays(today, -85) }, setupIso);

  const startDate = addDays(today, -180);
  const metforminId = await createMedication(
    db,
    pid,
    {
      name: 'Metformin',
      strength: '500 mg',
      form: 'Tablet',
      doseInstructions: 'Take 1 tablet twice daily with breakfast and dinner (sample label).',
      prescriber: DEMO_CLINICIAN,
      startDate,
      refillSupplyCount: 46,
      refillUnitsPerDose: 1,
      refillThresholdDays: 7,
      schedules: [
        { timeOfDay: '08:00', daysOfWeek: [], doseLabel: '1 tablet' },
        { timeOfDay: '19:00', daysOfWeek: [], doseLabel: '1 tablet' },
      ],
    },
    setupIso,
  );
  const lisinoprilId = await createMedication(
    db,
    pid,
    {
      name: 'Lisinopril',
      strength: '10 mg',
      form: 'Tablet',
      doseInstructions: 'Take 1 tablet once daily in the morning (sample label).',
      prescriber: DEMO_CLINICIAN,
      startDate,
      refillSupplyCount: 12,
      refillUnitsPerDose: 1,
      refillThresholdDays: 7,
      schedules: [{ timeOfDay: '08:00', daysOfWeek: [], doseLabel: '1 tablet' }],
    },
    setupIso,
  );
  await createMedication(
    db,
    pid,
    {
      name: 'Atorvastatin',
      strength: '20 mg',
      form: 'Tablet',
      doseInstructions: 'Take 1 tablet at bedtime (sample label).',
      prescriber: DEMO_CLINICIAN,
      startDate,
      schedules: [{ timeOfDay: '21:30', daysOfWeek: [], doseLabel: '1 tablet' }],
    },
    setupIso,
  );
  await createMedication(
    db,
    pid,
    { name: 'Paracetamol', strength: '500 mg', form: 'Tablet', doseInstructions: 'Use only as directed on the package label (sample).', startDate, asNeeded: true, schedules: [] },
    setupIso,
  );

  // Dose history for the past 30 days: mostly taken, some skipped, some left unconfirmed.
  await syncDoseEvents(db, pid, { now: opts.now, timeZone: tz, lookbackDays: 30, horizonDays: 7 });
  const nowIso = opts.now.toISOString();
  const past = await db.getAllAsync<{ id: string; scheduled_for: string }>(
    "SELECT id, scheduled_for FROM medication_events WHERE profile_id = ? AND scheduled_for < ? AND status IN ('upcoming','unconfirmed') ORDER BY scheduled_for",
    [pid, nowIso],
  );
  await db.transaction(async (tx) => {
    for (const e of past) {
      const r = rand();
      if (r < 0.86) {
        const takenAt = new Date(Math.min(Date.parse(e.scheduled_for) + Math.round(rand() * 40) * 60_000, opts.now.getTime())).toISOString();
        await tx.runAsync("UPDATE medication_events SET status = 'taken', status_actor = 'user', taken_at = ?, status_changed_at = ?, updated_at = ? WHERE id = ?", [
          takenAt,
          takenAt,
          takenAt,
          e.id,
        ]);
      } else if (r < 0.93) {
        await tx.runAsync("UPDATE medication_events SET status = 'skipped', status_actor = 'user', status_changed_at = ?, updated_at = ? WHERE id = ?", [
          e.scheduled_for,
          e.scheduled_for,
          e.id,
        ]);
      }
    }
  });
  await syncDoseEvents(db, pid, { now: opts.now, timeZone: tz, lookbackDays: 30, horizonDays: 7 });
  // Recent pill counts: Metformin comfortably stocked, Lisinopril low enough to show a refill alert.
  await updateSupply(db, pid, metforminId, 46, at(3, '09:00').toISOString());
  await updateSupply(db, pid, lisinoprilId, 9, at(5, '09:00').toISOString());

  // 90 days of readings with gentle improvement trends and realistic noise.
  const readings: ReadingInput[] = [];
  for (let d = 89; d >= 0; d--) {
    const progress = (89 - d) / 89;
    if (rand() < 0.88) {
      const when = at(d, '07:00', 25);
      if (when <= opts.now) {
        const v = Math.round(152 - 22 * progress + gaussian(rand) * 11);
        readings.push({ type: 'glucose', value: v, unit: 'mg/dL', valueCanonical: v, context: 'fasting', measuredAt: when.toISOString(), timezone: tz, source: 'demo' });
      }
    }
    if (rand() < 0.42) {
      const when = at(d, '13:45', 30);
      if (when <= opts.now) {
        const v = Math.round(182 - 18 * progress + gaussian(rand) * 18);
        readings.push({ type: 'glucose', value: v, unit: 'mg/dL', valueCanonical: v, context: 'after_meal', measuredAt: when.toISOString(), timezone: tz, source: 'demo' });
      }
    }
    if (rand() < 0.8) {
      const when = at(d, '07:20', 20);
      if (when <= opts.now) {
        const s = Math.round(139 - 10 * progress + gaussian(rand) * 6);
        const di = Math.round(87 - 6 * progress + gaussian(rand) * 4);
        const pulse = Math.round(74 + gaussian(rand) * 4);
        readings.push({ type: 'blood_pressure', unit: 'mmHg', systolic: s, diastolic: Math.min(di, s - 20), pulse, context: 'seated_rest', measuredAt: when.toISOString(), timezone: tz, source: 'demo' });
      }
    }
    if (d % 7 === 0) {
      const when = at(d, '06:50', 10);
      if (when <= opts.now) {
        const kg = Math.round((84.2 - 2.6 * progress + gaussian(rand) * 0.3) * 10) / 10;
        readings.push({ type: 'weight', value: kg, unit: 'kg', valueCanonical: kg, measuredAt: when.toISOString(), timezone: tz, source: 'demo' });
      }
    }
  }
  // A few notable readings so escalation cards and trends are visible in the demo.
  readings.push({ type: 'glucose', value: 64, unit: 'mg/dL', valueCanonical: 64, context: 'bedtime', measuredAt: at(12, '22:10').toISOString(), timezone: tz, source: 'demo', notes: 'Felt shaky after a long walk (sample).' });
  readings.push({ type: 'glucose', value: 268, unit: 'mg/dL', valueCanonical: 268, context: 'after_meal', measuredAt: at(41, '14:00').toISOString(), timezone: tz, source: 'demo', notes: 'Birthday dinner (sample).' });
  for (const d of [20, 9, 2]) {
    readings.push({ type: 'spo2', value: 97 + (d % 2), unit: '%', valueCanonical: 97 + (d % 2), measuredAt: at(d, '08:00').toISOString(), timezone: tz, source: 'demo' });
  }
  await db.transaction(async (tx) => {
    for (const r of readings) await insertReading(tx, pid, r, r.measuredAt);
  });

  // Labs: past results and an upcoming fasting test.
  const a1cOld = await createLabTest(db, pid, { name: 'HbA1c', orderedBy: DEMO_CLINICIAN, scheduledAt: at(88, '09:00').toISOString(), timezone: tz, status: 'completed' }, at(88, '12:00').toISOString());
  await addLabResult(db, pid, a1cOld, { analyte: 'HbA1c', valueNum: 7.9, unit: '%', referenceText: '4.0–5.6 %', labFlag: 'H', resultDate: addDays(today, -87) });
  const panel = await createLabTest(
    db,
    pid,
    { name: 'Quarterly diabetes panel', orderedBy: DEMO_CLINICIAN, scheduledAt: at(12, '08:30').toISOString(), timezone: tz, status: 'completed', fastingRequired: true },
    at(12, '12:00').toISOString(),
  );
  const resultDate = addDays(today, -11);
  await addLabResult(db, pid, panel, { analyte: 'HbA1c', valueNum: 7.2, unit: '%', referenceText: '4.0–5.6 %', labFlag: 'H', resultDate });
  await addLabResult(db, pid, panel, { analyte: 'LDL cholesterol', valueNum: 104, unit: 'mg/dL', referenceText: '<100 mg/dL', labFlag: 'H', resultDate });
  await addLabResult(db, pid, panel, { analyte: 'eGFR', valueNum: 78, unit: 'mL/min/1.73m²', referenceText: '≥60', resultDate });
  await addLabResult(db, pid, panel, { analyte: 'Urine albumin/creatinine (UACR)', valueNum: 18, unit: 'mg/g', referenceText: '<30 mg/g', resultDate });
  await createLabTest(db, pid, {
    name: 'Fasting lipid panel',
    orderedBy: DEMO_CLINICIAN,
    location: 'Riverside Lab (fictional)',
    scheduledAt: at(-20, '08:00').toISOString(),
    timezone: tz,
    fastingRequired: true,
    preparationNotes: 'Lab instructions (sample): no food for 10–12 hours before; water is fine. Bring the request form.',
    reminderMinutesBefore: 720,
  });

  await createAppointment(
    db,
    pid,
    {
      title: 'Diabetes & blood pressure review',
      clinician: DEMO_CLINICIAN,
      location: 'Riverside Family Clinic (fictional)',
      startsAt: at(-6, '10:30').toISOString(),
      timezone: tz,
      durationMin: 30,
      reminderMinutesBefore: 120,
      preparationNotes: 'Bring your glucose meter and medication list.',
      questions: 'Ask whether the low reading after my walk means my plan should change.',
    },
    setupIso,
  );
  await createAppointment(db, pid, { title: 'Eye exam (retina screening)', clinician: 'Eye clinic (fictional)', startsAt: at(-40, '14:00').toISOString(), timezone: tz, durationMin: 45, reminderMinutesBefore: 1440 }, setupIso);
  const past90 = await createAppointment(db, pid, { title: 'Diabetes review', clinician: DEMO_CLINICIAN, startsAt: at(85, '10:30').toISOString(), timezone: tz, status: 'completed' }, setupIso);
  void past90;

  await logAudit(db, { profileId: pid, action: 'seed', entityType: 'profile', entityId: pid, detail: 'fictional demo data' });
  return profile;
}
