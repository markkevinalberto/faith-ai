/**
 * The optional online assistant: an InferenceEngine over any OpenAI-compatible chat API (Groq by
 * default). It receives exactly what the on-device model would (system prompt, computed facts,
 * library excerpts, the question) and its output goes through the same guard. Nothing is streamed
 * to the screen before the guard runs, so a single non-streaming request is enough.
 */
import type { ChatMessage, GenerateOptions, GenerateResult, InferenceEngine } from './types';

export interface CloudEngineConfig {
  /** e.g. https://api.groq.com/openai/v1 */
  baseUrl: string;
  model: string;
  apiKey: string;
  /** Shown next to answers, e.g. "Groq". */
  providerLabel: string;
  /** False for FAITH's shared relay, which holds the key server-side. Default true. */
  requiresKey?: boolean;
  /** Extra JSON fields for the request body (e.g. reasoning_effort for gpt-oss models). */
  extraBody?: Record<string, unknown>;
  /** Injected in tests. */
  fetchImpl?: typeof fetch;
}

interface ChatCompletion {
  choices?: { message?: { content?: string | null; reasoning?: string | null } }[];
  usage?: { completion_tokens?: number };
  error?: { message?: string };
}

/** Models that reason (gpt-oss, Qwen3) may wrap their thinking in tags; only the answer is kept. */
export function stripReasoning(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\|channel\|>analysis[\s\S]*?<\|channel\|>final<\|message\|>/g, '')
    .trim();
}

export class CloudEngine implements InferenceEngine {
  readonly runsOnDevice = false;
  readonly id: string;
  readonly label: string;
  private controller: AbortController | null = null;

  constructor(private readonly config: CloudEngineConfig) {
    this.id = `online:${config.providerLabel.toLowerCase()}:${config.model}`;
    this.label = `${config.model} · ${config.providerLabel} (online)`;
  }

  isReady(): boolean {
    return this.config.requiresKey === false || this.config.apiKey.length > 0;
  }

  async generate(messages: ChatMessage[], opts: GenerateOptions): Promise<GenerateResult> {
    const started = Date.now();
    const controller = new AbortController();
    this.controller = controller;
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);
    try {
      const res = await (this.config.fetchImpl ?? fetch)(`${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {}) },
        body: JSON.stringify({
          model: this.config.model,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          temperature: opts.temperature ?? 0.2,
          max_tokens: opts.maxTokens ?? 220,
          stream: false,
          ...this.config.extraBody,
        }),
        signal: controller.signal,
      });
      const body = (await res.json().catch(() => ({}))) as ChatCompletion;
      if (!res.ok) {
        const reason = body.error?.message ?? res.statusText;
        if (res.status === 401 || res.status === 403) throw new Error(`The online assistant's API key was rejected (${reason}).`);
        if (res.status === 429) throw new Error('The online assistant is busy or its free quota is used up for now.');
        throw new Error(`The online assistant returned an error (${res.status}: ${reason}).`);
      }
      const text = stripReasoning(body.choices?.[0]?.message?.content ?? '');
      opts.onToken?.(text);
      const durationMs = Date.now() - started;
      const tokens = body.usage?.completion_tokens ?? Math.round(text.length / 4);
      return { text, tokens, durationMs, tokensPerSecond: durationMs > 0 ? (tokens * 1000) / durationMs : null, interrupted: false };
    } catch (e) {
      if (controller.signal.aborted) throw new Error('The online assistant did not answer in time.');
      if (e instanceof TypeError) throw new Error('Could not reach the online assistant. Check your connection.');
      throw e;
    } finally {
      clearTimeout(timer);
      if (this.controller === controller) this.controller = null;
    }
  }

  async stop(): Promise<void> {
    this.controller?.abort();
  }
}
