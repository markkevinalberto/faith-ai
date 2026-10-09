/**
 * Model downloads shared across screens (Settings → On-device AI and the first-run set-up card on
 * Home). Progress survives leaving a screen; a finished model is switched on straight away: the chat
 * model is loaded, and search and voice models are reloaded from the new file.
 */
import { useSyncExternalStore } from 'react';

import { SETTINGS, setSetting } from '../../db/repo/profiles';
import type { SqlExecutor } from '../../db/sql';
import { engineStore } from './engineStore';
import { localModels } from './localModels';
import type { ModelSpec } from './modelCatalog';

export interface DownloadState {
  progress: number;
  bytes: number;
  cancel: () => void;
}

const active = new Map<string, DownloadState>();
const running = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
let version = 0;

const emit = () => {
  version++;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Current downloads by model id; re-renders the caller when progress changes. */
export function useDownloads(): ReadonlyMap<string, DownloadState> {
  useSyncExternalStore(subscribe, () => version, () => version);
  return active;
}

/** Makes an installed model the one in use. */
export async function activateModel(db: SqlExecutor, spec: ModelSpec): Promise<void> {
  if (spec.kind === 'llm') {
    await setSetting(db, SETTINGS.activeModelId, spec.id);
    await engineStore.load(spec);
  } else {
    await localModels.release(spec.kind);
    if (spec.kind === 'embedding') await localModels.getEmbedder();
  }
}

/** Downloads one model and switches it on. Joins a download of the same model already in progress. */
export function downloadModel(db: SqlExecutor, spec: ModelSpec): Promise<void> {
  const existing = running.get(spec.id);
  if (existing) return existing;
  const work = (async () => {
    const { modelStore } = await import('./modelStore');
    const handle = modelStore.download(spec, (progress, bytes) => {
      const cur = active.get(spec.id);
      if (cur) active.set(spec.id, { ...cur, progress, bytes });
      emit();
    });
    active.set(spec.id, { progress: 0, bytes: 0, cancel: handle.cancel });
    emit();
    try {
      await handle.promise;
      await activateModel(db, spec);
    } finally {
      active.delete(spec.id);
      running.delete(spec.id);
      emit();
    }
  })();
  running.set(spec.id, work);
  return work;
}
