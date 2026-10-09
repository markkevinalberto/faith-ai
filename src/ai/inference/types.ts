/**
 * Inference adapter interface. The app talks to on-device models only through this interface.
 * There is deliberately NO network implementation: FAITH never falls back to a cloud model.
 */
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

export interface InferenceEngine {
  /** Stable id, e.g. "llama.rn:qwen2.5-1.5b-instruct-q4_k_m". */
  readonly id: string;
  /** Human-readable label shown next to generated text. */
  readonly label: string;
  readonly runsOnDevice: true;
  isReady(): boolean;
  generate(messages: ChatMessage[], opts: GenerateOptions): Promise<GenerateResult>;
  stop(): Promise<void>;
}
