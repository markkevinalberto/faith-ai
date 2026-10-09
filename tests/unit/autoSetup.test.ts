import { planSetup } from '@/ai/inference/autoSetup';
import { MODEL_CATALOG, assessCompatibility, type DeviceProfile } from '@/ai/inference/modelCatalog';
import type { ModelStatus } from '@/ai/inference/types';

const GB = 1024 ** 3;

const device = (platform: string, ramGb: number | null): DeviceProfile => ({
  platform,
  isPhysicalDevice: true,
  totalMemoryBytes: ramGb === null ? null : ramGb * GB,
  cpuArchitectures: platform === 'web' ? [] : ['arm64-v8a'],
  availableStorageBytes: 32 * GB,
});

const statuses = (d: DeviceProfile, installed: string[] = []): ModelStatus[] =>
  MODEL_CATALOG.map((spec) => ({ spec, installed: installed.includes(spec.id), compat: assessCompatibility(spec, d, installed.includes(spec.id)) }));

const ids = (platform: string, ramGb: number | null, installed: string[] = []) => planSetup(statuses(device(platform, ramGb), installed), platform).models.map((m) => m.id);

describe('first-run AI set-up plan', () => {
  it('picks the best chat model the phone can run well, plus search and voice, smallest first', () => {
    expect(ids('android', 8)).toEqual(['all-minilm-l6-v2-q8_0', 'whisper-base.en', 'qwen2.5-1.5b-instruct-q4_k_m']);
  });

  it('uses the Lite chat model on mid-range phones', () => {
    expect(ids('android', 4)).toEqual(['all-minilm-l6-v2-q8_0', 'whisper-base.en', 'qwen2.5-0.5b-instruct-q4_k_m']);
    expect(ids('android', 3)).toEqual(['all-minilm-l6-v2-q8_0', 'whisper-tiny.en', 'qwen2.5-0.5b-instruct-q4_k_m']);
  });

  it('chooses the smallest models when memory is unknown', () => {
    expect(ids('android', null)).toEqual(['all-minilm-l6-v2-q8_0', 'whisper-tiny.en', 'qwen2.5-0.5b-instruct-q4_k_m']);
  });

  it('skips voice in the browser and anything already installed', () => {
    expect(ids('web', 16)).toEqual(['all-minilm-l6-v2-q8_0', 'qwen2.5-1.5b-instruct-q4_k_m']);
    expect(ids('android', 8, ['qwen2.5-0.5b-instruct-q4_k_m', 'all-minilm-l6-v2-q8_0'])).toEqual(['whisper-base.en']);
    expect(ids('android', 8, ['qwen2.5-1.5b-instruct-q4_k_m', 'all-minilm-l6-v2-q8_0', 'whisper-tiny.en'])).toEqual([]);
  });

  it('adds up the download size', () => {
    const plan = planSetup(statuses(device('android', 4)), 'android');
    expect(plan.totalBytes).toBe(plan.models.reduce((n, m) => n + m.sizeBytes, 0));
    expect(plan.totalBytes).toBeLessThan(700 * 1024 ** 2);
  });
});
