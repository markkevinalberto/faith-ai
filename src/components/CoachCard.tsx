/**
 * "FAITH's note" on the saved screen after a reading or lab result: the computed position, the
 * previous result, and guideline tips, shown at once. If an on-device model is loaded (or the chosen
 * one can be loaded), FAITH also writes them as a short personal note, checked by the output guard.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { buildLabNote, buildReadingNote, writeCoachMessage, type CoachMessage, type CoachNote } from '@/ai/coach';
import { engineStore, useEngineState } from '@/ai/inference/engineStore';
import type { Biomarker } from '@/ai/knowledge/biomarkers';
import { listMedications } from '@/db/repo/medications';
import { SETTINGS, getSetting } from '@/db/repo/profiles';
import type { VitalReading } from '@/domain/types';
import { useApp, useProfile } from '@/state/AppState';
import { InlineLoading } from '@/ui/Feedback';
import { Illustration } from '@/ui/Illustration';
import { Card } from '@/ui/Layout';
import { AppText } from '@/ui/Text';
import { SPACE, useTheme } from '@/ui/theme';

export type CoachSubject = { kind: 'reading'; reading: VitalReading } | { kind: 'lab'; biomarker: Biomarker; value: number; unit: string; resultId: string | null };

export function CoachCard({ subject }: { subject: CoachSubject }) {
  const profile = useProfile();
  const { db, timeZone } = useApp();
  const { c } = useTheme();
  const engine = useEngineState();
  const [note, setNote] = useState<CoachNote | null | undefined>(undefined);
  const [activeModel, setActiveModel] = useState<string | null | undefined>(undefined);
  const [outcome, setOutcome] = useState<{ message: CoachMessage | null; problem: string | null } | null>(null);
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
      .then((r) => setOutcome({ message: r.message, problem: r.message ? null : 'The on-device draft did not pass FAITH’s safety checks, so the checked summary is shown instead.' }))
      .catch(() => setOutcome({ message: null, problem: 'The on-device model could not finish, so the checked summary is shown instead.' }));
  }, [note, ready, db, profile.id]);

  if (note === undefined) return <InlineLoading label="Preparing FAITH’s note…" />;
  if (note === null) return null;

  const message = outcome?.message ?? null;
  const writing = !outcome && (engine.status === 'loading' || !!ready);
  return (
    <Card style={{ gap: SPACE.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
        <Illustration name="mascot-thinking" height={60} />
        <View style={{ flex: 1 }}>
          <AppText variant="heading" accessibilityRole="header">
            FAITH’s note
          </AppText>
          <AppText variant="caption" tone="muted">
            {message ? `Written on this device by ${message.engineLabel.split(' · ')[0]}` : 'From your records, on this device'}
          </AppText>
        </View>
      </View>

      {/* The generated note always contains the checked position phrase (the guard requires it). */}
      <AppText variant="body">{message ? message.text : note.summary}</AppText>
      {note.details.map((d) => (
        <AppText key={d} variant="caption" tone="muted">
          {d}
        </AppText>
      ))}
      {writing ? <InlineLoading label={engine.status === 'loading' ? 'Loading the on-device model…' : 'Writing a personal note on this device…'} /> : null}
      {outcome?.problem ? (
        <AppText variant="caption" tone="subtle">
          {outcome.problem}
        </AppText>
      ) : null}

      <View style={{ gap: SPACE.sm }}>
        <AppText variant="label">Tips that can help</AppText>
        {note.tips.map((t) => (
          <View key={t.id} style={{ flexDirection: 'row', gap: SPACE.sm, alignItems: 'flex-start' }}>
            <Ionicons name="checkmark-circle" size={22} color={c.success} style={{ marginTop: 2 }} importantForAccessibility="no" />
            <AppText variant="body" style={{ flex: 1 }}>
              {t.text}
            </AppText>
          </View>
        ))}
      </View>

      <AppText variant="caption" tone="subtle">
        General tips, draft pending clinical review{note.sources.length ? `. Based on: ${note.sources.join('; ')}` : ''}. They don’t replace advice from your care team.
        {activeModel === null ? ' Install an on-device model in Settings → On-device AI and FAITH will also write these as a personal note.' : ''}
      </AppText>
    </Card>
  );
}
