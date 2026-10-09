import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { STATUS_ICON, STATUS_TONE, canTakeNow } from '@/components/DoseItem';
import { applyDoseAction, getDoseEvent } from '@/db/repo/doseEvents';
import { DOSE_STATUS_LABEL, effectiveStatus } from '@/domain/doseStatus';
import { formatDateTime, formatLocalDate, formatLocalTime } from '@/domain/time';
import { useApp, useProfile } from '@/state/AppState';
import { useAction, useNow, useQuery } from '@/state/hooks';
import { Button } from '@/ui/Button';
import { Banner, EmptyState, InlineLoading, Pill } from '@/ui/Feedback';
import { DateTimeField } from '@/ui/Fields';
import { Card, FormFooter, Screen } from '@/ui/Layout';
import { AppText } from '@/ui/Text';
import { SPACE } from '@/ui/theme';

export default function DoseSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const profile = useProfile();
  const { db, timeZone, locale } = useApp();
  const now = useNow(15_000);
  const run = useAction();
  const [earlier, setEarlier] = useState(false);
  const [takenAt, setTakenAt] = useState(() => new Date());

  const q = useQuery((d) => getDoseEvent(d, profile.id, id), [profile.id, id]);

  if (q.data === undefined) return <InlineLoading />;
  if (q.data === null) return <EmptyState icon="alert-circle-outline" title="Dose not found" message="It may belong to another profile or have been removed after a schedule change." />;
  const e = q.data;
  const status = effectiveStatus(e, now);
  const act = (fn: () => Promise<unknown>) =>
    run(async () => {
      await fn();
      router.back();
    }, { errorTitle: "Couldn't record dose" });

  const take = () => act(() => applyDoseAction(db, profile.id, e.id, { type: 'take', at: new Date().toISOString(), takenAt: earlier ? takenAt.toISOString() : undefined }));
  const snooze = (minutes: number) => act(() => applyDoseAction(db, profile.id, e.id, { type: 'snooze', at: new Date().toISOString(), minutes }));
  const skip = () => act(() => applyDoseAction(db, profile.id, e.id, { type: 'skip', at: new Date().toISOString() }));
  const undo = () => act(() => applyDoseAction(db, profile.id, e.id, { type: 'undo', at: new Date().toISOString() }));
  const open = status === 'upcoming' || status === 'snoozed' || status === 'unconfirmed';
  const canSnooze = (status === 'upcoming' || status === 'snoozed') && now.getTime() >= Date.parse(e.scheduledFor) - 60 * 60_000;

  return (
    <Screen
      edges={[]}
      footer={
        <FormFooter>
          {open && canTakeNow(e, now) ? <Button title={earlier ? 'Record as taken at that time' : 'I took it'} icon="checkmark-circle" size="lg" onPress={() => void take()} /> : null}
          {canSnooze ? (
            <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
              <Button title="Snooze 10 min" icon="alarm-outline" variant="secondary" onPress={() => void snooze(10)} style={{ flex: 1 }} />
              <Button title="30 min" variant="secondary" onPress={() => void snooze(30)} style={{ flex: 0.6 }} />
            </View>
          ) : null}
          {open ? <Button title="Skip this dose" icon="remove-circle-outline" variant="ghost" onPress={() => void skip()} /> : null}
          {!open ? <Button title="Undo" icon="arrow-undo-outline" variant="secondary" onPress={() => void undo()} /> : null}
        </FormFooter>
      }>
      <Stack.Screen options={{ title: 'Dose' }} />
      <View style={{ gap: SPACE.xs }}>
        <AppText variant="title">
          {e.medicationName}
          {e.strength ? ` ${e.strength}` : ''}
        </AppText>
        <AppText variant="body" tone="muted">
          {formatLocalDate(e.localDate, locale, { weekday: 'long', day: 'numeric', month: 'long' })} · {formatLocalTime(e.localTime, locale)}
          {e.doseLabel ? ` · ${e.doseLabel}` : ''}
        </AppText>
        <Pill label={DOSE_STATUS_LABEL[status]} tone={STATUS_TONE[status]} icon={STATUS_ICON[status]} />
        {e.takenAt ? (
          <AppText variant="caption" tone="subtle">
            Recorded as taken at {formatDateTime(e.takenAt, timeZone, locale, { hour: 'numeric', minute: '2-digit', weekday: 'short' })}
          </AppText>
        ) : null}
      </View>
      {e.doseInstructions ? (
        <Card tone="muted">
          <AppText variant="overline" tone="subtle">
            Your recorded instructions
          </AppText>
          <AppText variant="body" style={{ marginTop: SPACE.xs }}>
            “{e.doseInstructions}”
          </AppText>
        </Card>
      ) : null}
      {status === 'unconfirmed' ? (
        <Banner
          tone="warning"
          title="Not confirmed"
          message="Nothing was recorded for this dose. If you did take it, record it with the time. If you’re unsure, don’t take an extra dose to catch up — check the medicine leaflet or ask your pharmacist."
        />
      ) : null}
      {open && canTakeNow(e, now) ? (
        <Card padded={false} style={{ padding: SPACE.lg, gap: SPACE.md }}>
          <Button title={earlier ? 'Use the current time instead' : 'I took it at a different time'} variant="ghost" icon="time-outline" onPress={() => setEarlier(!earlier)} />
          {earlier ? <DateTimeField label="Time taken" value={takenAt} onChange={setTakenAt} mode="datetime" locale={locale} maximumDate={new Date()} /> : null}
        </Card>
      ) : null}
      {open && !canTakeNow(e, now) ? <Banner tone="info" message="This dose isn’t due yet. You can record it from about 4 hours before its scheduled time." /> : null}
    </Screen>
  );
}
