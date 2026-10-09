import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SUGGESTED_QUESTIONS, answerQuestion, type AssistantAnswer } from '@/ai/answer';
import { engineStore, useEngineState } from '@/ai/inference/engineStore';
import { localModels } from '@/ai/inference/localModels';
import { getModelSpec } from '@/ai/inference/modelCatalog';
import { AnswerCard } from '@/components/AnswerCard';
import { DemoBanner } from '@/components/AppChrome';
import { OfflineBadge } from '@/components/OfflineBadge';
import { VoiceButton, type VoicePhase } from '@/components/VoiceButton';
import { SETTINGS, getSetting } from '@/db/repo/profiles';
import { useApp, useProfile } from '@/state/AppState';
import { friendlyError } from '@/state/hooks';
import { IconButton } from '@/ui/Button';
import { InlineLoading } from '@/ui/Feedback';
import { Illustration } from '@/ui/Illustration';
import { AppText } from '@/ui/Text';
import { RADIUS, SPACE, TYPE, useTheme } from '@/ui/theme';

interface Turn {
  id: string;
  question: string;
  answer: AssistantAnswer | null;
  tokens: number;
  error: string | null;
}

export default function Ask() {
  const profile = useProfile();
  const { db, timeZone } = useApp();
  const { c } = useTheme();
  const params = useLocalSearchParams<{ q?: string }>();
  const engine = useEngineState();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [voice, setVoice] = useState<VoicePhase>('idle');
  const scroll = useRef<ScrollView>(null);
  const handledQ = useRef<string | null>(null);

  useEffect(() => {
    setTurns([]);
  }, [profile.id]);

  useEffect(() => {
    void getSetting(db, SETTINGS.activeModelId).then((id) => {
      if (id && engineStore.get().status === 'none') void engineStore.loadById(id);
    });
    // Warm the small embedding model so the first semantic search is quick.
    void localModels.getEmbedder();
  }, [db]);

  const ask = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    const id = `${Date.now()}`;
    setTurns((t) => [...t, { id, question, answer: null, tokens: 0, error: null }]);
    setInput('');
    setBusy(true);
    try {
      const state = engineStore.get();
      const embedder = await localModels.getEmbedder();
      let tokens = 0;
      const answer = await answerQuestion({
        db,
        profile,
        question,
        now: new Date(),
        timeZone,
        engine: state.status === 'ready' ? state.engine : null,
        embedder,
        // Raw tokens are NOT displayed before the safety guard runs; only progress is shown.
        onToken: () => {
          tokens += 1;
          if (tokens % 4 === 0) setTurns((t) => t.map((x) => (x.id === id ? { ...x, tokens } : x)));
        },
      });
      setTurns((t) => t.map((x) => (x.id === id ? { ...x, answer } : x)));
    } catch (e) {
      setTurns((t) => t.map((x) => (x.id === id ? { ...x, error: friendlyError(e) } : x)));
    } finally {
      setBusy(false);
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 120);
    }
  };

  useEffect(() => {
    if (params.q && handledQ.current !== params.q) {
      handledQ.current = params.q;
      void ask(params.q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.q]);

  const spec = engine.modelId ? getModelSpec(engine.modelId) : null;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <AppText variant="display" accessibilityRole="header">
              Ask FAITH
            </AppText>
            <OfflineBadge />
            {engine.status === 'error' ? (
              <Pressable accessibilityRole="button" onPress={() => router.push('/settings/model')} style={styles.status}>
                <Ionicons name="alert-circle-outline" size={14} color={c.danger} />
                <AppText variant="caption" tone="danger" numberOfLines={1}>
                  {spec?.name ?? 'Model'} failed to load — using record summaries
                </AppText>
              </Pressable>
            ) : null}
          </View>
        </View>
        <ScrollView ref={scroll} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.inner}>
            <DemoBanner />
            {turns.length === 0 ? (
              <View style={{ gap: SPACE.md }}>
                <View style={[styles.intro, { backgroundColor: c.primarySoft }]}>
                  <Illustration name="mascot-thinking" height={104} />
                  <AppText variant="body" tone="muted" style={{ flex: 1 }}>
                    Ask about your readings, medications, lab results or appointments. Answers use your records on this phone and a curated offline library —
                    nothing is sent anywhere.
                  </AppText>
                </View>
                {SUGGESTED_QUESTIONS.map((s) => (
                  <Pressable key={s} accessibilityRole="button" onPress={() => void ask(s)} style={({ pressed }) => [styles.suggestion, { borderColor: c.border, backgroundColor: pressed ? c.surfaceMuted : c.surface }]}>
                    <Ionicons name="chatbubble-ellipses-outline" size={18} color={c.primary} />
                    <AppText variant="body" style={{ flex: 1 }}>
                      {s}
                    </AppText>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {turns.map((t) => (
              <View key={t.id} style={{ gap: SPACE.md }}>
                <View style={[styles.question, { backgroundColor: c.primary }]}>
                  <AppText variant="body" tone="onPrimary">
                    {t.question}
                  </AppText>
                </View>
                {t.answer ? <AnswerCard answer={t.answer} emergencyNumber={profile.emergencyNumber} /> : null}
                {!t.answer && !t.error ? (
                  <View>
                    <InlineLoading label={t.tokens > 0 ? `Writing on this device… (${t.tokens} tokens)` : 'Looking through your records…'} />
                    {t.tokens > 0 ? (
                      <Pressable accessibilityRole="button" onPress={() => void engineStore.get().engine?.stop()} style={{ alignSelf: 'center', minHeight: 44, justifyContent: 'center' }}>
                        <AppText variant="label" tone="primary">
                          Stop generating
                        </AppText>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
                {t.error ? (
                  <AppText variant="body" tone="danger">
                    {t.error}
                  </AppText>
                ) : null}
              </View>
            ))}
          </View>
        </ScrollView>
        <View style={[styles.inputBar, { backgroundColor: c.surface, borderTopColor: c.border }]}>
          <View style={[styles.inputWrap, { backgroundColor: c.surfaceMuted }]}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder={voice === 'listening' ? 'Listening… tap ■ when you finish' : voice === 'transcribing' ? 'Transcribing on this phone…' : Platform.OS === 'web' ? 'Ask about your health records…' : 'Ask or tap the mic…'}
              placeholderTextColor={c.textSubtle}
              accessibilityLabel="Your question"
              style={[TYPE.body, { color: c.text, flex: 1, minHeight: 48, maxHeight: 120 }]}
              multiline
              maxLength={500}
              onSubmitEditing={() => void ask(input)}
              blurOnSubmit
              returnKeyType="send"
              maxFontSizeMultiplier={1.6}
            />
            <VoiceButton label="Ask by voice" size={40} showStatus={false} onPhaseChange={setVoice} onTranscript={(text) => void ask(text)} />
            <IconButton icon="arrow-up-circle" label="Send question" tone="primary" size={30} onPress={() => void ask(input)} disabled={busy || !input.trim()} />
          </View>
          <AppText variant="caption" tone="subtle" center>
            FAITH can’t diagnose or change treatment. In an emergency, call your local emergency number.
          </AppText>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: SPACE.lg, paddingTop: SPACE.md, paddingBottom: SPACE.sm, flexDirection: 'row' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 6, marginTop: SPACE.xs, minHeight: 32 },
  scroll: { paddingHorizontal: SPACE.lg, paddingBottom: SPACE.xl },
  inner: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: SPACE.xl },
  intro: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, padding: SPACE.md, borderRadius: RADIUS.lg },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, minHeight: 52, paddingHorizontal: SPACE.md, borderRadius: RADIUS.md, borderWidth: 1 },
  question: { alignSelf: 'flex-end', maxWidth: '88%', paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md, borderRadius: RADIUS.lg, borderBottomRightRadius: 6 },
  inputBar: { paddingHorizontal: SPACE.lg, paddingTop: SPACE.sm, paddingBottom: SPACE.sm, borderTopWidth: StyleSheet.hairlineWidth, gap: SPACE.xs },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderRadius: RADIUS.lg, paddingLeft: SPACE.md, width: '100%', maxWidth: 720, alignSelf: 'center' },
});
