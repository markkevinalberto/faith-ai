import Constants from 'expo-constants';
import { Linking, View } from 'react-native';

import { MODEL_CATALOG, formatBytes } from '@/ai/inference/modelCatalog';
import { LIBRARY, LIBRARY_AUTHORED_ON, LIBRARY_VERSION } from '@/ai/knowledge/library';
import { SOURCES } from '@/ai/knowledge/sources';
import { REFERENCE_TARGETS, formatTargetRange } from '@/domain/targets';
import { BrandMark, MeaningLine, TAGLINE, Wordmark } from '@/ui/Brand';
import { Banner } from '@/ui/Feedback';
import { Illustration } from '@/ui/Illustration';
import { Card, Screen, Section } from '@/ui/Layout';
import { AppText } from '@/ui/Text';
import { SPACE } from '@/ui/theme';

const STACK = [
  'React Native + Expo SDK 57 (TypeScript, Expo Router)',
  'expo-sqlite with SQLCipher encryption; expo-secure-store for the key',
  'expo-notifications (local only), expo-local-authentication (app lock)',
  'llama.rn 0.12.9 — React Native bindings for llama.cpp (on-device answers and embeddings)',
  'whisper.rn 0.7.4 — React Native bindings for whisper.cpp (on-device speech-to-text)',
  'Google ML Kit Text Recognition v2, bundled model (on-device label and report reading) via @react-native-ml-kit/text-recognition',
  '@fugood/react-native-audio-pcm-stream (microphone, in memory), expo-image-picker (camera), expo-network (offline badge)',
  'react-native-svg (charts), expo-file-system, expo-document-picker, expo-sharing',
  'Jest + Node’s built-in SQLite for automated tests',
];

export default function About() {
  return (
    <Screen edges={[]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
        <Illustration name="mascot-health-education" height={112} />
        <View style={{ flex: 1, gap: SPACE.xs }}>
          <BrandMark size={32} />
          <Wordmark size={26} />
          <MeaningLine />
          <AppText variant="caption" tone="muted">
            Version {Constants.expoConfig?.version ?? '1.0.0'} · {TAGLINE}
          </AppText>
        </View>
      </View>

      <Banner
        tone="warning"
        title="Not a medical device"
        message="FAITH helps you record and understand your own health information. It does not diagnose, prescribe, change doses or replace your clinician. Safety messages are drafts pending clinical review. In an emergency, call your local emergency number."
      />

      <Section title="Privacy">
        <Card style={{ gap: SPACE.xs }}>
          <AppText variant="body">All data stays on this phone in an encrypted database. There is no account, server, analytics or crash reporting. The only network request FAITH can make is the optional AI model download that you start yourself — it sends no health data.</AppText>
        </Card>
      </Section>

      <Section title="How Ask FAITH works">
        <Card style={{ gap: SPACE.xs }}>
          <AppText variant="body">1. A safety router checks for emergencies and requests to change medicines first.</AppText>
          <AppText variant="body">2. FAITH retrieves facts from your records and calculates averages, ranges and trends with tested code.</AppText>
          <AppText variant="body">3. A curated offline library adds plain-language explanations with sources.</AppText>
          <AppText variant="body">4. If a model is installed, it rewrites those facts on-device. Its output is checked; anything unsafe or unsupported is discarded.</AppText>
        </Card>
      </Section>

      <Section title="Disclosures" hint="Models, frameworks and tools used to build FAITH.">
        <Card style={{ gap: SPACE.sm }}>
          <AppText variant="bodyStrong">On-device models</AppText>
          {MODEL_CATALOG.map((m) => (
            <AppText key={m.id} variant="caption" tone="muted" onPress={() => void Linking.openURL(m.sourceRepo)}>
              • {m.name} ({m.quantization}, {formatBytes(m.sizeBytes)}) by Alibaba Cloud’s Qwen team — {m.license}
            </AppText>
          ))}
          <AppText variant="bodyStrong">Frameworks & libraries</AppText>
          {STACK.map((s) => (
            <AppText key={s} variant="caption" tone="muted">
              • {s}
            </AppText>
          ))}
          <AppText variant="bodyStrong">Development</AppText>
          <AppText variant="caption" tone="muted">
            • Built with AI-assisted development (Claude Code by Anthropic). No cloud AI API is used by the app at runtime.
          </AppText>
          <AppText variant="caption" tone="muted">
            • The FAITH mascot, illustrations and logo artwork were created with Google Flow and ChatGPT image generation (used during design only).
          </AppText>
        </Card>
      </Section>

      <Section title={`Reference library ${LIBRARY_VERSION}`} hint={`Authored ${LIBRARY_AUTHORED_ON}. Status: draft — pending clinical review.`}>
        <Card style={{ gap: SPACE.sm }}>
          {LIBRARY.map((a) => (
            <AppText key={a.id} variant="caption" tone="muted">
              • {a.title} — {a.sourceIds.map((s) => SOURCES[s]?.publisher.split('(')[0].trim()).join('; ')}
            </AppText>
          ))}
        </Card>
      </Section>

      <Section title="General reference ranges" hint="Used only when you haven’t entered a clinician-set target. Not personalised.">
        <Card style={{ gap: SPACE.sm }}>
          {Object.entries(REFERENCE_TARGETS)
            .filter(([, t]) => t)
            .map(([k, t]) => (
              <AppText key={k} variant="caption" tone="muted">
                • {k.replace(/_/g, ' ')}: {formatTargetRange(t!.low, t!.high, t!.unit)} — {t!.sourceLabel}
              </AppText>
            ))}
        </Card>
      </Section>

      <Section title="Sources">
        <Card style={{ gap: SPACE.sm }}>
          {Object.values(SOURCES).map((s) => (
            <AppText key={s.id} variant="caption" tone="primary" onPress={() => void Linking.openURL(s.url)} accessibilityRole="link">
              {s.title} — {s.publisher}, {s.year}
            </AppText>
          ))}
        </Card>
      </Section>
    </Screen>
  );
}
