/**
 * First-run set-up of FAITH's on-device AI. After the first profile is created, FAITH works out
 * which models suit this device (the best chat model it can run well, the search model, and on
 * phones the voice model) and downloads them:
 *  - on Wi-Fi in the phone app it starts by itself;
 *  - on mobile data (or unknown connection) it asks first and shows the size, because many people
 *    pay per megabyte;
 *  - in a browser it always asks, so visiting the site never pulls a gigabyte unasked.
 * Progress is shown on Home; the person can keep using FAITH meanwhile, or say "Not now".
 */
import * as Network from 'expo-network';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { SETTINGS, getSetting, setSetting } from '../../db/repo/profiles';
import type { SqlExecutor } from '../../db/sql';
import { downloadModel } from './downloads';
import type { ModelSpec } from './modelCatalog';
import type { ModelStatus } from './types';

export interface SetupPlan {
  models: ModelSpec[];
  totalBytes: number;
}

/**
 * Models to install by default, smallest first so search works within seconds. Already-installed
 * kinds are skipped. The chat model is the first one marked "recommended" for this device's memory,
 * otherwise the smallest one that can be installed.
 */
export function planSetup(statuses: ModelStatus[], platform: string): SetupPlan {
  const pick = (kind: ModelSpec['kind']): ModelSpec | null => {
    const ofKind = statuses.filter((s) => s.spec.kind === kind);
    if (ofKind.some((s) => s.installed)) return null;
    const usable = ofKind.filter((s) => s.compat.canInstall && s.compat.verdict !== 'unsupported' && s.compat.verdict !== 'not_recommended');
    const recommended = usable.find((s) => s.compat.verdict === 'recommended');
    const smallest = [...usable].sort((a, b) => a.spec.sizeBytes - b.spec.sizeBytes)[0];
    return (recommended ?? smallest)?.spec ?? null;
  };
  const kinds: ModelSpec['kind'][] = platform === 'web' ? ['embedding', 'llm'] : ['embedding', 'speech', 'llm'];
  const models = kinds.map(pick).filter((m): m is ModelSpec => !!m);
  return { models, totalBytes: models.reduce((n, m) => n + m.sizeBytes, 0) };
}

export type SetupState =
  | { status: 'idle' }
  | { status: 'ask'; plan: SetupPlan; onMobileData: boolean }
  | { status: 'running'; plan: SetupPlan; index: number }
  | { status: 'failed'; plan: SetupPlan; message: string }
  | { status: 'done'; justFinished: boolean };

let state: SetupState = { status: 'idle' };
let checked = false;
const listeners = new Set<() => void>();
const set = (next: SetupState) => {
  state = next;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const get = () => state;

export function useAiSetup(): SetupState {
  return useSyncExternalStore(subscribe, get, get);
}

async function onWifi(): Promise<boolean> {
  try {
    const net = await Network.getNetworkStateAsync();
    return net.isConnected === true && (net.type === Network.NetworkStateType.WIFI || net.type === Network.NetworkStateType.ETHERNET);
  } catch {
    return false;
  }
}

/** Runs once per app start: works out what is missing, then starts on Wi-Fi or asks. */
export async function checkAiSetup(db: SqlExecutor): Promise<void> {
  if (checked) return;
  checked = true;
  const saved = await getSetting(db, SETTINGS.aiSetup);
  if (saved === 'declined') return;
  const { modelStore } = await import('./modelStore');
  const plan = planSetup(await modelStore.status(), Platform.OS);
  if (plan.models.length === 0) {
    if (saved !== 'done') await setSetting(db, SETTINGS.aiSetup, 'done');
    set({ status: 'done', justFinished: false });
    return;
  }
  const wifi = Platform.OS !== 'web' && (await onWifi());
  if (wifi) void startAiSetup(db, plan);
  else set({ status: 'ask', plan, onMobileData: Platform.OS !== 'web' });
}

/** Downloads the plan one model at a time (each is switched on as soon as it finishes). */
export async function startAiSetup(db: SqlExecutor, plan: SetupPlan): Promise<void> {
  if (state.status === 'running') return;
  for (let i = 0; i < plan.models.length; i++) {
    set({ status: 'running', plan, index: i });
    try {
      await downloadModel(db, plan.models[i]);
    } catch (e) {
      set({ status: 'failed', plan: { ...plan, models: plan.models.slice(i) }, message: e instanceof Error ? e.message : 'The download stopped.' });
      return;
    }
  }
  await setSetting(db, SETTINGS.aiSetup, 'done');
  set({ status: 'done', justFinished: true });
}

/** "Not now": hides the card for good; models can still be added in Settings → On-device AI. */
export async function declineAiSetup(db: SqlExecutor): Promise<void> {
  await setSetting(db, SETTINGS.aiSetup, 'declined');
  set({ status: 'idle' });
}

export function dismissAiSetupDone(): void {
  set({ status: 'done', justFinished: false });
}

/** For tests. */
export function resetAiSetupForTests(): void {
  checked = false;
  state = { status: 'idle' };
}
