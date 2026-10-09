/**
 * Home card for the first-run AI set-up (see ai/inference/autoSetup.ts): asks before using mobile
 * data, shows progress while FAITH downloads its on-device models, and says when they are ready.
 */
import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { checkAiSetup, declineAiSetup, dismissAiSetupDone, startAiSetup, useAiSetup } from '@/ai/inference/autoSetup';
import { useDownloads } from '@/ai/inference/downloads';
import { MODEL_KIND_LABEL, formatBytes } from '@/ai/inference/modelCatalog';
import { useApp } from '@/state/AppState';
import { Button } from '@/ui/Button';
import { Illustration } from '@/ui/Illustration';
import { Card } from '@/ui/Layout';
import { AppText } from '@/ui/Text';
import { RADIUS, SPACE, useTheme } from '@/ui/theme';

const WEB = Platform.OS === 'web';
const HERE = WEB ? 'in this browser' : 'on this phone';

export function AiSetupCard() {
  const { db } = useApp();
  const { c } = useTheme();
  const setup = useAiSetup();
  const downloads = useDownloads();

  useEffect(() => {
    void checkAiSetup(db).catch(() => undefined);
  }, [db]);

  if (setup.status === 'idle') return null;
  if (setup.status === 'done') {
    if (!setup.justFinished) return null;
    return (
      <Card tone="success" style={styles.card}>
        <View style={styles.row}>
          <Illustration name="mascot-celebrating" height={84} />
          <View style={{ flex: 1, gap: SPACE.xs }}>
            <AppText variant="heading">FAITH’s offline AI is ready</AppText>
            <AppText variant="body" tone="muted">
              Answers, search{WEB ? '' : ' and voice'} now work {HERE}, even with no internet.
            </AppText>
          </View>
        </View>
        <Button title="Great" variant="secondary" onPress={dismissAiSetupDone} />
      </Card>
    );
  }

  const parts = setup.plan.models.map((m) => MODEL_KIND_LABEL[m.kind].title.toLowerCase()).join(', ');

  if (setup.status === 'running') {
    const spec = setup.plan.models[setup.index];
    const dl = downloads.get(spec.id);
    const pct = Math.round((dl?.progress ?? 0) * 100);
    return (
      <Card style={styles.card} accessibilityLabel={`Setting up FAITH's offline AI: ${spec.name}, ${pct} percent, ${setup.index + 1} of ${setup.plan.models.length}`}>
        <View style={styles.row}>
          <Illustration name="mascot-offline" height={72} />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="heading">Getting FAITH ready to work offline</AppText>
            <AppText variant="caption" tone="muted">
              {MODEL_KIND_LABEL[spec.kind].title} · {setup.index + 1} of {setup.plan.models.length} · {pct}%
            </AppText>
          </View>
        </View>
        <View style={[styles.track, { backgroundColor: c.surfaceMuted }]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }}>
          <View style={[styles.fill, { backgroundColor: c.primary, width: `${pct}%` }]} />
        </View>
        <AppText variant="caption" tone="muted">
          You can keep using FAITH while this downloads. Downloading is the only time FAITH uses the internet; no health data is sent.
        </AppText>
      </Card>
    );
  }

  const failed = setup.status === 'failed';
  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <Illustration name="mascot-offline" height={84} />
        <View style={{ flex: 1, gap: SPACE.xs }}>
          <AppText variant="heading">{failed ? 'The download stopped' : 'Let FAITH work offline'}</AppText>
          <AppText variant="body" tone="muted">
            {failed
              ? `${setup.message} Check your connection and try again.`
              : `Download FAITH’s on-device AI once (${parts}, about ${formatBytes(setup.plan.totalBytes)}). After that it works ${HERE} with no internet.`}
          </AppText>
        </View>
      </View>
      {!failed && setup.onMobileData ? (
        <AppText variant="caption" tone="warning">
          You seem to be on mobile data. Use Wi-Fi if you can; this download is large.
        </AppText>
      ) : null}
      <View style={{ gap: SPACE.sm }}>
        <Button title={failed ? 'Try again' : `Download now (${formatBytes(setup.plan.totalBytes)})`} icon="download-outline" size="lg" onPress={() => void startAiSetup(db, setup.plan)} />
        <Button title="Not now" variant="ghost" onPress={() => void declineAiSetup(db)} accessibilityHint="You can download the models later in Settings, On-device AI" />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: SPACE.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  track: { height: 10, borderRadius: RADIUS.pill, overflow: 'hidden' },
  fill: { height: 10, borderRadius: RADIUS.pill },
});
