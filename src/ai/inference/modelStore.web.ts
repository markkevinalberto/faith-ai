/**
 * Model store for the browser build: the same GGUF files as the phone, downloaded once from
 * Hugging Face and kept in this browser's private origin storage (OPFS) by wllama's ModelManager.
 * Size is verified after download; checksum verification is a phone-app feature.
 */
import { ModelManager, type Model } from '@wllama/wllama/esm/index.js';

import { MODEL_CATALOG, assessCompatibility, type DeviceProfile, type ModelSpec } from './modelCatalog';
import type { ModelStore } from './types';

const GB = 1024 ** 3;

let manager: ModelManager | null = null;
function getManager(): ModelManager {
  manager ??= new ModelManager({ allowOffline: true, parallelDownloads: 3 });
  return manager;
}

function isValid(model: Model | null, spec: ModelSpec): boolean {
  return !!model && String(model.validate()) === 'valid' && model.size === spec.sizeBytes;
}

async function findModel(spec: ModelSpec): Promise<Model | null> {
  const models = await getManager().getModels({ includeInvalid: true });
  return models.find((m) => m.url === spec.url) ?? null;
}

async function readDeviceProfile(): Promise<DeviceProfile> {
  const nav = globalThis.navigator as Navigator & { deviceMemory?: number };
  let available: number | null = null;
  try {
    const estimate = await nav.storage?.estimate?.();
    if (estimate?.quota !== undefined) available = Math.max(0, estimate.quota - (estimate.usage ?? 0));
  } catch {
    available = null;
  }
  return {
    platform: 'web',
    isPhysicalDevice: true,
    totalMemoryBytes: nav.deviceMemory ? nav.deviceMemory * GB : null,
    cpuArchitectures: [],
    availableStorageBytes: available,
  };
}

export const modelStore: ModelStore = {
  runtimeLabel: 'llama.cpp compiled to WebAssembly, in this browser',
  canImportFiles: false,
  storageNote: 'Model files are kept in this browser’s private storage and verified by size. Checksum verification runs in the phone app.',
  readDeviceProfile,
  async isInstalled(spec) {
    return isValid(await findModel(spec), spec);
  },
  async status() {
    const profile = await readDeviceProfile();
    const models = await getManager().getModels({ includeInvalid: true });
    return MODEL_CATALOG.map((spec) => {
      const installed = isValid(models.find((m) => m.url === spec.url) ?? null, spec);
      return { spec, installed, compat: assessCompatibility(spec, profile, installed) };
    });
  },
  download(spec, onProgress) {
    const controller = new AbortController();
    const promise = (async () => {
      const model = await getManager().downloadModel(spec.url, {
        signal: controller.signal,
        progressCallback: ({ loaded, total }) => onProgress(total > 0 ? loaded / total : loaded / spec.sizeBytes, loaded),
      });
      if (model.size !== spec.sizeBytes) {
        await model.remove();
        throw new Error(`Size mismatch (${model.size} bytes, expected ${spec.sizeBytes}).`);
      }
    })();
    return { promise, cancel: () => controller.abort() };
  },
  async remove(spec) {
    const model = await findModel(spec);
    if (model) await model.remove();
  },
  async importFromStorage() {
    return null;
  },
  async deleteAll() {
    await getManager().clear();
  },
  async source(spec) {
    return spec.url;
  },
};
