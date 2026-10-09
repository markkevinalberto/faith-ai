import { MODEL_CATALOG, assessCompatibility, expectedMagic, getModelSpec, modelsOfKind, type DeviceProfile, type ModelSpec } from '@/ai/inference/modelCatalog';

const GB = 1024 ** 3;
const spec = (id: string): ModelSpec => getModelSpec(id) as ModelSpec;
const big = spec('qwen2.5-1.5b-instruct-q4_k_m');
const lite = spec('qwen2.5-0.5b-instruct-q4_k_m');
const embedding = spec('all-minilm-l6-v2-q8_0');
const speech = spec('whisper-base.en');

const phone = (over: Partial<DeviceProfile> = {}): DeviceProfile => ({
  platform: 'android',
  isPhysicalDevice: true,
  totalMemoryBytes: 6 * GB,
  cpuArchitectures: ['arm64-v8a'],
  availableStorageBytes: 20 * GB,
  ...over,
});
const browser = (over: Partial<DeviceProfile> = {}): DeviceProfile => ({
  platform: 'web',
  isPhysicalDevice: true,
  totalMemoryBytes: null,
  cpuArchitectures: [],
  availableStorageBytes: 50 * GB,
  ...over,
});

describe('model compatibility on a phone', () => {
  it('recommends the big model on a capable phone', () => {
    expect(assessCompatibility(big, phone(), false)).toMatchObject({ verdict: 'recommended', canInstall: true });
  });

  it('refuses 32-bit processors', () => {
    const c = assessCompatibility(big, phone({ cpuArchitectures: ['armeabi-v7a'] }), false);
    expect(c.verdict).toBe('unsupported');
    expect(c.canInstall).toBe(false);
  });

  it('allows but warns when RAM is below the minimum', () => {
    const c = assessCompatibility(big, phone({ totalMemoryBytes: 3 * GB }), false);
    expect(c.verdict).toBe('not_recommended');
    expect(c.canInstall).toBe(true);
    expect(c.reasons[0]).toMatch(/needs at least 4\.00 GB/);
    expect(assessCompatibility(lite, phone({ totalMemoryBytes: 3 * GB }), false).verdict).toBe('recommended');
  });

  it('blocks a download that does not fit, unless the file is already there', () => {
    expect(assessCompatibility(big, phone({ availableStorageBytes: 1 * GB }), false).canInstall).toBe(false);
    expect(assessCompatibility(big, phone({ availableStorageBytes: 1 * GB }), true).canInstall).toBe(true);
  });
});

describe('model compatibility in a browser', () => {
  it('runs chat and embedding models through WebAssembly', () => {
    for (const s of [big, lite, embedding]) {
      const c = assessCompatibility(s, browser(), false);
      expect(c.verdict).toBe('supported');
      expect(c.canInstall).toBe(true);
      expect(c.reasons.join(' ')).toMatch(/WebAssembly/);
    }
  });

  it('uses the browser-reported memory when available', () => {
    expect(assessCompatibility(big, browser({ totalMemoryBytes: 16 * GB }), false).verdict).toBe('recommended');
    expect(assessCompatibility(big, browser({ totalMemoryBytes: 2 * GB }), false).verdict).toBe('not_recommended');
  });

  it('keeps voice on the phone', () => {
    const c = assessCompatibility(speech, browser(), false);
    expect(c.verdict).toBe('unsupported');
    expect(c.canInstall).toBe(false);
  });
});

describe('catalog integrity', () => {
  it('has verified hashes and the right file header for every model', () => {
    for (const m of MODEL_CATALOG) {
      expect(m.md5).toMatch(/^[0-9a-f]{32}$/);
      expect(m.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(m.sizeBytes).toBeGreaterThan(1_000_000);
      expect(expectedMagic(m.kind)).toHaveLength(4);
    }
    expect(modelsOfKind('llm').map((m) => m.id)).toEqual(['qwen2.5-1.5b-instruct-q4_k_m', 'qwen2.5-0.5b-instruct-q4_k_m']);
    expect(modelsOfKind('speech')).toHaveLength(2);
    expect(modelsOfKind('embedding')).toHaveLength(1);
  });
});
