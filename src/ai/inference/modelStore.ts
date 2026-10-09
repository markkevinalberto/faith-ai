/**
 * Model store for Android and iOS: verified GGUF / ggml files in the app's private documents
 * directory, managed by modelManager. The browser build uses modelStore.web.ts instead.
 */
import { MODEL_CATALOG } from './modelCatalog';
import type { DownloadHandle, ModelStore } from './types';

// Loaded lazily so the native file-system modules are only touched on a device.
const mm = () => import('./modelManager');

export const modelStore: ModelStore = {
  runtimeLabel: 'llama.cpp and whisper.cpp on this device',
  canImportFiles: true,
  storageNote: 'Model files are kept in the app’s private storage and verified by size, file header and MD5 checksum.',
  async readDeviceProfile() {
    return (await mm()).readDeviceProfile();
  },
  async isInstalled(spec) {
    return (await mm()).isInstalled(spec);
  },
  async status() {
    const m = await mm();
    return MODEL_CATALOG.map((spec) => ({ spec, installed: m.isInstalled(spec), compat: m.compatibilityFor(spec) }));
  },
  download(spec, onProgress) {
    let cancelled = false;
    let handle: DownloadHandle | null = null;
    const promise = mm().then((m) => {
      if (cancelled) throw new Error('Download cancelled.');
      handle = m.downloadModel(spec, onProgress);
      return handle.promise;
    });
    return {
      promise,
      cancel: () => {
        cancelled = true;
        handle?.cancel();
      },
    };
  },
  async remove(spec) {
    (await mm()).deleteModel(spec);
  },
  async importFromStorage() {
    const r = await (await mm()).importModelFromStorage();
    return r?.spec ?? null;
  },
  async deleteAll() {
    (await mm()).deleteAllModels();
  },
  async source(spec) {
    return (await mm()).modelFile(spec.fileName).uri;
  },
};
