import { isOnlineConfigured, type OnlineSettings } from '@/ai/inference/onlineAssistant';

// The API key store, in memory (expo-secure-store on the phone, localStorage in the browser).
jest.mock('@/services/secret', () => ({
  getSecret: async () => null,
  setSecret: async () => undefined,
}));

const base: OnlineSettings = { enabled: true, provider: 'faith', model: 'openai/gpt-oss-120b', baseUrl: '', hasKey: false };

describe('online assistant status', () => {
  it("counts FAITH's relay as on without any key", () => {
    expect(isOnlineConfigured(base)).toBe(true);
  });

  it('is off until switched on, and before settings have loaded', () => {
    expect(isOnlineConfigured({ ...base, enabled: false })).toBe(false);
    expect(isOnlineConfigured(null)).toBe(false);
    expect(isOnlineConfigured(undefined)).toBe(false);
  });

  it('needs a key for Groq and for a custom service', () => {
    expect(isOnlineConfigured({ ...base, provider: 'groq' })).toBe(false);
    expect(isOnlineConfigured({ ...base, provider: 'groq', hasKey: true })).toBe(true);
    expect(isOnlineConfigured({ ...base, provider: 'custom', hasKey: true, baseUrl: 'https://example.test/v1' })).toBe(true);
  });

  it('needs an address for a custom service and a model for every provider', () => {
    expect(isOnlineConfigured({ ...base, provider: 'custom', hasKey: true, baseUrl: '  ' })).toBe(false);
    expect(isOnlineConfigured({ ...base, model: '' })).toBe(false);
  });
});
