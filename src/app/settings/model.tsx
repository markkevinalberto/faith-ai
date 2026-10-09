/**
 * On-device AI model manager: compatibility checks, explicit download (or import), verification,
 * loading, and a quick local test that proves inference runs here. Models are grouped by job:
 * assistant (LLM), semantic search (embeddings) and voice (Whisper). On Android the runtime is
 * llama.cpp / whisper.cpp; in the browser it is llama.cpp compiled to WebAssembly.
 */
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { activateModel, downloadModel, useDownloads } from '@/ai/inference/downloads';
import { engineStore, useEngineState } from '@/ai/inference/engineStore';
import { localModels, useLocalModels } from '@/ai/inference/localModels';
import { MODEL_CATALOG, MODEL_KIND_LABEL, formatBytes, type ModelKind, type ModelSpec } from '@/ai/inference/modelCatalog';
import { SETTINGS, getSetting, setSetting } from '@/db/repo/profiles';
import { useApp } from '@/state/AppState';
import { friendlyError, useQuery } from '@/state/hooks';
import { Button } from '@/ui/Button';
import { showAlert } from '@/ui/dialog';
import { Banner, Pill } from '@/ui/Feedback';
import { Illustration } from '@/ui/Illustration';
import { Card, Screen, Section, Stat } from '@/ui/Layout';
import { AppText } from '@/ui/Text';
import { RADIUS, SPACE, useTheme } from '@/ui/theme';

const WEB = Platform.OS === 'web';
const DEVICE = WEB ? 'browser' : 'phone';
// Whisper is not part of the browser build.
const KINDS: ModelKind[] = WEB ? ['llm', 'embedding'] : ['llm', 'embedding', 'speech'];

function confirmThen(title: string, message: string, confirmLabel: string, onConfirm: () => void, destructive = false) {
  showAlert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}

type Notice = { tone: 'danger' | 'info'; title: string; message: string } | null;

