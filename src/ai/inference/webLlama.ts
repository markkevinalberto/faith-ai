/**
 * Placeholder for Android and iOS. The browser runtime lives in webLlama.web.ts, which Metro picks
 * for web builds; these stubs keep wllama out of the native bundles and give TypeScript the shape.
 */
import type { Embedder } from '../semantic';
import type { ModelSpec } from './modelCatalog';
import type { InferenceEngine } from './types';

export interface WebLoadParams {
  spec: ModelSpec;
  onProgress?: (pct: number) => void;
}

export interface Releasable {
  release(): Promise<void>;
}

const notHere = () => Promise.reject(new Error('The WebAssembly runtime is only part of the web build.'));

export class WllamaEngine {
  static load(_params: WebLoadParams): Promise<InferenceEngine & Releasable> {
    return notHere();
  }
}

export class WllamaEmbedder {
  static load(_params: WebLoadParams): Promise<Embedder & Releasable> {
    return notHere();
  }
}
