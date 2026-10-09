// FAITH's shared online assistant: a small relay in front of Groq, so the app never carries a key.
//
// Deployed with the web build (dist-web/api/chat/completions.js, served at
// https://faith-ai-web.vercel.app/api/chat/completions) as a Vercel function. The key is the
// GROQ_API_KEY environment variable set in the Vercel project; it never reaches clients. Request
// bodies are checked, forwarded within limits, and never logged or stored here.
const UPSTREAM = 'https://api.groq.com/openai/v1/chat/completions';
const MODELS = new Set(['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b']);
const DEFAULT_MODEL = 'openai/gpt-oss-120b';
const MAX_MESSAGES = 12;
const MAX_CHARS = 16_000;
const MAX_TOKENS = 400;

// Per-instance rate limit: a burst of 6 requests per client, refilling one every 10 s. Function
// instances are short-lived, so this only blunts tight loops; Groq's own limits still apply.
const buckets = new Map();
function allow(ip, now = Date.now()) {
  const b = buckets.get(ip) || { tokens: 6, at: now };
  b.tokens = Math.min(6, b.tokens + (now - b.at) / 10_000);
  b.at = now;
  const ok = b.tokens >= 1;
  if (ok) b.tokens -= 1;
  buckets.set(ip, b);
  if (buckets.size > 5000) buckets.clear();
  return ok;
}

function validate(body) {
  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) return 'messages are required';
  if (body.messages.length > MAX_MESSAGES) return 'too many messages';
  let chars = 0;
  for (const m of body.messages) {
    if (!m || typeof m.content !== 'string' || !['system', 'user', 'assistant'].includes(m.role)) return 'invalid message';
    chars += m.content.length;
  }
  if (chars > MAX_CHARS) return 'prompt too long';
  return null;
}

function cors(res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type, authorization');
  res.setHeader('access-control-allow-methods', 'POST, OPTIONS');
  res.setHeader('cache-control', 'no-store');
}

function reply(res, status, body) {
  cors(res);
  res.setHeader('content-type', 'application/json');
  res.status(status).end(JSON.stringify(body));
}

async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    cors(res);
    return res.status(204).end();
  }
  if (req.method !== 'POST') return reply(res, 405, { error: { message: 'POST only' } });
  const key = process.env.GROQ_API_KEY;
  if (!key) return reply(res, 503, { error: { message: "FAITH's shared assistant is not set up on this server yet." } });
  const ip = String(req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || 'unknown')
    .split(',')[0]
    .trim();
  if (!allow(ip)) return reply(res, 429, { error: { message: 'Too many requests; please wait a moment.' } });

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = null;
    }
  }
  const problem = validate(body);
  if (problem) return reply(res, 400, { error: { message: problem } });

  const model = MODELS.has(body.model) ? body.model : DEFAULT_MODEL;
  const temperature = Number.isFinite(Number(body.temperature)) ? Math.min(1, Math.max(0, Number(body.temperature))) : 0.2;
  const upstream = await fetch(UPSTREAM, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: body.messages.map((m) => ({ role: m.role, content: m.content })),
      temperature,
      max_tokens: Math.min(MAX_TOKENS, Number(body.max_tokens) || 220),
      stream: false,
      ...(model.includes('gpt-oss') ? { reasoning_effort: 'low' } : { reasoning_format: 'hidden' }),
    }),
  });
  const text = await upstream.text();
  cors(res);
  res.setHeader('content-type', 'application/json');
  res.status(upstream.status).end(text);
}

module.exports = handler;
module.exports.allow = allow;
module.exports.validate = validate;
