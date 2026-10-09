/**
 * Inference adapter interface. The app talks to on-device models only through this interface.
 * There is deliberately NO network implementation: FAITH never falls back to a cloud model.
 */
import type { Compatibility, DeviceProfile, ModelSpec } from './modelCatalog';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GenerateOptions {
  maxTokens: number;
  temperature: number;
  stop?: string[];
  onToken?: (token: string) => void;
  timeoutMs?: number;
  /** Constrain output to JSON matching this schema (grammar-constrained decoding). */
  jsonSchema?: object;
}

export interface GenerateResult {
  text: string;
  tokens: number;
  durationMs: number;
  tokensPerSecond: number | null;
  interrupted: boolean;
}

export interface ModelStatus {
  spec: ModelSpec;
  installed: boolean;
  compat: Compatibility;
}

export interface DownloadHandle {
  promise: Promise<void>;
  cancel: () => void;
}

/**
 * Where model files live and how they are fetched. One implementation per platform: the phone keeps
 * verified files in private app storage (modelStore.ts); the browser keeps them in its private
 * origin storage through wllama (modelStore.web.ts). Metro picks the file by platform.
 */
export interface ModelStore {
  /** Shown in the model settings, e.g. "llama.cpp on this device". */
  runtimeLabel: string;
  /** Whether a model file can be imported from local storage (USB copy at a venue). */
  canImportFiles: boolean;
  /** One sentence on where files are kept and how they are verified. */
  storageNote: string;
  readDeviceProfile(): Promise<DeviceProfile>;
  isInstalled(spec: ModelSpec): Promise<boolean>;
  status(): Promise<ModelStatus[]>;
  download(spec: ModelSpec, onProgress: (fraction: number, bytes: number) => void): DownloadHandle;
  remove(spec: ModelSpec): Promise<void>;
  /** Returns the spec of the imported model, or null when cancelled or unsupported. */
  importFromStorage(): Promise<ModelSpec | null>;
  deleteAll(): Promise<void>;
  /** What the runtime loads: a file URI on the phone, the download URL (served from cache) in the browser. */
  source(spec: ModelSpec): Promise<string>;
}

export interface InferenceEngine {
  /** Stable id, e.g. "llama.rn:qwen2.5-1.5b-instruct-q4_k_m". */
  readonly id: string;
  /** Human-readable label shown next to generated text. */
  readonly label: string;
  /** False for the optional online assistant, which sends the prompt to a cloud API. */
  readonly runsOnDevice: boolean;
  isReady(): boolean;
  generate(messages: ChatMessage[], opts: GenerateOptions): Promise<GenerateResult>;
  stop(): Promise<void>;
}
