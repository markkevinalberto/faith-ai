/**
 * Model installation: explicit, user-initiated download (or import from device storage), with
 * storage/RAM/ABI checks and integrity verification. The only network request FAITH ever makes is
 * the model file download the user starts here — no health data is ever sent.
 */
import * as Device from 'expo-device';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths, type DownloadTask } from 'expo-file-system';
import { Platform } from 'react-native';

import { MODEL_CATALOG, assessCompatibility, expectedMagic, type Compatibility, type DeviceProfile, type ModelKind, type ModelSpec } from './modelCatalog';

const MODELS_DIR = 'models';

function modelsDir(): Directory {
  const dir = new Directory(Paths.document, MODELS_DIR);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export function modelFile(fileName: string): File {
  return new File(modelsDir(), fileName);
}

export function readDeviceProfile(): DeviceProfile {
  let available: number | null = null;
  try {
    available = Platform.OS === 'web' ? null : Paths.availableDiskSpace;
  } catch {
    available = null;
  }
  return {
    platform: Platform.OS,
    isPhysicalDevice: Device.isDevice,
    totalMemoryBytes: Device.totalMemory ?? null,
    cpuArchitectures: Device.supportedCpuArchitectures ?? [],
    availableStorageBytes: available,
  };
}

export function isInstalled(spec: ModelSpec): boolean {
  if (Platform.OS === 'web') return false;
  const f = modelFile(spec.fileName);
  return f.exists && f.size === spec.sizeBytes;
}

export function compatibilityFor(spec: ModelSpec): Compatibility {
  return assessCompatibility(spec, readDeviceProfile(), isInstalled(spec));
}

export function hasExpectedHeader(file: File, kind: ModelKind): boolean {
  const handle = file.open();
  try {
    const bytes = handle.readBytes(4);
    return expectedMagic(kind).every((b, i) => bytes[i] === b);
  } finally {
    handle.close();
  }
}

export interface VerifyResult {
  ok: boolean;
  reason?: string;
}

export function verifyModelFile(file: File, spec: ModelSpec): VerifyResult {
  if (!file.exists) return { ok: false, reason: 'File is missing.' };
  if (file.size !== spec.sizeBytes) return { ok: false, reason: `Size mismatch (${file.size} bytes, expected ${spec.sizeBytes}).` };
  if (!hasExpectedHeader(file, spec.kind)) return { ok: false, reason: spec.kind === 'speech' ? 'Not a Whisper (ggml) model file.' : 'Not a GGUF model file.' };
  const md5 = file.info({ md5: true }).md5 ?? file.md5;
  if (!md5 || md5.toLowerCase() !== spec.md5) return { ok: false, reason: 'Checksum mismatch — the download may be corrupted.' };
  return { ok: true };
}

export interface DownloadHandle {
  promise: Promise<void>;
  cancel: () => void;
}

export function downloadModel(spec: ModelSpec, onProgress: (fraction: number, bytes: number) => void): DownloadHandle {
  const partName = `${spec.fileName}.part`;
  const part = modelFile(partName);
  if (part.exists) part.delete();
  const task: DownloadTask = File.createDownloadTask(spec.url, part, {
    onProgress: ({ bytesWritten, totalBytes }) => onProgress(totalBytes > 0 ? bytesWritten / totalBytes : bytesWritten / spec.sizeBytes, bytesWritten),
  });
  let cancelled = false;
  const promise = (async () => {
    const result = await task.downloadAsync();
    if (cancelled || !result) throw new Error('Download cancelled.');
    const downloaded = modelFile(partName);
    const check = verifyModelFile(downloaded, spec);
    if (!check.ok) {
      downloaded.delete();
      throw new Error(check.reason);
    }
    const final = modelFile(spec.fileName);
    if (final.exists) final.delete();
    downloaded.rename(spec.fileName);
  })();
  return {
    promise,
    cancel: () => {
      cancelled = true;
      task.cancel();
      try {
        const leftover = modelFile(partName);
        if (leftover.exists) leftover.delete();
      } catch {
        // ignore
      }
    },
  };
}

export interface ImportResult {
  spec: ModelSpec;
}

/**
 * Imports a model the user copied to the phone (e.g. via USB) — useful offline at demo venues.
 * Only catalog models are accepted, verified by size + MD5, so the app knows exactly what it runs.
 */
export async function importModelFromStorage(): Promise<ImportResult | null> {
  const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (picked.canceled || !picked.assets?.[0]) return null;
  const asset = picked.assets[0];
  const src = new File(asset.uri);
  const spec = MODEL_CATALOG.find((m) => m.sizeBytes === src.size);
  if (!spec) {
    src.delete();
    throw new Error(`This file does not match a supported FAITH model (${MODEL_CATALOG.map((m) => m.fileName).join(', ')}).`);
  }
  const check = verifyModelFile(src, spec);
  if (!check.ok) {
    src.delete();
    throw new Error(check.reason);
  }
  const dest = modelFile(spec.fileName);
  if (dest.exists) dest.delete();
  await src.move(dest);
  return { spec };
}

export function deleteModel(spec: ModelSpec): void {
  for (const name of [spec.fileName, `${spec.fileName}.part`]) {
    const f = modelFile(name);
    if (f.exists) f.delete();
  }
}

export function installedModels(kind?: ModelKind): ModelSpec[] {
  return MODEL_CATALOG.filter((m) => (!kind || m.kind === kind) && isInstalled(m));
}

export function deleteAllModels(): void {
  const dir = new Directory(Paths.document, MODELS_DIR);
  if (dir.exists) dir.delete();
}
