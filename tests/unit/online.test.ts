import { CloudEngine, stripReasoning } from '@/ai/inference/cloudEngine';
import { buildMessages, historyContext } from '@/ai/prompt';

type FetchMock = jest.Mock & typeof fetch;

const okResponse = (content: string) =>
  jest.fn(async () => ({ ok: true, status: 200, statusText: 'OK', json: async () => ({ choices: [{ message: { content } }], usage: { completion_tokens: 12 } }) })) as unknown as FetchMock;

const errorResponse = (status: number, message: string) =>
  jest.fn(async () => ({ ok: false, status, statusText: 'error', json: async () => ({ error: { message } }) })) as unknown as FetchMock;

const engineWith = (fetchImpl: typeof fetch, extra: Partial<ConstructorParameters<typeof CloudEngine>[0]> = {}) =>
  new CloudEngine({ baseUrl: 'https://api.groq.com/openai/v1/', model: 'openai/gpt-oss-120b', apiKey: 'test-key', providerLabel: 'Groq', fetchImpl, ...extra });

describe('online assistant engine', () => {
  it('sends an OpenAI-style chat request with the key and returns the answer', async () => {
    const fetchImpl = okResponse('Your HbA1c of 4.7 % is below the prediabetes range.');
    const engine = engineWith(fetchImpl, { extraBody: { reasoning_effort: 'low' } });
    const r = await engine.generate(
      [
        { role: 'system', content: 'rules' },
        { role: 'user', content: 'q' },
      ],
      { maxTokens: 100, temperature: 0.2, timeoutMs: 5000 },
    );
    expect(r.text).toBe('Your HbA1c of 4.7 % is below the prediabetes range.');
    expect(r.tokens).toBe(12);
    expect(engine.runsOnDevice).toBe(false);
    expect(engine.label).toBe('openai/gpt-oss-120b · Groq (online)');
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer test-key');
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: 'openai/gpt-oss-120b',
      stream: false,
      max_tokens: 100,
      temperature: 0.2,
      reasoning_effort: 'low',
      messages: [
        { role: 'system', content: 'rules' },
        { role: 'user', content: 'q' },
      ],
    });
  });

  it('keeps only the answer from reasoning models', () => {
    expect(stripReasoning('<think>hmm, 142 is above</think>\nYour reading is above your target.')).toBe('Your reading is above your target.');
    expect(stripReasoning('Plain answer.')).toBe('Plain answer.');
  });

  it('turns HTTP errors into plain messages', async () => {
    const gen = (f: typeof fetch) => engineWith(f).generate([{ role: 'user', content: 'q' }], { maxTokens: 10, temperature: 0, timeoutMs: 1000 });
    await expect(gen(errorResponse(401, 'invalid api key'))).rejects.toThrow(/API key was rejected/);
    await expect(gen(errorResponse(429, 'rate limit'))).rejects.toThrow(/busy or its free quota/);
    await expect(gen(errorResponse(500, 'boom'))).rejects.toThrow(/500: boom/);
  });

  it('gives a plain message when the network is unreachable', async () => {
    const f = jest.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    await expect(engineWith(f).generate([{ role: 'user', content: 'q' }], { maxTokens: 10, temperature: 0, timeoutMs: 1000 })).rejects.toThrow(/Could not reach/);
  });

  it('is not ready without a key', () => {
    expect(engineWith(okResponse('x'), { apiKey: '' }).isReady()).toBe(false);
    expect(engineWith(okResponse('x')).isReady()).toBe(true);
  });
});

describe('chat history in the prompt', () => {
  it('replays earlier turns before the facts', () => {
    const msgs = buildMessages('and last month?', [], [], [{ question: 'my bp this week?', answer: 'Average 130/82 mmHg.' }]);
    expect(msgs.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(msgs[1].content).toBe('my bp this week?');
    expect(msgs[2].content).toBe('Average 130/82 mmHg.');
    expect(msgs[3].content).toMatch(/^QUESTION: and last month\?/);
    expect(historyContext([{ question: 'q', answer: 'Average 130/82 mmHg.' }])).toContain('130/82');
  });
});
