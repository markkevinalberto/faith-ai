/**
 * On-device model catalog. Sizes and hashes were verified on 2026-10-09 by streaming the files
 * from Hugging Face: SHA-256 matches the repository's published LFS hash; MD5 is used on-device
 * because expo-file-system computes MD5 natively.
 *
 * Three kinds of local model, all optional and all running on the phone:
 * - llm: the chat model that rephrases verified facts and reads scanned text (llama.cpp)
 * - embedding: sentence embeddings for semantic search (llama.cpp)
 * - speech: Whisper speech-to-text for voice questions and logging (whisper.cpp)
 */
export type ModelKind = 'llm' | 'embedding' | 'speech';

export const MODEL_KIND_LABEL: Record<ModelKind, { title: string; hint: string }> = {
  llm: { title: 'Assistant model', hint: 'Writes plain-language answers from your records and reads scanned labels and reports.' },
  embedding: { title: 'Search model', hint: 'Finds records and library articles by meaning, not just matching words.' },
  speech: { title: 'Voice model', hint: 'Turns what you say into text for questions and readings.' },
};

export interface ModelSpec {
  id: string;
  kind: ModelKind;
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
    kind: 'llm',
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
    kind: 'llm',
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
  {
    id: 'all-minilm-l6-v2-q8_0',
    kind: 'embedding',
    name: 'all-MiniLM-L6-v2 (semantic search)',
    family: 'Sentence-Transformers',
    parameters: '22M',
    quantization: 'Q8_0 (GGUF)',
    fileName: 'all-MiniLM-L6-v2-Q8_0.gguf',
    url: 'https://huggingface.co/second-state/All-MiniLM-L6-v2-Embedding-GGUF/resolve/main/all-MiniLM-L6-v2-Q8_0.gguf',
    sizeBytes: 25_008_064,
    md5: '326d2dc327dee2701c9dd6d39bb29144',
    sha256: '263215c3cadd6e16740741a7624ab4cbb6c8e777688bd5331ecfbf5681c2f8ed',
    license: 'Apache-2.0',
    licenseUrl: 'https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2',
    sourceRepo: 'https://huggingface.co/second-state/All-MiniLM-L6-v2-Embedding-GGUF',
    minRamBytes: 1 * GB,
    recommendedRamBytes: 2 * GB,
    contextLength: 512,
    description: 'Tiny (25 MB). Lets FAITH find related records and articles by meaning, e.g. “kidney” finds your eGFR and UACR results.',
  },
  {
    id: 'whisper-base.en',
    kind: 'speech',
    name: 'Whisper base.en (voice)',
    family: 'Whisper',
    parameters: '74M',
    quantization: 'GGML F16',
    fileName: 'ggml-base.en.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',
    sizeBytes: 147_964_211,
    md5: '4279db3d7b18d9f6e4d5817a16af4f09',
    sha256: 'a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002',
    license: 'MIT',
    licenseUrl: 'https://github.com/openai/whisper/blob/main/LICENSE',
    sourceRepo: 'https://huggingface.co/ggerganov/whisper.cpp',
    minRamBytes: 2 * GB,
    recommendedRamBytes: 4 * GB,
    contextLength: 0,
    description: 'English speech-to-text. More accurate with numbers like “130 over 85”.',
  },
  {
    id: 'whisper-tiny.en',
    kind: 'speech',
    name: 'Whisper tiny.en (voice, lite)',
    family: 'Whisper',
    parameters: '39M',
    quantization: 'GGML F16',
    fileName: 'ggml-tiny.en.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin',
    sizeBytes: 77_704_715,
    md5: '5c5223266e7bdb9b7554205e739ed174',
    sha256: '921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f',
    license: 'MIT',
    licenseUrl: 'https://github.com/openai/whisper/blob/main/LICENSE',
    sourceRepo: 'https://huggingface.co/ggerganov/whisper.cpp',
    minRamBytes: 1 * GB,
    recommendedRamBytes: 2 * GB,
    contextLength: 0,
    description: 'Faster and smaller English speech-to-text, slightly less accurate.',
  },
];

export function getModelSpec(id: string): ModelSpec | null {
  return MODEL_CATALOG.find((m) => m.id === id) ?? null;
}

export function modelsOfKind(kind: ModelKind): ModelSpec[] {
  return MODEL_CATALOG.filter((m) => m.kind === kind);
}

/** First 4 bytes of a valid file: "GGUF" for llama.cpp models, "lmgg" (ggml magic, LE) for Whisper. */
export function expectedMagic(kind: ModelKind): number[] {
  return kind === 'speech' ? [0x6c, 0x6d, 0x67, 0x67] : [0x47, 0x47, 0x55, 0x46];
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

/**
 * Pure compatibility check (tested). Native values are gathered in modelManager; the browser's in
 * modelStore.web. In a browser the chat and embedding models run through llama.cpp compiled to
 * WebAssembly; speech stays on the phone because whisper.cpp is not part of the web build.
 */
export function assessCompatibility(spec: ModelSpec, device: DeviceProfile, alreadyInstalled: boolean): Compatibility {
  const reasons: string[] = [];
  const web = device.platform === 'web';
  if (web && spec.kind === 'speech') {
    return { verdict: 'unsupported', reasons: ['Voice runs in the Android app. whisper.cpp is not part of the browser build.'], canInstall: false };
  }
  if (web) {
    reasons.push('Runs in this browser with WebAssembly on the CPU, from the same model file as the phone app. Expect it to be slower than a phone.');
  } else {
    const abiOk = device.cpuArchitectures.length === 0 || device.cpuArchitectures.some((a) => a === 'arm64-v8a' || a === 'x86_64' || a === 'arm64');
    const runtime = spec.kind === 'speech' ? 'whisper.cpp' : 'llama.cpp';
    if (!abiOk) return { verdict: 'unsupported', reasons: [`This processor architecture is not supported by ${runtime} (needs 64-bit ARM or x86_64).`], canInstall: false };
  }
  let verdict: CompatibilityVerdict = 'supported';
  if (device.totalMemoryBytes !== null) {
    if (device.totalMemoryBytes < spec.minRamBytes) {
      verdict = 'not_recommended';
      reasons.push(
        `${web ? 'This computer reports' : 'Your phone has'} ${formatBytes(device.totalMemoryBytes)} RAM; this model needs at least ${formatBytes(spec.minRamBytes)}. It may be very slow or ${web ? 'make the page unresponsive' : 'close the app'}.`,
      );
    } else if (device.totalMemoryBytes >= spec.recommendedRamBytes) {
      verdict = 'recommended';
    }
  } else {
    reasons.push(web ? 'This browser does not report memory. If the page becomes unresponsive, try the smaller model.' : 'Could not read device memory.');
  }
  if (!device.isPhysicalDevice) reasons.push('Emulators run models slowly; test on a real phone.');
  let canInstall = true;
  if (!alreadyInstalled && device.availableStorageBytes !== null && device.availableStorageBytes < spec.sizeBytes + 300 * 1024 ** 2) {
    canInstall = false;
    reasons.push(`Not enough free storage: needs ${formatBytes(spec.sizeBytes + 300 * 1024 ** 2)}, ${formatBytes(device.availableStorageBytes)} available.`);
  }
  return { verdict, reasons, canInstall };
}
