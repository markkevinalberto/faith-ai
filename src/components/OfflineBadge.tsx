/**
 * Live proof that FAITH's AI needs no cloud: shows the phone's connection state next to the local
 * AI components that are running right now. In airplane mode it reads "Offline · AI running on
 * this phone" while answers, search, voice and scanning keep working.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import * as Network from 'expo-network';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { useEngineState } from '@/ai/inference/engineStore';
import { localModels, useLocalModels } from '@/ai/inference/localModels';
import { getModelSpec } from '@/ai/inference/modelCatalog';
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

export function OfflineBadge() {
  const { c } = useTheme();
  const connection = useConnection();
  const engine = useEngineState();
  const helpers = useLocalModels();
  const [installed, setInstalled] = useState({ embedding: false, speech: false });

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let live = true;
    void Promise.all([localModels.hasModel('embedding'), localModels.hasModel('speech')]).then(([embedding, speech]) => live && setInstalled({ embedding, speech }));
    return () => {
      live = false;
    };
  }, [helpers.embedding.status, helpers.speech.status]);

  const offline = connection === 'airplane' || connection === 'offline';
  const headline =
    Platform.OS === 'web'
      ? 'Web preview · records and offline library only'
      : offline
        ? `${connection === 'airplane' ? 'Airplane mode' : 'Offline'} · AI running on this phone`
        : 'Private · AI runs on this phone, nothing is sent';

  const llm = engine.status === 'ready' && engine.modelId ? getModelSpec(engine.modelId) : null;
  const parts: { key: string; label: string; on: boolean }[] =
    Platform.OS === 'web'
      ? []
      : [
          { key: 'llm', label: llm ? `${llm.family} ${llm.parameters}` : engine.status === 'loading' ? 'LLM loading…' : 'LLM off', on: !!llm },
          { key: 'search', label: 'Semantic search', on: helpers.embedding.status === 'ready' || installed.embedding },
          { key: 'voice', label: 'Whisper voice', on: helpers.speech.status === 'ready' || installed.speech },
          { key: 'ocr', label: 'ML Kit scan', on: true },
        ];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${headline}. ${parts.map((p) => `${p.label} ${p.on ? 'on' : 'off'}`).join(', ')}`}
      accessibilityHint="Opens on-device AI settings"
      onPress={() => router.push('/settings/model')}
      style={({ pressed }) => [styles.wrap, { backgroundColor: offline ? c.successSoft : c.primarySoft, opacity: pressed ? 0.85 : 1 }]}>
      <View style={styles.row}>
        <Ionicons name={connection === 'airplane' ? 'airplane' : offline ? 'cloud-offline' : 'shield-checkmark'} size={16} color={offline ? c.success : c.primary} />
        <AppText variant="label" tone={offline ? 'success' : 'primary'} style={{ flexShrink: 1 }} numberOfLines={2}>
          {headline}
        </AppText>
      </View>
      {parts.length ? (
        <View style={styles.pills}>
          {parts.map((p) => (
            <View key={p.key} style={[styles.pill, { backgroundColor: p.on ? c.surface : 'transparent', borderColor: p.on ? c.border : c.borderStrong }]}>
              <Ionicons name={p.on ? 'checkmark-circle' : 'ellipse-outline'} size={12} color={p.on ? c.success : c.textSubtle} />
              <AppText variant="caption" tone={p.on ? 'default' : 'subtle'}>
                {p.label}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', borderRadius: RADIUS.md, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, gap: SPACE.xs, marginTop: SPACE.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.pill, borderWidth: StyleSheet.hairlineWidth },
});
