/**
 * Live proof that FAITH's AI needs no cloud, as a compact dropdown at the top of Ask FAITH.
 * Collapsed: one line with the connection state and the chat model in use. Expanded: switch between
 * installed chat models, see which other local AI parts are ready, or open the model settings.
 * In airplane mode it reads "Airplane mode · AI on this phone" while everything keeps working.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import * as Network from 'expo-network';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { engineStore, useEngineState } from '@/ai/inference/engineStore';
import { localModels, useLocalModels } from '@/ai/inference/localModels';
import { getModelSpec, type ModelSpec } from '@/ai/inference/modelCatalog';
import { SETTINGS, setSetting } from '@/db/repo/profiles';
import { useApp } from '@/state/AppState';
import { Button } from '@/ui/Button';
import { AppText } from '@/ui/Text';
import { RADIUS, SPACE, useTheme } from '@/ui/theme';

type Connection = 'airplane' | 'offline' | 'online' | 'unknown';

function useConnection(): Connection {
  const net = Network.useNetworkState();
  const [airplane, setAirplane] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let live = true;
    void Network.isAirplaneModeEnabledAsync()
      .then((on) => live && setAirplane(on))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [net.isConnected, net.type]);
  if (airplane) return 'airplane';
  if (net.isConnected === false || net.isInternetReachable === false) return 'offline';
  if (net.isConnected) return 'online';
  return 'unknown';
}

const shortName = (spec: ModelSpec) => spec.name.replace(' Instruct', '');

export function OfflineBadge() {
  const { c } = useTheme();
  const { db } = useApp();
  const connection = useConnection();
  const engine = useEngineState();
  const helpers = useLocalModels();
  const [open, setOpen] = useState(false);
  const [installed, setInstalled] = useState({ embedding: false, speech: false });
  const [chatModels, setChatModels] = useState<ModelSpec[] | null>(null);

  useEffect(() => {
    let live = true;
    void Promise.all([localModels.hasModel('embedding'), localModels.hasModel('speech')]).then(([embedding, speech]) => live && setInstalled({ embedding, speech }));
    return () => {
      live = false;
    };
  }, [helpers.embedding.status, helpers.speech.status]);

  // The installed chat models are only needed once the dropdown is opened.
  useEffect(() => {
    if (!open) return;
    let live = true;
    void import('@/ai/inference/modelStore')
      .then(({ modelStore }) => modelStore.status())
      .then((all) => live && setChatModels(all.filter((m) => m.spec.kind === 'llm' && m.installed).map((m) => m.spec)))
      .catch(() => live && setChatModels([]));
    return () => {
      live = false;
    };
  }, [open]);

  const offline = connection === 'airplane' || connection === 'offline';
  const here = Platform.OS === 'web' ? 'in this browser' : 'on this phone';
  const headline = offline ? `${connection === 'airplane' ? 'Airplane mode' : 'Offline'} · AI ${here}` : `Private · AI runs ${here}`;
  const active = engine.modelId ? getModelSpec(engine.modelId) : null;
  const modelLine =
    engine.status === 'ready' && active
      ? shortName(active)
      : engine.status === 'loading'
        ? `Loading ${active ? shortName(active) : 'model'}…`
        : engine.status === 'error'
          ? 'Model failed to load · answers from your records'
          : 'No chat model · answers from your records';
  const fg = offline ? c.success : c.primary;

  const choose = async (spec: ModelSpec) => {
    await setSetting(db, SETTINGS.activeModelId, spec.id);
    await engineStore.load(spec);
  };

  const parts = [
    { key: 'search', label: 'Search by meaning', on: helpers.embedding.status === 'ready' || installed.embedding },
    ...(Platform.OS === 'web'
      ? []
      : [
          { key: 'voice', label: 'Voice (Whisper)', on: helpers.speech.status === 'ready' || installed.speech },
          { key: 'ocr', label: 'Label and report scanning', on: true },
        ]),
  ];

  return (
    <View style={[styles.wrap, { backgroundColor: offline ? c.successSoft : c.primarySoft }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        accessibilityLabel={`${headline}. ${modelLine}.`}
        accessibilityHint={open ? 'Hides the on-device AI details' : 'Shows the on-device AI details and model choice'}
        onPress={() => setOpen(!open)}
        style={({ pressed }) => [styles.head, pressed && { opacity: 0.8 }]}>
        <Ionicons name={connection === 'airplane' ? 'airplane' : offline ? 'cloud-offline' : 'shield-checkmark'} size={20} color={fg} />
        <View style={{ flex: 1 }}>
          <AppText variant="label" style={{ color: fg }}>
            {headline}
          </AppText>
          <AppText variant="caption" tone="muted" numberOfLines={2}>
            {modelLine}
          </AppText>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={22} color={fg} />
      </Pressable>

      {open ? (
        <View style={[styles.panel, { borderTopColor: c.border }]}>
          <AppText variant="label">Chat model</AppText>
          {chatModels === null ? (
            <AppText variant="caption" tone="muted">
              Checking installed models…
            </AppText>
          ) : chatModels.length === 0 ? (
            <AppText variant="caption" tone="muted">
              No chat model installed yet. FAITH still answers from your records.
            </AppText>
          ) : (
            <View accessibilityRole="radiogroup">
              {chatModels.map((spec) => {
                const selected = engine.modelId === spec.id;
                return (
                  <Pressable
                    key={spec.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, disabled: engine.status === 'loading' }}
                    aria-checked={selected}
                    accessibilityLabel={`${shortName(spec)}, ${spec.description}`}
                    disabled={engine.status === 'loading'}
                    onPress={() => void choose(spec)}
                    style={styles.option}>
                    <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={22} color={selected ? c.primary : c.textSubtle} />
                    <View style={{ flex: 1 }}>
                      <AppText variant="bodyStrong">{shortName(spec)}</AppText>
                      <AppText variant="caption" tone="muted">
                        {spec.description}
                      </AppText>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          <AppText variant="label" style={{ marginTop: SPACE.xs }}>
            Also running {here}
          </AppText>
          {parts.map((p) => (
            <View key={p.key} style={styles.part}>
              <Ionicons name={p.on ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={p.on ? c.success : c.textSubtle} />
              <AppText variant="body" tone={p.on ? 'default' : 'subtle'}>
                {p.label}
                {p.on ? '' : ' · not installed'}
              </AppText>
            </View>
          ))}
          {Platform.OS === 'web' ? (
            <AppText variant="caption" tone="muted">
              Voice and label scanning are in the phone app.
            </AppText>
          ) : null}
          <Button title="Manage AI models" icon="settings-outline" variant="secondary" size="sm" onPress={() => router.push('/settings/model')} style={{ alignSelf: 'flex-start', marginTop: SPACE.xs }} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', borderRadius: RADIUS.md, marginTop: SPACE.xs, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, minHeight: 52, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm },
  panel: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: SPACE.md, paddingTop: SPACE.sm, paddingBottom: SPACE.md, gap: SPACE.xs },
  option: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, minHeight: 56, paddingVertical: SPACE.xs },
  part: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, minHeight: 28 },
});
