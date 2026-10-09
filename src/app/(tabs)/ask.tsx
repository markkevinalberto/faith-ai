import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SUGGESTED_QUESTIONS, answerQuestion, type AssistantAnswer } from '@/ai/answer';
import { engineStore } from '@/ai/inference/engineStore';
import { localModels } from '@/ai/inference/localModels';
import { getOnlineEngine } from '@/ai/inference/onlineAssistant';
import type { PriorTurn } from '@/ai/prompt';
import { AnswerCard } from '@/components/AnswerCard';
import { DemoBanner } from '@/components/AppChrome';
import { OfflineBadge } from '@/components/OfflineBadge';
import { OnlineOfferCard } from '@/components/OnlineOfferCard';
import { VoiceButton, type VoicePhase } from '@/components/VoiceButton';
import { SETTINGS, getSetting } from '@/db/repo/profiles';
import { useApp, useProfile } from '@/state/AppState';
import { friendlyError } from '@/state/hooks';
import { IconButton } from '@/ui/Button';
import { InlineLoading } from '@/ui/Feedback';
import { MascotCard } from '@/ui/Layout';
import { AppText } from '@/ui/Text';
import { RADIUS, SPACE, useTheme, useType } from '@/ui/theme';

interface Turn {
  id: string;
  question: string;
  answer: AssistantAnswer | null;
  tokens: number;
  error: string | null;
  /** True while the optional online assistant is answering. */
  online?: boolean;
}

/** What a turn said, for the chat history: the generated note or the headline and facts. */
function answerText(a: AssistantAnswer): string {
  return (a.generated?.text ?? [a.headline, ...a.facts.map((f) => f.text)].join(' ')).slice(0, 600);
}

export default function Ask() {
  const profile = useProfile();
  const { db, timeZone } = useApp();
  const { c } = useTheme();
  const type = useType();
  const params = useLocalSearchParams<{ q?: string }>();
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
      const [embedder, online] = await Promise.all([localModels.getEmbedder(), getOnlineEngine(db).catch(() => null)]);
      if (online) setTurns((t) => t.map((x) => (x.id === id ? { ...x, online: true } : x)));
      // The last few exchanges, so follow-up questions ("and last month?") make sense.
      const history: PriorTurn[] = turns.filter((x) => x.answer).slice(-4).map((x) => ({ question: x.question, answer: answerText(x.answer as AssistantAnswer) }));
      let tokens = 0;
      const answer = await answerQuestion({
        db,
        profile,
        question,
        now: new Date(),
        timeZone,
        engine: state.status === 'ready' ? state.engine : null,
        online,
        history,
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


  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <AppText variant="display" accessibilityRole="header">
              Ask FAITH
            </AppText>
            <OfflineBadge />
          </View>
        </View>
        <ScrollView ref={scroll} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.inner}>
            <DemoBanner />
            <OnlineOfferCard />
            {turns.length === 0 ? (
              <View style={{ gap: SPACE.md }}>
                <MascotCard
                  art="mascot-thinking"
                  height={160}
                  tone="primary"
                  header={
                    <AppText variant="body">
                      Ask about your readings, medicines, lab results or appointments. Answers use your records on this device and a curated offline library;
                      nothing is sent anywhere.
                    </AppText>
                  }
                />
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
                    <InlineLoading label={t.online ? 'Asking the online assistant…' : t.tokens > 0 ? `Writing on this device… (${t.tokens} tokens)` : 'Looking through your records…'} />
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
              style={[type.body, { color: c.text, flex: 1, minHeight: 48, maxHeight: 160 }]}
              multiline
              maxLength={500}
              onSubmitEditing={() => void ask(input)}
              blurOnSubmit
              returnKeyType="send"
              maxFontSizeMultiplier={1.6}
            />
            <VoiceButton label="Ask by voice" size={48} showStatus={false} onPhaseChange={setVoice} onTranscript={(text) => void ask(text)} />
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
  scroll: { paddingHorizontal: SPACE.lg, paddingBottom: SPACE.xl },
  inner: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: SPACE.xl },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, minHeight: 52, paddingHorizontal: SPACE.md, borderRadius: RADIUS.md, borderWidth: 1 },
  question: { alignSelf: 'flex-end', maxWidth: '88%', paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md, borderRadius: RADIUS.lg, borderBottomRightRadius: 6 },
  inputBar: { paddingHorizontal: SPACE.lg, paddingTop: SPACE.sm, paddingBottom: SPACE.sm, borderTopWidth: StyleSheet.hairlineWidth, gap: SPACE.xs },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderRadius: RADIUS.lg, paddingLeft: SPACE.md, width: '100%', maxWidth: 720, alignSelf: 'center' },
});
