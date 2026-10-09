/**
 * The optional online assistant (off by default). When the person switches it on, pastes their own
 * API key and the device has internet, Ask FAITH and FAITH's note send the prompt to a cloud model
 * instead of the on-device one: the same system prompt, the same computed facts and library
 * excerpts, and the same output guard. With no internet (or on any error) FAITH falls back to the
 * on-device model, so nothing stops working offline.
 *
 * Default provider: "FAITH's assistant", a relay on the FAITH website (web/api/chat/completions.js)
 * that holds a Groq key server-side, so nobody has to create an account: one tap turns it on.
 * People can instead use their own Groq key (free plan; inference data not retained by default; a
 * zero-retention switch in its console) or any other OpenAI-compatible endpoint ("custom").
 */
import * as Network from 'expo-network';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { SETTINGS, getSetting, setSetting } from '../../db/repo/profiles';
import type { SqlExecutor } from '../../db/sql';
import { getSecret, setSecret } from '../../services/secret';
import { CloudEngine } from './cloudEngine';
import type { InferenceEngine } from './types';

export type ProviderId = 'faith' | 'groq' | 'custom';

export interface ProviderModel {
  id: string;
  label: string;
  note: string;
}

export interface OnlineProvider {
  id: ProviderId;
  label: string;
  baseUrl: string;
  models: ProviderModel[];
  /** Where to create a key. */
  keyUrl: string | null;
  /** The provider's data-handling page. */
  dataUrl: string | null;
  limits: string;
  privacy: string;
  /** False when the service holds the key itself (FAITH's relay). */
  requiresKey: boolean;
}

/** FAITH's relay, deployed with the website; see web/api/chat/completions.js. */
export const FAITH_RELAY_URL = 'https://faith-ai-web.vercel.app/api';

