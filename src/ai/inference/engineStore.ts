/** App-wide holder for the loaded on-device engine, observable from React. */
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import type { InferenceEngine } from './types';
import { getModelSpec, type ModelSpec } from './modelCatalog';

export type EngineStatus = 'none' | 'loading' | 'ready' | 'error';

export interface EngineState {
  status: EngineStatus;
  modelId: string | null;
  engine: InferenceEngine | null;
  progress: number;
  error: string | null;
}

let state: EngineState = { status: 'none', modelId: null, engine: null, progress: 0, error: null };
const listeners = new Set<() => void>();

function set(next: Partial<EngineState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export const engineStore = {
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  async load(spec: ModelSpec): Promise<void> {
    if (Platform.OS === 'web') {
      set({ status: 'error', error: 'On-device models need the Android or iOS app.' });
      return;
    }
    if (state.status === 'loading') return;
    if (state.status === 'ready' && state.modelId === spec.id) return;
    await engineStore.unload();
    set({ status: 'loading', modelId: spec.id, progress: 0, error: null });
    try {
      const { modelFile, isInstalled } = await import('./modelManager');
      if (!isInstalled(spec)) throw new Error('Model file is not installed.');
      const { LlamaRnEngine } = await import('./llamaEngine');
      const engine = await LlamaRnEngine.load({
        id: spec.id,
        label: `${spec.name} · ${spec.quantization} · llama.cpp on this device`,
        modelPath: modelFile(spec.fileName).uri,
        onProgress: (p) => set({ progress: p }),
      });
      set({ status: 'ready', engine, progress: 100 });
    } catch (e) {
      set({ status: 'error', engine: null, error: e instanceof Error ? e.message : String(e) });
    }
  },
  async loadById(id: string | null): Promise<void> {
    const spec = id ? getModelSpec(id) : null;
    if (spec) await engineStore.load(spec);
  },
  async unload(): Promise<void> {
    const engine = state.engine as (InferenceEngine & { release?: () => Promise<void> }) | null;
    set({ status: 'none', engine: null, modelId: null, progress: 0, error: null });
    await engine?.release?.();
  },
};

export function useEngineState(): EngineState {
  return useSyncExternalStore(engineStore.subscribe, engineStore.get, engineStore.get);
}
