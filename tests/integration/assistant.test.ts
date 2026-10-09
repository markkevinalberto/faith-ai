import { answerQuestion } from '@/ai/answer';
import type { ChatMessage, GenerateOptions, InferenceEngine } from '@/ai/inference/types';
import { createAppointment, addLabResult, createLabTest } from '@/db/repo/care';
import { syncDoseEvents } from '@/db/repo/doseEvents';
import { addReading } from '@/db/repo/vitals';
import type { SqlDatabase } from '@/db/sql';
import type { Profile } from '@/domain/types';
import { makeMedication, makeProfile } from './helpers/fixtures';
import { createMigratedDatabase } from './helpers/nodeDb';

const NOW = new Date('2026-10-09T12:00:00.000Z');
let db: SqlDatabase;
let profile: Profile;
let fetchSpy: jest.SpyInstance;

class FakeEngine implements InferenceEngine {
  readonly id = 'fake';
  readonly label = 'Fake on-device engine';
  readonly runsOnDevice = true as const;
  calls = 0;
  constructor(private readonly respond: (prompt: string) => string | Promise<string>) {}
  isReady() {
    return true;
  }
  async generate(messages: ChatMessage[], opts: GenerateOptions) {
    this.calls++;
    const text = await this.respond(messages[messages.length - 1].content);
    opts.onToken?.(text);
    return { text, tokens: 20, durationMs: 5, tokensPerSecond: 4000, interrupted: false };
  }
  async stop() {}
}

beforeAll(() => {
  fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(() => {
    throw new Error('Network access is not allowed in FAITH core features');
  });
});
afterAll(() => fetchSpy.mockRestore());

beforeEach(async () => {
  db = await createMigratedDatabase();
  profile = await makeProfile(db, 'Test Person A', 'UTC');
  await makeMedication(db, profile.id, { name: 'Metformin', strength: '500 mg', doseInstructions: 'Take 1 tablet twice daily with meals' });
  const fasting = [128, 141, 150, 136, 152, 147, 139, 160];
  for (let i = 0; i < fasting.length; i++) {
    await addReading(db, profile.id, {
      type: 'glucose',
      value: fasting[i],
      valueCanonical: fasting[i],
      unit: 'mg/dL',
      context: 'fasting',
      measuredAt: new Date(NOW.getTime() - (fasting.length - i) * 86_400_000).toISOString(),
      timezone: 'UTC',
    });
  }
  const lab = await createLabTest(db, profile.id, { name: 'HbA1c', status: 'completed' });
  await addLabResult(db, profile.id, lab, { analyte: 'HbA1c', valueNum: 7.4, unit: '%', resultDate: '2026-09-20', referenceText: '4.0–5.6 %' });
  await createAppointment(db, profile.id, { title: 'Diabetes review', clinician: 'Dr. Example', startsAt: '2026-10-20T02:00:00.000Z', timezone: 'UTC' });
  await syncDoseEvents(db, profile.id, { now: NOW, timeZone: 'UTC' });
});
afterEach(async () => {
  await db.close();
});

const ask = (question: string, engine: InferenceEngine | null = null, p: Profile = profile) =>
  answerQuestion({ db, profile: p, question, now: NOW, timeZone: 'UTC', engine });

describe('Ask FAITH without a model (deterministic fallback)', () => {
  it('summarizes readings from records with computed statistics and target sources', async () => {
    const a = await ask('Summarize my glucose this week');
    expect(a.intent).toBe('readings_summary');
    expect(a.generated).toBeNull();
    expect(a.generationNote).toMatch(/not loaded/);
    const summary = a.facts.find((f) => f.id === 'glucose.summary');
    expect(summary?.text).toMatch(/7 readings/);
    const fasting = a.facts.find((f) => f.id === 'glucose.context.fasting');
    expect(fasting?.text).toMatch(/general reference range \(not personalised\)/);
    expect(fasting?.text).toMatch(/Target source: ADA/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('finds recorded medication instructions', async () => {
    const a = await ask('How do I take metformin?');
    expect(a.facts[0].text).toContain('Take 1 tablet twice daily with meals');
  });

  it('summarizes lab results with the report reference range', async () => {
    const a = await ask('What were my latest lab results?');
    expect(a.facts.find((f) => f.label === 'Lab · HbA1c')?.text).toMatch(/7\.4 %.*4\.0–5\.6 %/);
  });

  it('explains terms from the library with sources and links to own data', async () => {
    const a = await ask('What is HbA1c?');
    expect(a.references[0].id).toBe('hba1c');
    expect(a.facts.some((f) => f.label === 'Lab · HbA1c')).toBe(true);
  });

  it('prepares data-driven clinician questions', async () => {
    const a = await ask('Prepare questions for my next appointment');
    expect(a.facts.some((f) => f.kind === 'question' && /fasting glucose readings were above/.test(f.text))).toBe(true);
  });
});

describe('safety routing', () => {
  it('handles emergencies without retrieval or generation', async () => {
    const engine = new FakeEngine(() => 'irrelevant');
    const a = await ask('I have crushing chest pain', engine);
    expect(a.intent).toBe('emergency');
    expect(a.escalation?.level).toBe('emergency');
    expect(a.facts).toEqual([]);
    expect(engine.calls).toBe(0);
  });

  it('refuses dose changes, shows recorded instructions and never calls the model', async () => {
    const engine = new FakeEngine(() => 'Take two tablets.');
    const a = await ask('I missed my metformin dose, should I take two?', engine);
    expect(a.intent).toBe('dose_change');
    expect(a.refusal).toMatch(/can't advise on changing/);
    expect(a.facts[0].text).toContain('Take 1 tablet twice daily with meals');
    expect(a.references[0].id).toBe('missed-dose');
    expect(engine.calls).toBe(0);
  });
});

describe('with an on-device engine', () => {
  it('shows grounded generated text, labelled with the engine', async () => {
    const engine = new FakeEngine((prompt) => {
      const avg = /Average (\d+ mg\/dL)/.exec(prompt)?.[1];
      return `Your fasting readings averaged ${avg} this week. You could discuss them with your clinician.`;
    });
    const a = await ask('Summarize my glucose this week', engine);
    expect(engine.calls).toBe(1);
    expect(a.generated?.text).toMatch(/averaged \d+ mg\/dL/);
    expect(a.generated?.engineLabel).toBe('Fake on-device engine');
  });

  it('drops generated text that fails the guard (dose advice, invented numbers)', async () => {
    const bad = await ask('Summarize my glucose this week', new FakeEngine(() => 'You should increase your dose of metformin.'));
    expect(bad.generated).toBeNull();
    expect(bad.generationNote).toMatch(/did not pass FAITH's safety checks/);
    expect(bad.facts.length).toBeGreaterThan(0);

    const invented = await ask('Summarize my glucose this week', new FakeEngine(() => 'Your average was 199 mg/dL.'));
    expect(invented.generated).toBeNull();
  });

  it('falls back when the engine fails', async () => {
    const a = await ask(
      'Summarize my glucose this week',
      new FakeEngine(() => {
        throw new Error('out of memory');
      }),
    );
    expect(a.generated).toBeNull();
    expect(a.generationNote).toMatch(/could not finish \(out of memory\)/);
  });
});

describe('profile isolation in the assistant', () => {
  it('never answers with another profile’s records', async () => {
    const other = await makeProfile(db, 'Test Person B', 'UTC');
    const a = await ask('Summarize my glucose this week', null, other);
    expect(a.facts).toEqual([]);
    const meds = await ask('How do I take metformin?', null, other);
    expect(JSON.stringify(meds)).not.toContain('twice daily');
  });
});
