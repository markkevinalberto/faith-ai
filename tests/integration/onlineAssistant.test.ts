import { answerQuestion } from '@/ai/answer';
import { getOnlineEngine, resetOnlineSettingsForTests, saveOnlineSettings } from '@/ai/inference/onlineAssistant';
import type { ChatMessage, GenerateOptions, InferenceEngine } from '@/ai/inference/types';
import { addReading } from '@/db/repo/vitals';
import type { SqlDatabase } from '@/db/sql';
import type { Profile } from '@/domain/types';
import { makeProfile } from './helpers/fixtures';
import { createMigratedDatabase } from './helpers/nodeDb';

// The API key store, in memory for tests (expo-secure-store on the phone, localStorage in the browser).
jest.mock('@/services/secret', () => {
  const store = new Map<string, string>();
  return {
    getSecret: async (name: string) => store.get(name) ?? null,
    setSecret: async (name: string, value: string | null) => {
      if (value) store.set(name, value);
      else store.delete(name);
    },
  };
});

const NOW = new Date('2026-10-09T12:00:00.000Z');
let db: SqlDatabase;
let profile: Profile;

class FakeEngine implements InferenceEngine {
  calls: ChatMessage[][] = [];
  constructor(
    readonly id: string,
    readonly label: string,
    readonly runsOnDevice: boolean,
    private readonly respond: () => string | Promise<string>,
  ) {}
  isReady() {
    return true;
  }
  async generate(messages: ChatMessage[], opts: GenerateOptions) {
    this.calls.push(messages);
    const text = await this.respond();
    opts.onToken?.(text);
    return { text, tokens: 10, durationMs: 5, tokensPerSecond: 2000, interrupted: false };
  }
  async stop() {}
}

const SAFE = 'Here is what your readings show; tell me if you would like the trend too.';

beforeEach(async () => {
  db = await createMigratedDatabase();
  profile = await makeProfile(db, 'Test Person A', 'UTC');
  for (const [v, d] of [
    [128, 3],
    [141, 2],
    [150, 1],
  ] as const) {
    await addReading(db, profile.id, { type: 'glucose', value: v, valueCanonical: v, unit: 'mg/dL', context: 'fasting', measuredAt: new Date(NOW.getTime() - d * 86_400_000).toISOString(), timezone: 'UTC' });
  }
});

const ask = (online: InferenceEngine | null, engine: InferenceEngine | null, history?: { question: string; answer: string }[]) =>
  answerQuestion({ db, profile, question: 'Summarize my glucose this week', now: NOW, timeZone: 'UTC', online, engine, history });

describe('the online assistant in Ask FAITH', () => {
  it('answers with the online assistant first and marks the answer as online', async () => {
    const online = new FakeEngine('online', 'gpt · Groq (online)', false, () => SAFE);
    const local = new FakeEngine('local', 'Fake on-device engine', true, () => SAFE);
    const a = await ask(online, local);
    expect(a.generated).toMatchObject({ text: SAFE, engineLabel: 'gpt · Groq (online)', online: true });
    expect(a.generationNote).toBeNull();
    expect(online.calls).toHaveLength(1);
    expect(local.calls).toHaveLength(0);
  });

  it('falls back to the on-device model when the online assistant cannot be reached', async () => {
    const online = new FakeEngine('online', 'gpt · Groq (online)', false, () => {
      throw new Error('Could not reach the online assistant. Check your connection.');
    });
    const local = new FakeEngine('local', 'Fake on-device engine', true, () => SAFE);
    const a = await ask(online, local);
    expect(a.generated).toMatchObject({ engineLabel: 'Fake on-device engine', online: false });
    expect(a.generationNote).toMatch(/online assistant could not finish \(Could not reach/);
  });

  it('falls back when the online draft fails the safety guard', async () => {
    const online = new FakeEngine('online', 'gpt · Groq (online)', false, () => 'Your numbers look fine; you should double your metformin dose.');
    const local = new FakeEngine('local', 'Fake on-device engine', true, () => SAFE);
    const a = await ask(online, local);
    expect(a.generated?.online).toBe(false);
    expect(a.generationNote).toMatch(/online assistant's draft did not pass FAITH's safety checks/);
  });

  it('shows the record summary when both fail', async () => {
    const online = new FakeEngine('online', 'gpt · Groq (online)', false, () => 'It is perfectly normal.');
    const local = new FakeEngine('local', 'Fake on-device engine', true, () => 'Take an extra tablet tonight.');
    const a = await ask(online, local);
    expect(a.generated).toBeNull();
    expect(a.facts.length).toBeGreaterThan(0);
    expect(a.generationNote).toMatch(/Showing the record summary instead/);
  });

  it('gives the online model the last four exchanges and the on-device model only the last one', async () => {
    const history = [1, 2, 3, 4, 5].map((n) => ({ question: `question ${n}`, answer: `answer ${n}` }));
    const online = new FakeEngine('online', 'gpt · Groq (online)', false, () => SAFE);
    await ask(online, null, history);
    const onlineTurns = online.calls[0].filter((m) => m.role === 'assistant').map((m) => m.content);
    expect(onlineTurns).toEqual(['answer 2', 'answer 3', 'answer 4', 'answer 5']);

    const local = new FakeEngine('local', 'Fake on-device engine', true, () => SAFE);
    await ask(null, local, history);
    expect(local.calls[0].filter((m) => m.role === 'assistant').map((m) => m.content)).toEqual(['answer 5']);
  });
});

describe('when the online assistant is used', () => {
  beforeEach(() => resetOnlineSettingsForTests());

  it('is off by default and needs a key', async () => {
    expect(await getOnlineEngine(db)).toBeNull();
    await saveOnlineSettings(db, { enabled: true });
    expect(await getOnlineEngine(db)).toBeNull();
    await saveOnlineSettings(db, {}, 'test-key');
    const engine = await getOnlineEngine(db);
    expect(engine?.runsOnDevice).toBe(false);
    expect(engine?.label).toBe('openai/gpt-oss-120b · Groq (online)');
  });

  it('needs an address and a model for a custom service', async () => {
    await saveOnlineSettings(db, { enabled: true, provider: 'custom' }, 'test-key');
    expect(await getOnlineEngine(db)).toBeNull();
    await saveOnlineSettings(db, { baseUrl: 'http://localhost:8099/v1', model: 'mock' });
    expect((await getOnlineEngine(db))?.label).toBe('mock · Custom (OpenAI-compatible) (online)');
  });

  it('removing the key switches it off', async () => {
    await saveOnlineSettings(db, { enabled: true }, 'test-key');
    expect(await getOnlineEngine(db)).not.toBeNull();
    await saveOnlineSettings(db, { enabled: false }, '');
    expect(await getOnlineEngine(db)).toBeNull();
  });
});