export default function ModelSettings() {
  const { db } = useApp();
  const { c } = useTheme();
  const engine = useEngineState();
  const helpers = useLocalModels();
  // Shared with the first-run set-up card on Home, so progress shows in both places.
  const downloads = useDownloads();
  const [tick, setTick] = useState(0);
  const [bench, setBench] = useState<{ text: string; tps: number | null; ms: number } | null>(null);
  const [benching, setBenching] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const info = useQuery(
    async (d) => {
      const { modelStore } = await import('@/ai/inference/modelStore');
      const g = globalThis as { crossOriginIsolated?: boolean; navigator?: { hardwareConcurrency?: number } };
      return {
        device: await modelStore.readDeviceProfile(),
        models: await modelStore.status(),
        activeId: await getSetting(d, SETTINGS.activeModelId),
        store: { runtimeLabel: modelStore.runtimeLabel, canImportFiles: modelStore.canImportFiles, storageNote: modelStore.storageNote },
        threads: WEB ? (g.crossOriginIsolated ? String(g.navigator?.hardwareConcurrency ?? '?') : '1') : null,
      };
    },
    [tick],
  );
  const refresh = () => setTick((t) => t + 1);

  /** Makes a newly installed model the one in use. */
  const activate = (spec: ModelSpec) => activateModel(db, spec);

  const startDownload = async (spec: ModelSpec) => {
    try {
      await downloadModel(db, spec);
    } catch (e) {
      setNotice({ tone: 'danger', title: 'Download did not complete', message: friendlyError(e) });
    } finally {
      refresh();
    }
  };

  const download = (spec: ModelSpec) =>
    confirmThen(
      `Download ${spec.name}?`,
      `${formatBytes(spec.sizeBytes)} from huggingface.co (${spec.license}). Downloading models is the only time FAITH uses the internet — no health data is sent.${WEB ? ' The file is kept in this browser’s private storage.' : ' Use Wi-Fi if possible.'}`,
      'Download',
      () => void startDownload(spec),
    );

  const importFile = async () => {
    try {
      const { modelStore } = await import('@/ai/inference/modelStore');
      const spec = await modelStore.importFromStorage();
      if (!spec) return;
      await activate(spec);
      refresh();
    } catch (e) {
      setNotice({ tone: 'danger', title: "Couldn't import model", message: friendlyError(e) });
    }
  };

  const use = async (spec: ModelSpec) => {
    await setSetting(db, SETTINGS.activeModelId, spec.id);
    await engineStore.load(spec);
    refresh();
  };

  const remove = (spec: ModelSpec) =>
    confirmThen(
      `Delete ${spec.name}?`,
      `Frees ${formatBytes(spec.sizeBytes)}. You can download it again later.`,
      'Delete',
      () =>
        void (async () => {
          if (engine.modelId === spec.id) await engineStore.unload();
          if (spec.kind !== 'llm') await localModels.release(spec.kind);
          const { modelStore } = await import('@/ai/inference/modelStore');
          await modelStore.remove(spec);
          if (info.data?.activeId === spec.id) await setSetting(db, SETTINGS.activeModelId, null);
          refresh();
        })(),
      true,
    );

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
        { maxTokens: 48, temperature: 0.3, timeoutMs: 120_000 },
      );
      setBench({ text: r.text, tps: r.tokensPerSecond, ms: r.durationMs });
    } catch (err) {
      setNotice({ tone: 'danger', title: 'Test failed', message: friendlyError(err) });
    } finally {
      setBenching(false);
    }
  };

  const loadedName = MODEL_CATALOG.find((m) => m.id === engine.modelId)?.name;

  return (
    <Screen edges={[]}>
      <View style={{ alignItems: 'center' }}>
        <Illustration name="mascot-offline" height={120} label="Works offline" />
      </View>
      <Banner
        tone="info"
        icon="hardware-chip-outline"
        title={WEB ? 'Runs entirely in this browser' : 'Runs entirely on your phone'}
        message={
          WEB
            ? 'In the browser, FAITH runs the same chat and embedding model files as the phone app through llama.cpp compiled to WebAssembly (wllama). Voice and scanning are phone-app features. Nothing is sent anywhere except the one-time model download, and without a model FAITH still answers from your records.'
            : 'FAITH runs open models locally: llama.cpp for answers and semantic search, whisper.cpp for voice, and Google ML Kit for reading labels and reports. Your questions, voice and records never leave the device, and there is no cloud fallback. Every model is optional — without them FAITH still answers from your records.'
        }
      />
      {notice ? <Banner tone={notice.tone} title={notice.title} message={notice.message} /> : null}

      {engine.status === 'ready' ? (
        <Card style={{ gap: SPACE.md }}>
          <AppText variant="heading">Model loaded</AppText>
          <AppText variant="body" tone="muted">
            {loadedName} is ready. {engine.engine?.label}
          </AppText>
          <Button title={`Run a quick ${WEB ? 'in-browser' : 'on-device'} test`} icon="speedometer-outline" variant="soft" loading={benching} onPress={() => void runBenchmark()} />
          {bench ? (
            <View style={{ gap: SPACE.xs }}>
              <AppText variant="body">“{bench.text}”</AppText>
              <View style={{ flexDirection: 'row', gap: SPACE.xl }}>
                <Stat label="Speed" value={bench.tps ? bench.tps.toFixed(1) : '—'} unit="tok/s" />
                <Stat label="Time" value={(bench.ms / 1000).toFixed(1)} unit="s" />
              </View>
              <AppText variant="caption" tone="subtle">
                {WEB ? 'Generated by llama.cpp WebAssembly in this browser. Try it with the network switched off.' : 'Generated offline by llama.cpp on this phone’s CPU. Try it in airplane mode.'}
              </AppText>
            </View>
          ) : null}
          <Button title="Unload model (free memory)" icon="power-outline" variant="ghost" onPress={() => void engineStore.unload()} />
        </Card>
      ) : null}
      {engine.status === 'loading' ? (
        <Banner tone="info" title={`Loading model… ${engine.progress ? `${Math.round(engine.progress)}%` : ''}`} message={WEB ? 'The file is read from this browser’s storage into WebAssembly memory. Large models take a while.' : 'This takes a few seconds the first time.'} />
      ) : null}
      {engine.status === 'error' ? <Banner tone="danger" title="The model could not be loaded" message={engine.error ?? 'Unknown error'} /> : null}

      {info.data ? (
        <Card style={{ gap: SPACE.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: SPACE.md }}>
            <Stat label="Memory" value={info.data.device.totalMemoryBytes ? formatBytes(info.data.device.totalMemoryBytes) : '—'} />
            <Stat label="Free storage" value={info.data.device.availableStorageBytes ? formatBytes(info.data.device.availableStorageBytes) : '—'} />
            {WEB ? <Stat label="Threads" value={info.data.threads ?? '—'} /> : <Stat label="CPU" value={info.data.device.cpuArchitectures[0] ?? '—'} />}
          </View>
          <AppText variant="caption" tone="subtle">
            Runtime: {info.data.store.runtimeLabel}. {info.data.store.storageNote}
          </AppText>
        </Card>
      ) : null}

      {KINDS.map((kind) => (
        <Section key={kind} title={MODEL_KIND_LABEL[kind].title} hint={MODEL_KIND_LABEL[kind].hint}>
          {info.data?.models
            .filter((m) => m.spec.kind === kind)
            .map(({ spec, installed, compat }) => {
              const dl = downloads.get(spec.id);
              const helper = spec.kind === 'embedding' ? helpers.embedding : spec.kind === 'speech' ? helpers.speech : null;
              const active = helper ? helper.modelId === spec.id && helper.status === 'ready' : engine.modelId === spec.id && engine.status === 'ready';
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
                    label={
                      compat.verdict === 'recommended'
                        ? `Recommended for this ${DEVICE}`
                        : compat.verdict === 'supported'
                          ? 'Supported'
                          : compat.verdict === 'not_recommended'
                            ? `Not recommended for this ${DEVICE}`
                            : 'Not supported'
                    }
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
                        Downloading {formatBytes(dl.bytes)} of {formatBytes(spec.sizeBytes)} ({Math.round(dl.progress * 100)}%) — then {WEB ? 'checking the file size' : 'verifying checksum'}…
                      </AppText>
                      <Button title="Cancel download" variant="ghost" size="sm" onPress={dl.cancel} />
                    </View>
                  ) : installed ? (
                    <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
                      {!active && spec.kind === 'llm' ? <Button title="Use this model" icon="play" size="sm" onPress={() => void use(spec)} style={{ flex: 1 }} /> : null}
                      <Button title="Delete" icon="trash-outline" size="sm" variant="danger" onPress={() => remove(spec)} style={{ flex: active || spec.kind !== 'llm' ? 1 : 0.6 }} />
                    </View>
                  ) : (
                    <Button
                      title={`Download (${formatBytes(spec.sizeBytes)})`}
                      icon="cloud-download-outline"
                      size="sm"
                      variant="secondary"
                      disabled={!compat.canInstall || compat.verdict === 'unsupported'}
                      onPress={() => download(spec)}
                    />
                  )}
                  <AppText variant="caption" tone="subtle" selectable>
                    Source: {spec.sourceRepo} · SHA-256 {spec.sha256.slice(0, 16)}…
                  </AppText>
                </Card>
              );
            })}
        </Section>
      ))}

      {WEB ? (
        <Banner tone="info" icon="phone-portrait-outline" title="Voice and scanning" message="Whisper speech-to-text and ML Kit label and report scanning run in the Android app. The browser build covers answers and semantic search." />
      ) : null}

      {info.data?.store.canImportFiles ? (
        <Section title="No internet at the venue?" hint="Copy a supported model file (.gguf or Whisper .bin) to the phone by USB or the Files app, then import it. It is verified before use.">
          <Button title="Import model file from this phone" icon="folder-open-outline" variant="secondary" onPress={() => void importFile()} />
        </Section>
      ) : null}
    </Screen>
  );
}
