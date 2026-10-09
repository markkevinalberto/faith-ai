/**
 * Renders an assistant answer with clearly separated provenance:
 *   1. safety card / refusal,
 *   2. AI-generated explanation (labelled, on-device),
 *   3. "From your records" (user-recorded facts and app-computed numbers),
 *   4. "Reference library" (curated articles with sources and review status).
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { AssistantAnswer } from '@/ai/answer';
import { LIBRARY_VERSION } from '@/ai/knowledge/library';
import { getSource } from '@/ai/knowledge/sources';
import { EscalationCard } from '@/ui/EscalationCard';
import { Banner, Pill } from '@/ui/Feedback';
import { AppText } from '@/ui/Text';
import { RADIUS, SPACE, useTheme } from '@/ui/theme';

export function AnswerCard({ answer, emergencyNumber }: { answer: AssistantAnswer; emergencyNumber: string | null }) {
  const { c } = useTheme();
  const [openRef, setOpenRef] = useState<string | null>(null);
  return (
    <View style={{ gap: SPACE.md }}>
      {answer.escalation ? <EscalationCard result={answer.escalation} emergencyNumber={emergencyNumber} /> : null}
      {answer.refusal ? <Banner tone="warning" icon="hand-left-outline" title="I can’t help with that part" message={answer.refusal} /> : null}
      {answer.headline ? <AppText variant="bodyStrong">{answer.headline}</AppText> : null}

      {answer.generated ? (
        <View style={[styles.block, { backgroundColor: c.primarySoft }]} accessibilityLabel={`AI-generated explanation, created on this device: ${answer.generated.text}`}>
          <View style={styles.blockHead}>
            <Ionicons name="sparkles" size={16} color={c.primary} />
            <AppText variant="overline" tone="primary">
              Generated explanation · on this device
            </AppText>
          </View>
          <AppText variant="body">{answer.generated.text}</AppText>
          <AppText variant="caption" tone="subtle">
            {answer.generated.engineLabel}
            {answer.generated.tokensPerSecond ? ` · ${answer.generated.tokensPerSecond.toFixed(1)} tokens/s` : ''} · Checked against the facts below. May contain mistakes — verify with your records.
          </AppText>
        </View>
      ) : null}

      {answer.facts.length > 0 ? (
        <View style={[styles.block, { backgroundColor: c.surface, borderColor: c.border, borderWidth: StyleSheet.hairlineWidth }]}>
          <View style={styles.blockHead}>
            <Ionicons name="folder-open-outline" size={16} color={c.textMuted} />
            <AppText variant="overline" tone="muted">
              {answer.facts.some((f) => f.kind === 'question') ? 'Suggested from your records' : 'From your records'}
            </AppText>
          </View>
          {answer.facts.map((f) => (
            <View key={f.id} style={styles.fact}>
              <Ionicons
                name={f.kind === 'computed' ? 'calculator-outline' : f.kind === 'question' ? 'help-circle-outline' : 'document-text-outline'}
                size={18}
                color={c.textSubtle}
                accessibilityLabel={f.kind === 'computed' ? 'Calculated by the app' : f.kind === 'question' ? 'Suggested question' : 'Your recorded data'}
              />
              <View style={{ flex: 1 }}>
                <AppText variant="label">{f.label}</AppText>
                <AppText variant="body" tone="muted" selectable>
                  {f.text}
                </AppText>
              </View>
            </View>
          ))}
          <AppText variant="caption" tone="subtle">
            Numbers are calculated by FAITH from what you recorded — never by the AI model.
          </AppText>
        </View>
      ) : null}

      {answer.references.length > 0 ? (
        <View style={[styles.block, { backgroundColor: c.surfaceMuted }]}>
          <View style={styles.blockHead}>
            <Ionicons name="library-outline" size={16} color={c.info} />
            <AppText variant="overline" tone="info">
              Reference library
            </AppText>
          </View>
          {answer.references.map((a) => {
            const open = openRef === a.id;
            return (
              <View key={a.id} style={{ gap: SPACE.xs }}>
                <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpenRef(open ? null : a.id)} style={styles.refHead}>
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyStrong">{a.title}</AppText>
                    <AppText variant="body" tone="muted">
                      {a.summary}
                    </AppText>
                  </View>
                  <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={c.textSubtle} />
                </Pressable>
                {open ? (
                  <AppText variant="body" selectable>
                    {a.body}
                  </AppText>
                ) : null}
                <AppText variant="caption" tone="subtle">
                  Sources: {a.sourceIds.map((s) => {
                    const src = getSource(s);
                    return src ? `${src.title} (${src.publisher.split('(')[0].trim()}, ${src.year})` : s;
                  }).join('; ')}
                </AppText>
                <Pill label={`Draft — pending clinical review · library ${LIBRARY_VERSION}`} tone="warning" icon="shield-half-outline" />
              </View>
            );
          })}
        </View>
      ) : null}

      {answer.limitations.length > 0 ? (
        <View style={{ gap: 2 }}>
          {answer.limitations.map((l, i) => (
            <AppText key={i} variant="caption" tone="subtle">
              • {l}
            </AppText>
          ))}
        </View>
      ) : null}
      {answer.generationNote ? (
        <AppText variant="caption" tone="subtle">
          {answer.generationNote}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { borderRadius: RADIUS.lg, padding: SPACE.lg, gap: SPACE.md },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  fact: { flexDirection: 'row', gap: SPACE.sm, alignItems: 'flex-start' },
  refHead: { flexDirection: 'row', gap: SPACE.sm, alignItems: 'center', minHeight: 48 },
});
