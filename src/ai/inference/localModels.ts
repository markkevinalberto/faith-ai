/**
 * On-device helper models, loaded lazily on first use and kept in memory:
 * - embedding: all-MiniLM-L6-v2 via llama.rn (llama.cpp) for semantic search
 * - speech: Whisper via whisper.rn (whisper.cpp) for voice input
 * Neither is required — callers fall back to keyword search and typing. Native modules are
 * required lazily so web builds and tests never touch them.
 */
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { sharedEmbeddingCache, type Embedder } from '../semantic';
import { modelsOfKind, type ModelSpec } from './modelCatalog';

type LlamaModule = typeof import('llama.rn');
type LlamaContext = Awaited<ReturnType<LlamaModule['initLlama']>>;
type WhisperModule = typeof import('whisper.rn/index');
type WhisperContext = Awaited<ReturnType<WhisperModule['initWhisper']>>;

type HelperKind = 'embedding' | 'speech';
export type HelperStatus = 'none' | 'loading' | 'ready' | 'error';
export interface HelperState {
  status: HelperStatus;
  modelId: string | null;
  error: string | null;
}
export interface LocalModelsState {
  embedding: HelperState;
  speech: HelperState;
}

const IDLE: HelperState = { status: 'none', modelId: null, error: null };
let state: LocalModelsState = { embedding: IDLE, speech: IDLE };
const listeners = new Set<() => void>();

function set(kind: HelperKind, next: Partial<HelperState>) {
  state = { ...state, [kind]: { ...state[kind], ...next } };
  listeners.forEach((l) => l());
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

class LlamaRnEmbedder implements Embedder {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    readonly id: string,
    private readonly ctx: LlamaContext,
  ) {}

  embed(texts: string[]): Promise<number[][]> {
    // One request at a time per context.
    const run = this.queue.then(async () => {
      const out: number[][] = [];
      for (const t of texts) out.push((await this.ctx.embedding(t.slice(0, 1000))).embedding);
      return out;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  release(): Promise<void> {
    return this.ctx.release();
  }
}

let embedder: (Embedder & { release(): Promise<void> }) | null = null;
let embedderLoading: Promise<Embedder | null> | null = null;
let whisper: WhisperContext | null = null;
let whisperLoading: Promise<WhisperContext | null> | null = null;

async function installedSpec(kind: HelperKind): Promise<ModelSpec | null> {
  // Whisper is not part of the browser build; the embedding model is (through WebAssembly).
  if (Platform.OS === 'web' && kind === 'speech') return null;
  const { modelStore } = await import('./modelStore');
  for (const spec of modelsOfKind(kind)) if (await modelStore.isInstalled(spec)) return spec;
  return null;
}

async function loadEmbedder(): Promise<Embedder | null> {
  const spec = await installedSpec('embedding');
  if (!spec) return null;
  set('embedding', { status: 'loading', modelId: spec.id, error: null });
  try {
    if (Platform.OS === 'web') {
      const { WllamaEmbedder } = await import('./webLlama');
      embedder = await WllamaEmbedder.load({ spec });
    } else {
      const { modelStore } = await import('./modelStore');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { initLlama } = require('llama.rn') as LlamaModule;
      const ctx = await initLlama({
        model: await modelStore.source(spec),
        embedding: true,
        pooling_type: 'mean',
        n_ctx: spec.contextLength,
        n_batch: spec.contextLength,
        n_ubatch: spec.contextLength,
        n_gpu_layers: 0,
        use_mlock: false,
      });
      embedder = new LlamaRnEmbedder(`llama.rn:${spec.id}`, ctx);
    }
    set('embedding', { status: 'ready' });
    return embedder;
  } catch (e) {
    set('embedding', { status: 'error', error: message(e) });
    return null;
  }
}

async function loadWhisper(): Promise<WhisperContext | null> {
  const spec = await installedSpec('speech');
  if (!spec) return null;
  set('speech', { status: 'loading', modelId: spec.id, error: null });
  try {
    const { modelStore } = await import('./modelStore');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { initWhisper } = require('whisper.rn/index') as WhisperModule;
    whisper = await initWhisper({ filePath: await modelStore.source(spec), useGpu: false });
    set('speech', { status: 'ready' });
    return whisper;
  } catch (e) {
    set('speech', { status: 'error', error: message(e) });
    return null;
  }
}

/** Removes Whisper's non-speech markers such as "[BLANK_AUDIO]" or "(coughing)". */
export function cleanTranscript(raw: string): string {
  return raw
    .replace(/\[[^\]]*\]|\([^)]*\)|\*[^*]*\*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const localModels = {
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  hasModel: async (kind: HelperKind): Promise<boolean> => (await installedSpec(kind)) !== null,

  /** The embedder when an embedding model is installed (loaded on first call), else null. */
  async getEmbedder(): Promise<Embedder | null> {
    if (embedder) return embedder;
    embedderLoading ??= loadEmbedder().finally(() => {
      embedderLoading = null;
    });
    return embedderLoading;
  },

  /** Transcribes 16 kHz mono 16-bit PCM entirely on the device. */
  async transcribe(pcm: Uint8Array): Promise<string> {
    whisperLoading ??= (whisper ? Promise.resolve(whisper) : loadWhisper()).finally(() => {
      whisperLoading = null;
    });
    const ctx = await whisperLoading;
    if (!ctx) throw new Error(Platform.OS === 'web' ? 'Voice runs in the Android app.' : (state.speech.error ?? 'No voice model is installed. Download one in Settings → On-device AI.'));
    const audio = pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength) as ArrayBuffer;
    const { promise } = ctx.transcribeData(audio, { language: 'en', maxThreads: 4 });
    const result = await promise;
    return cleanTranscript(result.result);
  },

  async release(kind?: HelperKind): Promise<void> {
    if (!kind || kind === 'embedding') {
      const e = embedder;
      embedder = null;
      sharedEmbeddingCache.clear();
      set('embedding', IDLE);
      await e?.release().catch(() => undefined);
    }
    if (!kind || kind === 'speech') {
      const w = whisper;
      whisper = null;
      set('speech', IDLE);
      await w?.release().catch(() => undefined);
    }
  },
};

export function useLocalModels(): LocalModelsState {
  return useSyncExternalStore(localModels.subscribe, localModels.get, localModels.get);
}
