/**
 * On-device AI model manager: compatibility checks, explicit download (or import), verification,
 * loading, and a quick local benchmark that proves inference runs on the phone.
 */
import { useState, useSyncExternalStore } from 'react';
import { Alert, Platform, View } from 'react-native';

import { engineStore, useEngineState } from '@/ai/inference/engineStore';
import { MODEL_CATALOG, formatBytes, type ModelSpec } from '@/ai/inference/modelCatalog';
import { SETTINGS, getSetting, setSetting } from '@/db/repo/profiles';
import { useApp } from '@/state/AppState';
import { friendlyError, useQuery } from '@/state/hooks';
import { Button } from '@/ui/Button';
import { Banner, Pill } from '@/ui/Feedback';
import { Illustration } from '@/ui/Illustration';
import { Card, Screen, Section, Stat } from '@/ui/Layout';
import { AppText } from '@/ui/Text';
import { RADIUS, SPACE, useTheme } from '@/ui/theme';

/* Download progress survives leaving this screen. */
type DownloadState = { progress: number; bytes: number; cancel: () => void } | undefined;
const downloads = new Map<string, DownloadState>();
const listeners = new Set<() => void>();
let snapshot = 0;
const emit = () => {
  snapshot++;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export default function ModelSettings() {
  const { db } = useApp();
  const { c } = useTheme();
  const engine = useEngineState();
  useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
  const [tick, setTick] = useState(0);
  const [bench, setBench] = useState<{ text: string; tps: number | null; ms: number } | null>(null);
  const [benching, setBenching] = useState(false);

  const info = useQuery(
    async (d) => {
      if (Platform.OS === 'web') return null;
      const mm = await import('@/ai/inference/modelManager');
      return {
        device: mm.readDeviceProfile(),
        models: MODEL_CATALOG.map((spec) => ({ spec, installed: mm.isInstalled(spec), compat: mm.compatibilityFor(spec) })),
        activeId: await getSetting(d, SETTINGS.activeModelId),
      };
    },
    [tick],
  );
  const refresh = () => setTick((t) => t + 1);

  const download = (spec: ModelSpec) =>
    Alert.alert(
      `Download ${spec.name}?`,
      `${formatBytes(spec.sizeBytes)} from huggingface.co (${spec.license}). This is the only time FAITH uses the internet — no health data is sent. Use Wi-Fi if possible.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Download',
          onPress: async () => {
            const mm = await import('@/ai/inference/modelManager');
            const handle = mm.downloadModel(spec, (progress, bytes) => {
              const cur = downloads.get(spec.id);
              if (cur) downloads.set(spec.id, { ...cur, progress, bytes });
              emit();
            });
            downloads.set(spec.id, { progress: 0, bytes: 0, cancel: handle.cancel });
            emit();
            try {
              await handle.promise;
              await setSetting(db, SETTINGS.activeModelId, spec.id);
              await engineStore.load(spec);
            } catch (e) {
              Alert.alert('Download did not complete', friendlyError(e));
            } finally {
              downloads.delete(spec.id);
              emit();
              refresh();
            }
          },
        },
      ],
    );

  const importFile = async () => {
    try {
      const mm = await import('@/ai/inference/modelManager');
      const r = await mm.importModelFromStorage();
      if (!r) return;
      await setSetting(db, SETTINGS.activeModelId, r.spec.id);
      await engineStore.load(r.spec);
      refresh();
    } catch (e) {
      Alert.alert("Couldn't import model", friendlyError(e));
    }
  };

  const use = async (spec: ModelSpec) => {
    await setSetting(db, SETTINGS.activeModelId, spec.id);
    await engineStore.load(spec);
    refresh();
  };

  const remove = (spec: ModelSpec) =>
    Alert.alert(`Delete ${spec.name}?`, `Frees ${formatBytes(spec.sizeBytes)}. You can download it again later.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (engine.modelId === spec.id) await engineStore.unload();
          const mm = await import('@/ai/inference/modelManager');
          mm.deleteModel(spec);
          if (info.data?.activeId === spec.id) await setSetting(db, SETTINGS.activeModelId, null);
          refresh();
        },
      },
    ]);

  const runBenchmark = async () => {
    const e = engineStore.get().engine;
    if (!e) return;
    setBenching(true);
    setBench(null);
    try {
      const r = await e.generate(
        [
          { role: 'system', content: 'You are a friendly assistant. Reply in one short sentence.' },
          { role: 'user', content: 'Say hello to someone who just installed a private health app.' },
        ],
        { maxTokens: 48, temperature: 0.3, timeoutMs: 60_000 },
      );
      setBench({ text: r.text, tps: r.tokensPerSecond, ms: r.durationMs });
    } catch (err) {
      Alert.alert('Test failed', friendlyError(err));
    } finally {
      setBenching(false);
    }
  };

  if (Platform.OS === 'web') {
    return (
      <Screen edges={[]}>
        <Banner tone="info" message="On-device models run in the Android or iOS app. In this web preview, Ask FAITH uses record summaries and the offline library only." />
      </Screen>
    );
  }

  return (
    <Screen edges={[]}>
      <View style={{ alignItems: 'center' }}>
        <Illustration name="mascot-offline" height={120} label="Works offline" />
      </View>
      <Banner
        tone="info"
        icon="hardware-chip-outline"
        title="Runs entirely on your phone"
        message="FAITH uses llama.cpp (via llama.rn) to run a small open model locally. Your questions and records never leave the device, and there is no cloud fallback. Without a model, FAITH still answers from your records."
      />

      {engine.status === 'ready' ? (
        <Card style={{ gap: SPACE.md }}>
          <AppText variant="heading">Model loaded</AppText>
          <AppText variant="body" tone="muted">
            {MODEL_CATALOG.find((m) => m.id === engine.modelId)?.name} is ready on this device.
          </AppText>
          <Button title="Run a quick on-device test" icon="speedometer-outline" variant="soft" loading={benching} onPress={() => void runBenchmark()} />
          {bench ? (
            <View style={{ gap: SPACE.xs }}>
              <AppText variant="body">“{bench.text}”</AppText>
              <View style={{ flexDirection: 'row', gap: SPACE.xl }}>
                <Stat label="Speed" value={bench.tps ? bench.tps.toFixed(1) : '—'} unit="tok/s" />
                <Stat label="Time" value={(bench.ms / 1000).toFixed(1)} unit="s" />
              </View>
              <AppText variant="caption" tone="subtle">
                Generated offline by llama.cpp on this phone’s CPU. Try it in airplane mode.
              </AppText>
            </View>
          ) : null}
          <Button title="Unload model (free memory)" icon="power-outline" variant="ghost" onPress={() => void engineStore.unload()} />
        </Card>
      ) : null}
      {engine.status === 'loading' ? <Banner tone="info" title="Loading model…" message="This takes a few seconds the first time." /> : null}
      {engine.status === 'error' ? <Banner tone="danger" title="The model could not be loaded" message={engine.error ?? 'Unknown error'} /> : null}

      {info.data ? (
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: SPACE.md }}>
            <Stat label="Memory" value={info.data.device.totalMemoryBytes ? formatBytes(info.data.device.totalMemoryBytes) : '—'} />
            <Stat label="Free storage" value={info.data.device.availableStorageBytes ? formatBytes(info.data.device.availableStorageBytes) : '—'} />
            <Stat label="CPU" value={info.data.device.cpuArchitectures[0] ?? '—'} />
          </View>
        </Card>
      ) : null}

      <Section title="Available models">
        {info.data?.models.map(({ spec, installed, compat }) => {
          const dl = downloads.get(spec.id);
          const active = engine.modelId === spec.id && engine.status === 'ready';
          return (
            <Card key={spec.id} style={{ gap: SPACE.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
                <AppText variant="heading" style={{ flex: 1 }}>
                  {spec.name}
                </AppText>
                {active ? <Pill label="In use" tone="success" /> : installed ? <Pill label="Installed" tone="primary" /> : null}
              </View>
              <AppText variant="caption" tone="muted">
                {spec.parameters} parameters · {spec.quantization} · {formatBytes(spec.sizeBytes)} · {spec.license}
              </AppText>
              <AppText variant="body">{spec.description}</AppText>
              <Pill
                label={compat.verdict === 'recommended' ? 'Recommended for this phone' : compat.verdict === 'supported' ? 'Supported' : compat.verdict === 'not_recommended' ? 'Not recommended for this phone' : 'Not supported'}
                tone={compat.verdict === 'recommended' ? 'success' : compat.verdict === 'supported' ? 'info' : 'warning'}
              />
              {compat.reasons.map((r) => (
                <AppText key={r} variant="caption" tone="subtle">
                  • {r}
                </AppText>
              ))}
              {dl ? (
                <View style={{ gap: SPACE.xs }}>
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: c.surfaceMuted, overflow: 'hidden' }}>
                    <View style={{ height: 8, borderRadius: RADIUS.sm, backgroundColor: c.primary, width: `${Math.round(dl.progress * 100)}%` }} />
                  </View>
                  <AppText variant="caption" tone="muted">
                    Downloading {formatBytes(dl.bytes)} of {formatBytes(spec.sizeBytes)} ({Math.round(dl.progress * 100)}%) — then verifying checksum…
                  </AppText>
                  <Button title="Cancel download" variant="ghost" size="sm" onPress={dl.cancel} />
                </View>
              ) : installed ? (
                <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
                  {!active ? <Button title="Use this model" icon="play" size="sm" onPress={() => void use(spec)} style={{ flex: 1 }} /> : null}
                  <Button title="Delete" icon="trash-outline" size="sm" variant="danger" onPress={() => remove(spec)} style={{ flex: active ? 1 : 0.6 }} />
                </View>
              ) : (
                <Button title={`Download (${formatBytes(spec.sizeBytes)})`} icon="cloud-download-outline" size="sm" variant="secondary" disabled={!compat.canInstall || compat.verdict === 'unsupported'} onPress={() => download(spec)} />
              )}
              <AppText variant="caption" tone="subtle" selectable>
                Source: {spec.sourceRepo} · SHA-256 {spec.sha256.slice(0, 16)}…
              </AppText>
            </Card>
          );
        })}
      </Section>

      <Section title="No internet at the venue?" hint="Copy a supported .gguf file to the phone (USB or Files app), then import it. It is verified before use.">
        <Button title="Import model file from this phone" icon="folder-open-outline" variant="secondary" onPress={() => void importFile()} />
      </Section>
    </Screen>
  );
}
