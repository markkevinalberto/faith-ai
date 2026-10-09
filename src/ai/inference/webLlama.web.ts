/**
 * Browser runtime: llama.cpp compiled to WebAssembly (wllama), running the same GGUF files as the
 * phone inside a Web Worker. Multi-threaded when the page is cross-origin isolated, single-threaded
 * otherwise. Nothing leaves the browser except the one-time model download.
 */
import { Asset } from 'expo-asset';
import { LoggerWithoutDebug, Wllama, WllamaAbortError } from '@wllama/wllama/esm/index.js';

import type { Embedder } from '../semantic';
import type { ChatMessage, GenerateOptions, GenerateResult, InferenceEngine } from './types';
import type { Releasable, WebLoadParams } from './webLlama';

function wasmPaths(): { default: string } {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const uri = Asset.fromModule(require('@wllama/wllama/esm/wasm/wllama.wasm')).uri;
  return { default: uri };
}

function createRuntime(): Wllama {
  return new Wllama(wasmPaths(), { allowOffline: true, suppressNativeLog: true, logger: LoggerWithoutDebug });
}

const progress = (onProgress?: (pct: number) => void) => ({ loaded, total }: { loaded: number; total: number }) => onProgress?.(total > 0 ? Math.round((loaded / total) * 100) : 0);

function threadsLabel(w: Wllama): string {
  return w.isMultithread() ? `${w.getNumThreads()} threads` : 'single thread';
}

export class WllamaEngine implements InferenceEngine, Releasable {
  readonly runsOnDevice = true as const;
  private busy = false;
  private controller: AbortController | null = null;

  private constructor(
    readonly id: string,
    readonly label: string,
    private w: Wllama | null,
  ) {}

  static async load({ spec, onProgress }: WebLoadParams): Promise<WllamaEngine> {
    const w = createRuntime();
    await w.loadModelFromUrl(spec.url, { n_ctx: spec.contextLength, n_batch: 512, useCache: true, progressCallback: progress(onProgress) });
    return new WllamaEngine(`wllama:${spec.id}`, `${spec.name} · ${spec.quantization} · llama.cpp WebAssembly (${threadsLabel(w)}) in this browser`, w);
  }

  isReady(): boolean {
    return this.w !== null && !this.busy;
  }

  async generate(messages: ChatMessage[], opts: GenerateOptions): Promise<GenerateResult> {
    const w = this.w;
    if (!w) throw new Error('model not loaded');
    if (this.busy) throw new Error('model is busy');
    this.busy = true;
    const started = Date.now();
    const controller = new AbortController();
    this.controller = controller;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, opts.timeoutMs ?? 90_000);
    let text = '';
    let tokens = 0;
    let tokensPerSecond: number | null = null;
    let interrupted = false;
    try {
      await w.createChatCompletion({
        messages,
        max_tokens: opts.maxTokens,
        temperature: opts.temperature,
        top_p: 0.9,
        top_k: 40,
        penalty_repeat: 1.1,
        abortSignal: controller.signal,
        ...(opts.jsonSchema ? { response_format: { type: 'json_schema' as const, json_schema: { name: 'extraction', schema: opts.jsonSchema, strict: true } } } : {}),
        stream: true,
        onData: (chunk) => {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            text += delta;
            tokens += 1;
            opts.onToken?.(delta);
          }
          if (chunk.timings?.predicted_per_second) tokensPerSecond = chunk.timings.predicted_per_second;
        },
      });
    } catch (e) {
      if (timedOut) throw new Error('timed out');
      if (e instanceof WllamaAbortError || (e instanceof Error && e.name === 'AbortError')) interrupted = true;
      else throw e;
    } finally {
      clearTimeout(timer);
      this.busy = false;
      this.controller = null;
    }
    return { text: text.trim(), tokens, durationMs: Date.now() - started, tokensPerSecond, interrupted };
  }

  async stop(): Promise<void> {
    this.controller?.abort();
  }

  async release(): Promise<void> {
    const w = this.w;
    this.w = null;
    await w?.exit();
  }
}

export class WllamaEmbedder implements Embedder, Releasable {
  private queue: Promise<unknown> = Promise.resolve();

  private constructor(
    readonly id: string,
    private w: Wllama | null,
  ) {}

  static async load({ spec, onProgress }: WebLoadParams): Promise<WllamaEmbedder> {
    const w = createRuntime();
    await w.loadModelFromUrl(spec.url, {
      embeddings: true,
      pooling_type: 'mean',
      n_ctx: spec.contextLength,
      n_batch: spec.contextLength,
      n_ubatch: spec.contextLength,
      useCache: true,
      progressCallback: progress(onProgress),
    });
    return new WllamaEmbedder(`wllama:${spec.id}`, w);
  }

  embed(texts: string[]): Promise<number[][]> {
    const run = this.queue.then(async () => {
      const w = this.w;
      if (!w) throw new Error('embedding model not loaded');
      // One request per text: wllama 3.8 returns a single vector for an array input and stalls on
      // long arrays. Each call takes ~100 ms in WebAssembly and results are cached by the caller.
      const out: number[][] = [];
      for (const t of texts) {
        const res = await w.createEmbedding({ input: t.slice(0, 1000) });
        out.push(res.data[0].embedding as number[]);
      }
      return out;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async release(): Promise<void> {
    const w = this.w;
    this.w = null;
    await w?.exit();
  }
}
