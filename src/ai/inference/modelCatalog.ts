/**
 * On-device model catalog. Sizes and hashes were verified on 2026-10-09 by streaming the files
 * from Hugging Face: SHA-256 matches the repository's published LFS hash; MD5 is used on-device
 * because expo-file-system computes MD5 natively.
 */
export interface ModelSpec {
  id: string;
  name: string;
  family: string;
  parameters: string;
  quantization: string;
  fileName: string;
  url: string;
  sizeBytes: number;
  md5: string;
  sha256: string;
  license: string;
  licenseUrl: string;
  sourceRepo: string;
  /** Below this total RAM the model is not offered. */
  minRamBytes: number;
  /** At or above this total RAM the model is recommended. */
  recommendedRamBytes: number;
  contextLength: number;
  description: string;
}

const GB = 1024 ** 3;

export const MODEL_CATALOG: ModelSpec[] = [
  {
    id: 'qwen2.5-1.5b-instruct-q4_k_m',
    name: 'Qwen2.5 1.5B Instruct',
    family: 'Qwen2.5',
    parameters: '1.5B',
    quantization: 'Q4_K_M (GGUF)',
    fileName: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    sizeBytes: 1_117_320_736,
    md5: '8e5111fdbc5c150920d368ff802c4b5a',
    sha256: '6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e',
    license: 'Apache-2.0',
    licenseUrl: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct/blob/main/LICENSE',
    sourceRepo: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF',
    minRamBytes: 4 * GB,
    recommendedRamBytes: 6 * GB,
    contextLength: 2048,
    description: 'Best quality. Recommended for phones with 6 GB RAM or more.',
  },
  {
    id: 'qwen2.5-0.5b-instruct-q4_k_m',
    name: 'Qwen2.5 0.5B Instruct (Lite)',
    family: 'Qwen2.5',
    parameters: '0.5B',
    quantization: 'Q4_K_M (GGUF)',
    fileName: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
    url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
    sizeBytes: 491_400_032,
    md5: 'a24e22d4ea0d9a6b3efd57936ecb127b',
    sha256: '74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db',
    license: 'Apache-2.0',
    licenseUrl: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct/blob/main/LICENSE',
    sourceRepo: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF',
    minRamBytes: 2 * GB,
    recommendedRamBytes: 3 * GB,
    contextLength: 2048,
    description: 'Smaller and faster; simpler wording. For phones with 3–6 GB RAM.',
  },
];

export function getModelSpec(id: string): ModelSpec | null {
  return MODEL_CATALOG.find((m) => m.id === id) ?? null;
}

export function formatBytes(bytes: number): string {
  if (bytes >= GB) return `${(bytes / GB).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

export type CompatibilityVerdict = 'recommended' | 'supported' | 'not_recommended' | 'unsupported';

export interface DeviceProfile {
  platform: string;
  isPhysicalDevice: boolean;
  totalMemoryBytes: number | null;
  cpuArchitectures: string[];
  availableStorageBytes: number | null;
}

export interface Compatibility {
  verdict: CompatibilityVerdict;
  reasons: string[];
  canInstall: boolean;
}

/** Pure compatibility check (tested). Native values are gathered in modelManager. */
export function assessCompatibility(spec: ModelSpec, device: DeviceProfile, alreadyInstalled: boolean): Compatibility {
  const reasons: string[] = [];
  if (device.platform === 'web') return { verdict: 'unsupported', reasons: ['On-device models need the Android or iOS app.'], canInstall: false };
  const abiOk = device.cpuArchitectures.length === 0 || device.cpuArchitectures.some((a) => a === 'arm64-v8a' || a === 'x86_64' || a === 'arm64');
  if (!abiOk) return { verdict: 'unsupported', reasons: ['This processor architecture is not supported by llama.cpp (needs 64-bit ARM or x86_64).'], canInstall: false };
  let verdict: CompatibilityVerdict = 'supported';
  if (device.totalMemoryBytes !== null) {
    if (device.totalMemoryBytes < spec.minRamBytes) {
      verdict = 'not_recommended';
      reasons.push(`Your phone has ${formatBytes(device.totalMemoryBytes)} RAM; this model needs at least ${formatBytes(spec.minRamBytes)}. It may be very slow or close the app.`);
    } else if (device.totalMemoryBytes >= spec.recommendedRamBytes) {
      verdict = 'recommended';
    }
  } else {
    reasons.push('Could not read device memory.');
  }
  if (!device.isPhysicalDevice) reasons.push('Emulators run models slowly; test on a real phone.');
  let canInstall = true;
  if (!alreadyInstalled && device.availableStorageBytes !== null && device.availableStorageBytes < spec.sizeBytes + 300 * 1024 ** 2) {
    canInstall = false;
    reasons.push(`Not enough free storage: needs ${formatBytes(spec.sizeBytes + 300 * 1024 ** 2)}, ${formatBytes(device.availableStorageBytes)} available.`);
  }
  return { verdict, reasons, canInstall };
}
