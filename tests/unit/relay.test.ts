// eslint-disable-next-line @typescript-eslint/no-require-imports
const relay = require('../../web/api/chat/completions.js') as ((req: MockReq, res: MockRes) => Promise<void>) & {
  allow: (ip: string, now?: number) => boolean;
  validate: (body: unknown) => string | null;
};

interface MockReq {
  method: string;
  headers: Record<string, string>;
  body?: unknown;
  socket?: { remoteAddress?: string };
}

interface MockRes {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  setHeader: (k: string, v: string) => void;
  status: (s: number) => MockRes;
  end: (b?: string) => MockRes;
}

function res(): MockRes {
  const r: MockRes = {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(k, v) {
      r.headers[k] = v;
    },
    status(s) {
      r.statusCode = s;
      return r;
    },
    end(b) {
      r.body = b ?? '';
      return r;
    },
  };
  return r;
}

const post = (body: unknown, ip = '203.0.113.5'): MockReq => ({ method: 'POST', headers: { 'x-forwarded-for': ip, 'content-type': 'application/json' }, body });
const messages = [
  { role: 'system', content: 'rules' },
  { role: 'user', content: 'my hba1c is 4.7' },
];

let fetchSpy: jest.SpyInstance;
beforeEach(() => {
  process.env.GROQ_API_KEY = 'test-server-key';
  fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 }));
});
afterEach(() => {
  fetchSpy.mockRestore();
  delete process.env.GROQ_API_KEY;
});

describe("FAITH's shared assistant relay", () => {
  it('forwards a chat request to Groq with the server-side key and an allowed model', async () => {
    const r = res();
    await relay(post({ model: 'openai/gpt-oss-120b', messages, max_tokens: 320, temperature: 0.2 }, '198.51.100.1'), r);
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body)).toMatchObject({ choices: [{ message: { content: 'ok' } }] });
    expect(r.headers['access-control-allow-origin']).toBe('*');
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer test-server-key');
    expect(JSON.parse(init.body as string)).toMatchObject({ model: 'openai/gpt-oss-120b', messages, max_tokens: 320, stream: false, reasoning_effort: 'low' });
  });

  it('replaces unknown models, caps tokens, and never passes extra fields through', async () => {
    const r = res();
    await relay(post({ model: 'gpt-4o', messages, max_tokens: 5000, tools: [{}] }, '198.51.100.2'), r);
    const body = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.model).toBe('openai/gpt-oss-120b');
    expect(body.max_tokens).toBe(400);
    expect(body.tools).toBeUndefined();
  });

  it('rejects bad requests without calling Groq', async () => {
    for (const body of [null, {}, { messages: [] }, { messages: [{ role: 'tool', content: 'x' }] }, { messages: [{ role: 'user', content: 'x'.repeat(20_000) }] }]) {
      const r = res();
      await relay(post(body, '198.51.100.3'), r);
      expect(r.statusCode).toBe(400);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(relay.validate({ messages: Array.from({ length: 13 }, () => ({ role: 'user', content: 'hi' })) })).toBe('too many messages');
  });

  it('says so when the server has no key', async () => {
    delete process.env.GROQ_API_KEY;
    const r = res();
    await relay(post({ messages }, '198.51.100.4'), r);
    expect(r.statusCode).toBe(503);
    expect(JSON.parse(r.body).error.message).toMatch(/not set up/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('slows down a client that hammers it', () => {
    const ip = '198.51.100.9';
    const t0 = 1_000_000;
    const results = Array.from({ length: 8 }, () => relay.allow(ip, t0));
    expect(results).toEqual([true, true, true, true, true, true, false, false]);
    expect(relay.allow(ip, t0 + 10_000)).toBe(true);
  });

  it('answers CORS preflight', async () => {
    const r = res();
    await relay({ method: 'OPTIONS', headers: {} }, r);
    expect(r.statusCode).toBe(204);
    expect(r.headers['access-control-allow-methods']).toContain('POST');
  });
});