export const PROVIDERS: Record<ProviderId, OnlineProvider> = {
  faith: {
    id: 'faith',
    label: 'FAITH’s assistant',
    baseUrl: FAITH_RELAY_URL,
    models: [{ id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B', note: 'Through FAITH’s relay. No key or account needed.' }],
    keyUrl: null,
    dataUrl: 'https://console.groq.com/docs/your-data',
    limits: 'Shared by everyone using FAITH, a few questions a minute each. When it is busy, FAITH answers on this device instead.',
    privacy: 'Your question and the facts shown go to FAITH’s relay (hosted on Vercel in the United States), which passes them to Groq and keeps nothing. Groq says it does not keep or train on requests by default.',
    requiresKey: false,
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: [
      { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B', note: 'Most capable. Recommended.' },
      { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B', note: 'Faster, a little less capable.' },
      { id: 'qwen/qwen3.8-27b', label: 'Qwen 3.8 27B', note: 'Alternative.' },
    ],
    keyUrl: 'https://console.groq.com/keys',
    dataUrl: 'https://console.groq.com/docs/your-data',
    limits: 'Free plan: 30 requests a minute and 1,000 a day, no card needed.',
    privacy: 'Groq says it does not keep inference requests by default and does not train on them; you can turn on “Zero Data Retention” in its console. Data is processed in the United States.',
    requiresKey: true,
  },
  custom: {
    id: 'custom',
    label: 'Custom (OpenAI-compatible)',
    baseUrl: '',
    models: [],
    keyUrl: null,
    dataUrl: null,
    limits: 'Any service with an OpenAI-style /chat/completions endpoint, including one on your own computer.',
    privacy: 'Check that service’s own privacy terms before sending health information to it.',
    requiresKey: true,
  },
};

const KEY_NAME = 'faith.online.apiKey';

export interface OnlineSettings {
  enabled: boolean;
  provider: ProviderId;
  model: string;
  baseUrl: string;
  hasKey: boolean;
}

let settings: OnlineSettings | null = null;
let loading: Promise<OnlineSettings> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export async function loadOnlineSettings(db: SqlExecutor): Promise<OnlineSettings> {
  if (settings) return settings;
  if (!loading) {
    loading = (async () => {
      const [enabled, provider, model, baseUrl, key] = await Promise.all([
        getSetting(db, SETTINGS.onlineEnabled),
        getSetting(db, SETTINGS.onlineProvider),
        getSetting(db, SETTINGS.onlineModel),
        getSetting(db, SETTINGS.onlineBaseUrl),
        getSecret(KEY_NAME),
      ]);
      const p: ProviderId = provider === 'custom' || provider === 'groq' ? provider : 'faith';
      settings = { enabled: enabled === '1', provider: p, model: model || PROVIDERS[p].models[0]?.id || '', baseUrl: baseUrl || '', hasKey: !!key };
      emit();
      return settings;
    })();
  }
  return loading;
}

/** Saves a change; `apiKey` replaces the stored key ('' removes it, undefined keeps it). */
export async function saveOnlineSettings(db: SqlExecutor, patch: Partial<Omit<OnlineSettings, 'hasKey'>>, apiKey?: string): Promise<OnlineSettings> {
  const cur = await loadOnlineSettings(db);
  const next: OnlineSettings = { ...cur, ...patch };
  if (patch.provider && patch.provider !== cur.provider && !patch.model) next.model = PROVIDERS[patch.provider].models[0]?.id ?? '';
  await Promise.all([
    setSetting(db, SETTINGS.onlineEnabled, next.enabled ? '1' : '0'),
    setSetting(db, SETTINGS.onlineProvider, next.provider),
    setSetting(db, SETTINGS.onlineModel, next.model),
    setSetting(db, SETTINGS.onlineBaseUrl, next.baseUrl),
  ]);
  if (apiKey !== undefined) {
    await setSecret(KEY_NAME, apiKey.trim() || null);
    next.hasKey = apiKey.trim().length > 0;
  }
  settings = next;
  emit();
  return next;
}

/**
 * True when the online assistant is switched on and has everything it needs apart from internet:
 * a key only for providers that require one (FAITH's relay needs none), an address for "custom",
 * and a model. The status badge and Settings use this, so the relay never shows as "off".
 */
export function isOnlineConfigured(s: OnlineSettings | null | undefined): boolean {
  if (!s || !s.enabled) return false;
  const provider = PROVIDERS[s.provider];
  if (provider.requiresKey && !s.hasKey) return false;
  if (s.provider === 'custom' && !s.baseUrl.trim()) return false;
  return s.model.trim().length > 0;
}

export function useOnlineSettings(): OnlineSettings | null {
  return useSyncExternalStore(
    subscribe,
    () => settings,
    () => settings,
  );
}

export async function isInternetReachable(): Promise<boolean> {
  if (Platform.OS === 'web') return (globalThis as { navigator?: { onLine?: boolean } }).navigator?.onLine !== false;
  try {
    const net = await Network.getNetworkStateAsync();
    return net.isConnected === true && net.isInternetReachable !== false;
  } catch {
    return false;
  }
}

/** Request fields a provider needs for reasoning models; others reject unknown fields. */
function extraBodyFor(provider: ProviderId, model: string): Record<string, unknown> {
  if (provider !== 'groq') return {};
  if (/gpt-oss/.test(model)) return { reasoning_effort: 'low' };
  if (/qwen/.test(model)) return { reasoning_format: 'hidden' };
  return {};
}

/** The online engine, or null when it is off, has no key, isn't configured, or there is no internet. */
export async function getOnlineEngine(db: SqlExecutor): Promise<InferenceEngine | null> {
  const s = await loadOnlineSettings(db);
  if (!s.enabled) return null;
  const provider = PROVIDERS[s.provider];
  const apiKey = provider.requiresKey ? await getSecret(KEY_NAME) : '';
  if (provider.requiresKey && !apiKey) return null;
  const baseUrl = s.provider === 'custom' ? s.baseUrl.trim() : provider.baseUrl;
  const model = s.model.trim();
  if (!baseUrl || !model) return null;
  if (!(await isInternetReachable())) return null;
  return new CloudEngine({ baseUrl, model, apiKey: apiKey ?? '', providerLabel: provider.label, requiresKey: provider.requiresKey, extraBody: extraBodyFor(s.provider, model) });
}

/** One tiny request to confirm the key and endpoint work. */
export async function testOnlineAssistant(db: SqlExecutor): Promise<{ ok: boolean; message: string }> {
  const s = await loadOnlineSettings(db);
  const provider = PROVIDERS[s.provider];
  const apiKey = provider.requiresKey ? await getSecret(KEY_NAME) : '';
  if (provider.requiresKey && !apiKey) return { ok: false, message: 'Paste an API key first.' };
  const baseUrl = s.provider === 'custom' ? s.baseUrl.trim() : provider.baseUrl;
  if (!baseUrl || !s.model.trim()) return { ok: false, message: 'Choose a model (and, for a custom service, enter its address).' };
  if (!(await isInternetReachable())) return { ok: false, message: 'No internet connection right now.' };
  const engine = new CloudEngine({ baseUrl, model: s.model.trim(), apiKey: apiKey ?? '', providerLabel: provider.label, requiresKey: provider.requiresKey, extraBody: extraBodyFor(s.provider, s.model) });
  try {
    const started = Date.now();
    const r = await engine.generate([{ role: 'user', content: 'Reply with the single word: ready' }], { maxTokens: 20, temperature: 0, timeoutMs: 20_000 });
    return { ok: true, message: `Connected to ${provider.label} (${s.model}) in ${((Date.now() - started) / 1000).toFixed(1)} s. It replied: “${r.text.slice(0, 40)}”.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** For tests. */
export function resetOnlineSettingsForTests(): void {
  settings = null;
  loading = null;
}
