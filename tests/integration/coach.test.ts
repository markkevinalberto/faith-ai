import { buildLabNote, buildReadingNote } from '@/ai/coach';
import { getBiomarker } from '@/ai/knowledge/biomarkers';
import { addLabResult, createLabTest } from '@/db/repo/care';
import { upsertTarget } from '@/db/repo/profiles';
import { addReading, getReading, type ReadingInput } from '@/db/repo/vitals';
import type { SqlDatabase } from '@/db/sql';
import type { Profile, VitalReading } from '@/domain/types';
import { makeProfile } from './helpers/fixtures';
import { createMigratedDatabase } from './helpers/nodeDb';

const NOW = new Date('2026-10-09T08:00:00.000Z');
const DAY = 86_400_000;
let db: SqlDatabase;
let profile: Profile;

const glucose = (mgdl: number, daysAgo: number, context: ReadingInput['context']): ReadingInput => ({
  type: 'glucose',
  value: mgdl,
  valueCanonical: mgdl,
  unit: 'mg/dL',
  context,
  measuredAt: new Date(NOW.getTime() - daysAgo * DAY).toISOString(),
  timezone: 'UTC',
});

async function save(input: ReadingInput): Promise<VitalReading> {
  const id = await addReading(db, profile.id, input);
  return (await getReading(db, profile.id, id)) as VitalReading;
}

beforeEach(async () => {
  db = await createMigratedDatabase();
  profile = await makeProfile(db, 'Test Person A', 'UTC');
});

describe("FAITH's note after a reading", () => {
  it('compares a fasting glucose with the reference range and earlier fasting readings only', async () => {
    for (const [v, d] of [
      [150, 3],
      [148, 2],
      [145, 1],
    ] as const)
      await save(glucose(v, d, 'fasting'));
    await save(glucose(210, 1, 'after_meal'));
    const reading = await save(glucose(142, 0, 'fasting'));

    const note = await buildReadingNote({ db, profile, reading, now: NOW, timeZone: 'UTC' });
    expect(note?.summary).toMatch(/^Your fasting glucose of 142 mg\/dL is above the general reference range \(80.130 mg\/dL\)\. That range is general, not personalised\.$/);
    expect(note?.details[0]).toMatch(/^Your previous fasting glucose reading was 145 mg\/dL on .+\. This one is 3 mg\/dL lower\.$/);
    expect(note?.details[1]).toBe('4 of your last 4 fasting glucose readings in the past 7 days were above the general reference range.');
    expect(note?.tips.map((t) => t.id)).toEqual(['glucose.high.fasting', 'glucose.activity', 'glucose.high.repeated']);
    expect(note?.requiredPhrase).toBe('above the general reference range');
    expect(note?.sources).toEqual(['American Diabetes Association', 'World Health Organization']);
  });

  it("uses the clinician's own blood pressure target when one is recorded", async () => {
    await upsertTarget(db, profile.id, { metric: 'bp_systolic', low: null, high: 140, unit: 'mmHg', setBy: 'Dr. Example' });
    await upsertTarget(db, profile.id, { metric: 'bp_diastolic', low: null, high: 90, unit: 'mmHg', setBy: 'Dr. Example' });
    const reading = await save({ type: 'blood_pressure', unit: 'mmHg', systolic: 128, diastolic: 82, pulse: 70, measuredAt: NOW.toISOString(), timezone: 'UTC' });

    const note = await buildReadingNote({ db, profile, reading, now: NOW, timeZone: 'UTC' });
    expect(note?.summary).toMatch(/^Your blood pressure of 128\/82 mmHg is within your target \(.*140.*\)\.$/);
    expect(note?.summary).not.toMatch(/not personalised/);
    expect(note?.tips.map((t) => t.id)).toEqual(['bp.within']);
    expect(note?.details).toEqual([]);
  });

  it('asks for meal timing when a glucose reading has none', async () => {
    const reading = await save(glucose(160, 0, null));
    const note = await buildReadingNote({ db, profile, reading, now: NOW, timeZone: 'UTC' });
    expect(note?.summary).toBe('Your glucose of 160 mg/dL is saved. It has no meal timing, so it is not compared with a target.');
    expect(note?.requiredPhrase).toBeNull();
    expect(note?.tips.map((t) => t.id)).toEqual(['glucose.no_context']);
  });

  it('has no note for weight', async () => {
    const reading = await save({ type: 'weight', value: 80, valueCanonical: 80, unit: 'kg', measuredAt: NOW.toISOString(), timezone: 'UTC' });
    expect(await buildReadingNote({ db, profile, reading, now: NOW, timeZone: 'UTC' })).toBeNull();
  });
});

describe("FAITH's note after a lab result", () => {
  it('places HbA1c on the ADA scale and compares it with the previous result, not itself', async () => {
    const lab = await createLabTest(db, profile.id, { name: 'Lab report', status: 'completed' });
    await addLabResult(db, profile.id, lab, { analyte: 'HbA1c', valueNum: 7.4, unit: '%', resultDate: '2026-07-01' });
    const resultId = await addLabResult(db, profile.id, lab, { analyte: 'HbA1c', valueNum: 7, unit: '%', resultDate: '2026-10-09' });

    const note = await buildLabNote({ db, profile, biomarker: getBiomarker('hba1c')!, value: 7, unit: '%', resultId });
    expect(note.summary).toBe('Your HbA1c of 7 % is in the diabetes range (6.5 % and above). This is a general reference, not personalised.');
    expect(note.details).toEqual([expect.stringMatching(/^Your previous HbA1c was 7\.4 % on .+\. This result is 0\.4 % lower\.$/)]);
    expect(note.tips.map((t) => t.id)).toEqual(['hba1c.above', 'hba1c.log', 'lab.discuss']);
    expect(note.requiredPhrase).toBe('in the diabetes range');
  });
});
