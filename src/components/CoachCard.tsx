/**
 * FAITH's note on the saved screen after a reading or lab result, shown as the mascot speaking:
 * her note and tips in a speech bubble, then her follow-up questions one at a time with one-tap
 * answers. Everything shown is computed or curated; if an on-device model is loaded (or the chosen
 * one can be loaded) it rewrites the note in a warmer voice, checked by the output guard. Answers
 * are saved with the reading or result; red-flag answers bring up the safety card.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { buildLabNote, buildReadingNote, writeCoachMessage, type CoachMessage, type CoachNote } from '@/ai/coach';
import { engineStore, useEngineState } from '@/ai/inference/engineStore';
import type { Biomarker } from '@/ai/knowledge/biomarkers';
import type { CheckinAnswer, CheckinQuestion } from '@/ai/knowledge/checkins';
import { appendLabResultNote } from '@/db/repo/care';
import { listMedications } from '@/db/repo/medications';
import { SETTINGS, getSetting } from '@/db/repo/profiles';
import { appendReadingNote } from '@/db/repo/vitals';
import type { EscalationResult } from '@/domain/escalation';
import type { VitalReading } from '@/domain/types';
import { useApp, useProfile } from '@/state/AppState';
import { Button } from '@/ui/Button';
import { EscalationCard } from '@/ui/EscalationCard';
import { InlineLoading } from '@/ui/Feedback';
import { Illustration, type IllustrationName } from '@/ui/Illustration';
import { SpeechBubble } from '@/ui/SpeechBubble';
import { AppText } from '@/ui/Text';
import { SPACE, useTheme } from '@/ui/theme';

export type CoachSubject = { kind: 'reading'; reading: VitalReading } | { kind: 'lab'; biomarker: Biomarker; value: number; unit: string; resultId: string | null };

const POSE: Record<CoachNote['mood'], IllustrationName> = {
  good: 'mascot-celebrating',
  attention: 'mascot-encouragement',
  neutral: 'mascot-thinking',
};

function safetyCard(q: CheckinQuestion, a: CheckinAnswer): EscalationResult {
  return {
    level: a.urgency ?? 'urgent',
    ruleId: `checkin.${q.id}`,
    title: a.urgency === 'emergency' ? 'This may be an emergency' : 'Please contact your care team',
    message: a.reply,
    actions: [],
    sourceIds: a.sourceIds,
    reviewStatus: 'draft_pending_clinical_review',
  };
}

export function CoachCard({ subject }: { subject: CoachSubject }) {
  const profile = useProfile();
  const { db, timeZone } = useApp();
  const { c } = useTheme();
  const engine = useEngineState();
  const [note, setNote] = useState<CoachNote | null | undefined>(undefined);
  const [activeModel, setActiveModel] = useState<string | null | undefined>(undefined);
  const [outcome, setOutcome] = useState<{ message: CoachMessage | null; problem: string | null } | null>(null);
  const [answers, setAnswers] = useState<Record<string, { answer: CheckinAnswer; saved: boolean }>>({});
  const asked = useRef(false);

  useEffect(() => {
    let alive = true;
    const work = subject.kind === 'reading' ? buildReadingNote({ db, profile, reading: subject.reading, now: new Date(), timeZone }) : buildLabNote({ db, profile, ...subject });
    work.then((n) => alive && setNote(n)).catch(() => alive && setNote(null));
    return () => {
      alive = false;
    };
    // The subject is fixed for the life of the saved screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the model the person chose in Settings, as Ask FAITH does, so the note can be written.
  useEffect(() => {
    void getSetting(db, SETTINGS.activeModelId).then((id) => {
      setActiveModel(id);
      if (id && engineStore.get().status === 'none') void engineStore.loadById(id);
    });
  }, [db]);

  const ready = engine.status === 'ready' && engine.engine ? engine.engine : null;
  useEffect(() => {
    if (!note || !ready || asked.current) return;
    asked.current = true;
    listMedications(db, profile.id)
      .then((meds) => writeCoachMessage(note, ready, { medicationNames: meds.map((m) => m.medication.name) }))
      .then((r) => setOutcome({ message: r.message, problem: r.message ? null : 'My on-device draft did not pass the safety checks, so here is the checked summary.' }))
      .catch(() => setOutcome({ message: null, problem: 'The on-device model could not finish, so here is the checked summary.' }));
  }, [note, ready, db, profile.id]);

  const answer = (q: CheckinQuestion, a: CheckinAnswer) => {
    setAnswers((prev) => ({ ...prev, [q.id]: { answer: a, saved: false } }));
    const line = `FAITH check-in · ${a.note}`;
    const save =
      subject.kind === 'reading'
        ? subject.reading.id
          ? appendReadingNote(db, profile.id, subject.reading.id, line)
          : Promise.reject(new Error('no id'))
        : subject.resultId
          ? appendLabResultNote(db, profile.id, subject.resultId, line)
          : Promise.reject(new Error('no id'));
    save
      // Other screens pick the note up when they regain focus.
      .then(() => setAnswers((prev) => ({ ...prev, [q.id]: { answer: a, saved: true } })))
      .catch(() => undefined);
  };

  if (note === undefined) return <InlineLoading label="FAITH is looking at your result…" />;
  if (note === null) return null;

  const message = outcome?.message ?? null;
  const writing = !outcome && (engine.status === 'loading' || !!ready);
  // Questions are asked one at a time: every answered one, then the next.
  const firstOpen = note.questions.findIndex((q) => !answers[q.id]);
  const shown = firstOpen === -1 ? note.questions : note.questions.slice(0, firstOpen + 1);

  return (
    <View style={{ gap: SPACE.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: SPACE.md }}>
        <Illustration name={POSE[note.mood]} height={96} />
        <View style={{ flex: 1, paddingBottom: SPACE.xs }}>
          <AppText variant="heading" accessibilityRole="header">
            FAITH
          </AppText>
          <AppText variant="caption" tone="muted">
            {message ? `Your health assistant · written on this device by ${message.engineLabel.split(' · ')[0]}` : 'Your health assistant · on this device'}
          </AppText>
        </View>
      </View>

      <SpeechBubble>
        {/* A generated note always contains the checked position phrase (the guard requires it). */}
        <AppText variant="body">{message ? message.text : note.summary}</AppText>
        {writing ? <InlineLoading label={engine.status === 'loading' ? 'Getting my on-device model ready…' : 'Writing you a note on this device…'} /> : null}
        {note.tips.length ? (
          <View style={{ gap: SPACE.sm }}>
            <AppText variant="label" tone="primary">
              My tips for you
            </AppText>
            {note.tips.map((t) => (
              <View key={t.id} style={{ flexDirection: 'row', gap: SPACE.sm, alignItems: 'flex-start' }}>
                <Ionicons name="checkmark-circle" size={22} color={c.success} style={{ marginTop: 2 }} importantForAccessibility="no" />
                <AppText variant="body" style={{ flex: 1 }}>
                  {t.text}
                </AppText>
              </View>
            ))}
          </View>
        ) : null}
        {note.food ? (
          <View style={{ gap: SPACE.sm }}>
            <AppText variant="label" tone="primary">
              What to eat
            </AppText>
            <View style={{ flexDirection: 'row', gap: SPACE.sm, alignItems: 'flex-start' }}>
              <Ionicons name="restaurant" size={20} color={c.primary} style={{ marginTop: 3 }} importantForAccessibility="no" />
              <AppText variant="body" style={{ flex: 1 }}>
                {note.food.text}
              </AppText>
            </View>
          </View>
        ) : null}
      </SpeechBubble>

      {note.details.length || outcome?.problem ? (
        <View style={{ gap: SPACE.xs, paddingHorizontal: SPACE.xs }}>
          {note.details.map((d) => (
            <AppText key={d} variant="caption" tone="muted">
              {d}
            </AppText>
          ))}
          {outcome?.problem ? (
            <AppText variant="caption" tone="subtle">
              {outcome.problem}
            </AppText>
          ) : null}
        </View>
      ) : null}

      {shown.map((q) => {
        const a = answers[q.id];
        return (
          <View key={q.id} style={{ gap: SPACE.sm }}>
            <SpeechBubble>
              <AppText variant="bodyStrong">{q.text}</AppText>
              {!a ? (
                <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
                  {q.answers.map((opt) => (
                    <Button key={opt.id} title={opt.label} variant="secondary" size="lg" onPress={() => answer(q, opt)} style={{ flex: 1 }} accessibilityHint={`Answers: ${q.text}`} />
                  ))}
                </View>
              ) : null}
            </SpeechBubble>
            {a ? (
              <>
                <SpeechBubble from="person">
                  <AppText variant="bodyStrong" tone="onPrimary">
                    {a.answer.label}
                  </AppText>
                </SpeechBubble>
                {a.answer.urgency ? (
                  <EscalationCard result={safetyCard(q, a.answer)} emergencyNumber={profile.emergencyNumber} />
                ) : (
                  <SpeechBubble>
                    <AppText variant="body">{a.answer.reply}</AppText>
                  </SpeechBubble>
                )}
                {a.saved ? (
                  <AppText variant="caption" tone="subtle" style={{ paddingHorizontal: SPACE.xs }}>
                    Your answer is saved with this {subject.kind === 'reading' ? 'reading' : 'result'}.
                  </AppText>
                ) : null}
              </>
            ) : null}
          </View>
        );
      })}

      <AppText variant="caption" tone="subtle" style={{ paddingHorizontal: SPACE.xs }}>
        General tips, draft pending clinical review{note.sources.length ? `. Based on: ${note.sources.join('; ')}` : ''}. They don’t replace advice from your care team.
        {activeModel === null ? ' Install an on-device model in Settings → On-device AI and FAITH will also write these as a personal note.' : ''}
      </AppText>
    </View>
  );
}
