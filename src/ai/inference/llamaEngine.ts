/**
 * llama.rn (llama.cpp) engine. Runs entirely on the device CPU. Loaded lazily so web builds and
 * tests never touch the native module.
 */
import type { ChatMessage, GenerateOptions, GenerateResult, InferenceEngine } from './types';

type LlamaModule = typeof import('llama.rn');
type LlamaContext = Awaited<ReturnType<LlamaModule['initLlama']>>;

const STOP_WORDS = ['<|im_end|>', '<|endoftext|>', '</s>', '<|eot_id|>'];

export class LlamaRnEngine implements InferenceEngine {
  readonly runsOnDevice = true as const;
  private busy = false;

  private constructor(
    readonly id: string,
    readonly label: string,
    private ctx: LlamaContext | null,
  ) {}

  static async load(params: { id: string; label: string; modelPath: string; onProgress?: (pct: number) => void }): Promise<LlamaRnEngine> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { initLlama } = require('llama.rn') as LlamaModule;
    const ctx = await initLlama(
      {
        model: params.modelPath,
        n_ctx: 2048,
        n_batch: 512,
        // CPU inference for broad device compatibility; GPU offload can be enabled later per device.
        n_gpu_layers: 0,
        use_mlock: false,
        use_mmap: true,
      },
      (p) => params.onProgress?.(p),
    );
    return new LlamaRnEngine(`llama.rn:${params.id}`, params.label, ctx);
  }

  isReady(): boolean {
    return this.ctx !== null && !this.busy;
  }

  async generate(messages: ChatMessage[], opts: GenerateOptions): Promise<GenerateResult> {
    const ctx = this.ctx;
    if (!ctx) throw new Error('model not loaded');
    if (this.busy) throw new Error('model is busy');
    this.busy = true;
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const completion = ctx.completion(
        {
          messages,
          n_predict: opts.maxTokens,
          temperature: opts.temperature,
          top_p: 0.9,
          top_k: 40,
          penalty_repeat: 1.1,
          stop: [...STOP_WORDS, ...(opts.stop ?? [])],
          ...(opts.jsonSchema ? { response_format: { type: 'json_schema' as const, json_schema: { strict: true, schema: opts.jsonSchema } } } : {}),
        },
        (data) => {
          if (data.token) opts.onToken?.(data.token);
        },
      );
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          void ctx.stopCompletion();
          reject(new Error('timed out'));
        }, opts.timeoutMs ?? 90_000);
      });
      const res = await Promise.race([completion, timeout]);
      return {
        text: (res.content || res.text || '').trim(),
        tokens: res.tokens_predicted,
        durationMs: Date.now() - started,
        tokensPerSecond: res.timings?.predicted_per_second ?? null,
        interrupted: res.interrupted,
      };
    } finally {
      if (timer) clearTimeout(timer);
      this.busy = false;
    }
  }

  async stop(): Promise<void> {
    await this.ctx?.stopCompletion();
  }

  async release(): Promise<void> {
    const ctx = this.ctx;
    this.ctx = null;
    await ctx?.release();
  }
}
