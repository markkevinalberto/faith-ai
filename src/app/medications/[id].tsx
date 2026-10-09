import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { DoseItem } from '@/components/DoseItem';
import { countTakenSince, listMedicationHistory, logUnscheduledDose, syncDoseEvents } from '@/db/repo/doseEvents';
import { deleteMedication, getMedication, setMedicationStatus, updateSupply } from '@/db/repo/medications';
import { DOSE_STATUS_LABEL } from '@/domain/doseStatus';
import { averageDailyDoses, describeDays } from '@/domain/schedule';
import { adherence } from '@/domain/stats';
import { estimateSupply } from '@/domain/supply';
import { formatDateTime, formatLocalDate, formatLocalTime } from '@/domain/time';
import { parseDecimal } from '@/domain/units';
import { useApp, useProfile } from '@/state/AppState';
import { useAction, useNow, useQuery } from '@/state/hooks';
import { Button, IconButton } from '@/ui/Button';
import { showAlert } from '@/ui/dialog';
import { Banner, EmptyState, InlineLoading, Pill } from '@/ui/Feedback';
import { TextField } from '@/ui/Fields';
import { Card, Divider, Screen, Section, Stat } from '@/ui/Layout';
import { AppText } from '@/ui/Text';
import { SPACE } from '@/ui/theme';

export default function MedicationDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const profile = useProfile();
  const { db, timeZone, locale } = useApp();
  const now = useNow(30_000);
  const run = useAction();
  const [count, setCount] = useState('');
  const [editingSupply, setEditingSupply] = useState(false);

  const q = useQuery(
    async (d) => {
      const med = await getMedication(d, profile.id, id);
      if (!med) return null;
      const history = await listMedicationHistory(d, profile.id, id, new Date(Date.now() + 86_400_000).toISOString(), 60);
      const m = med.medication;
      let supply = null;
      if (m.refillSupplyCount !== null && m.refillUnitsPerDose && m.supplyUpdatedAt) {
        const taken = await countTakenSince(d, profile.id, m.id, m.supplyUpdatedAt);
        supply = estimateSupply({ supplyCount: m.refillSupplyCount, unitsPerDose: m.refillUnitsPerDose, takenSinceUpdate: taken, averageDailyDoses: averageDailyDoses(med.schedules) });
      }
      return { ...med, history, supply };
    },
    [profile.id, id],
  );

  if (q.data === undefined) return <InlineLoading />;
  if (q.data === null) return <EmptyState icon="alert-circle-outline" title="Medication not found" message="It may have been deleted." />;
  const { medication: m, schedules, history, supply } = q.data;
  const past = history.filter((e) => Date.parse(e.scheduledFor) <= now.getTime());
  const week = adherence(past.filter((e) => now.getTime() - Date.parse(e.scheduledFor) <= 7 * 86_400_000).map((e) => e.status));
  const month = adherence(past.map((e) => e.status));

  const changeStatus = (status: 'active' | 'paused' | 'stopped') =>
    run(async () => {
      await setMedicationStatus(db, profile.id, m.id, status);
      await syncDoseEvents(db, profile.id, { now: new Date(), timeZone });
    });

  const confirmDelete = () =>
    showAlert('Delete medication?', `${m.name} and its dose history will be permanently deleted. To keep the history, mark it as stopped instead.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          void run(async () => {
            await deleteMedication(db, profile.id, m.id);
            router.back();
          }),
      },
    ]);

  const logPrn = () =>
    showAlert('Record a dose now?', `This records that you took ${m.name}${m.strength ? ` ${m.strength}` : ''} just now. It does not check whether a dose is appropriate — follow your instructions.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Record', onPress: () => void run(async () => void (await logUnscheduledDose(db, profile.id, m.id, new Date().toISOString(), timeZone))) },
    ]);

  const saveSupply = () =>
    run(async () => {
      const n = parseDecimal(count);
      if (n === null || n < 0) throw new Error('Enter how many units (tablets, doses…) you have now.');
      await updateSupply(db, profile.id, m.id, n);
      setEditingSupply(false);
      setCount('');
    });

  return (
    <Screen edges={[]}>
      <Stack.Screen
        options={{
          title: m.name,
          headerRight: () => <IconButton icon="create-outline" label="Edit medication" onPress={() => router.push({ pathname: '/medications/edit', params: { id: m.id } })} />,
        }}
      />
      <View style={{ gap: SPACE.xs }}>
        <AppText variant="title">
          {m.name}
          {m.strength ? ` ${m.strength}` : ''}
        </AppText>
        <View style={{ flexDirection: 'row', gap: SPACE.xs, flexWrap: 'wrap' }}>
          {m.form ? <Pill label={m.form} /> : null}
          <Pill label={m.status === 'active' ? 'Active' : m.status === 'paused' ? 'Paused' : 'Stopped'} tone={m.status === 'active' ? 'success' : 'neutral'} />
          {m.asNeeded ? <Pill label="As needed" tone="info" /> : null}
        </View>
      </View>

      <Card>
        <AppText variant="overline" tone="subtle">
          Instructions you recorded
        </AppText>
        <AppText variant="body" style={{ marginTop: SPACE.xs }} selectable>
          {m.doseInstructions ? `“${m.doseInstructions}”` : 'No instructions recorded. Copy them from your prescription label.'}
        </AppText>
        <Divider />
        <AppText variant="caption" tone="muted">
          {m.prescriber ? `Prescriber: ${m.prescriber} · ` : ''}Started {formatLocalDate(m.startDate, locale)}
          {m.endDate ? ` · Ends ${formatLocalDate(m.endDate, locale)}` : ''}
        </AppText>
        {m.notes ? (
          <AppText variant="caption" tone="muted" style={{ marginTop: SPACE.xs }}>
            Notes: {m.notes}
          </AppText>
        ) : null}
      </Card>

      <Banner tone="info" icon="shield-checkmark-outline" message="FAITH never changes doses or advises catching up on missed doses. Ask your clinician or pharmacist before changing how you take this medicine." />

      <Section title="Schedule">
        <Card>
          {m.asNeeded ? (
            <View style={{ gap: SPACE.md }}>
              <AppText variant="body">Taken as needed — no scheduled reminders.</AppText>
              <Button title="Record a dose taken now" icon="add-circle-outline" variant="soft" onPress={logPrn} />
            </View>
          ) : schedules.length ? (
            <View style={{ gap: SPACE.xs }}>
              {schedules.map((s) => (
                <AppText key={s.id} variant="body">
                  {formatLocalTime(s.timeOfDay, locale)} · {describeDays(s.daysOfWeek)}
                  {s.doseLabel ? ` · ${s.doseLabel}` : ''}
                </AppText>
              ))}
              <AppText variant="caption" tone="subtle">
                Times follow your phone’s current time zone ({timeZone}).
              </AppText>
            </View>
          ) : (
            <AppText variant="body" tone="muted">
              No times set.
            </AppText>
          )}
        </Card>
      </Section>

      {!m.asNeeded ? (
        <Section title="How it’s going">
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Stat label="Last 7 days" value={week.takenPct === null ? '—' : `${week.takenPct}%`} caption={week.resolved ? `${week.taken} of ${week.resolved} taken` : 'No past doses yet'} />
              <Stat label="Recent history" value={month.takenPct === null ? '—' : `${month.takenPct}%`} caption={month.resolved ? `${month.skipped} skipped · ${month.unconfirmed} not confirmed` : undefined} />
            </View>
          </Card>
        </Section>
      ) : null}

      <Section title="Supply">
        <Card style={{ gap: SPACE.md }}>
          {supply ? (
            <AppText variant="body">
              About {Math.floor(supply.remainingUnits)} left{supply.daysLeft !== null ? ` — roughly ${supply.daysLeft} days at your schedule` : ''}.
            </AppText>
          ) : (
            <AppText variant="body" tone="muted">
              Add how many units you have to get refill reminders.
            </AppText>
          )}
          {m.supplyUpdatedAt ? (
            <AppText variant="caption" tone="subtle">
              Estimated from your count on {formatDateTime(m.supplyUpdatedAt, timeZone, locale, { dateStyle: 'medium' })} minus doses you marked as taken.
            </AppText>
          ) : null}
          {editingSupply ? (
            <>
              <TextField label="How many do you have now?" value={count} onChangeText={setCount} keyboardType="decimal-pad" autoFocus />
              <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
                <Button title="Cancel" variant="ghost" onPress={() => setEditingSupply(false)} style={{ flex: 1 }} />
                <Button title="Save count" icon="checkmark" onPress={() => void saveSupply()} style={{ flex: 1 }} />
              </View>
            </>
          ) : (
            <Button title="Update count (e.g. after a refill)" icon="bag-add-outline" variant="secondary" onPress={() => setEditingSupply(true)} />
          )}
        </Card>
      </Section>

      <Section title="Dose history">
        {past.length === 0 ? (
          <AppText variant="body" tone="muted">
            No doses recorded yet.
          </AppText>
        ) : (
          <Card padded={false} style={{ paddingHorizontal: SPACE.lg, paddingVertical: SPACE.xs }}>
            {past.slice(0, 30).map((e) => (
              <View key={e.id}>
                <AppText variant="caption" tone="subtle" style={{ marginTop: SPACE.sm }}>
                  {formatLocalDate(e.localDate, locale, { weekday: 'short', day: 'numeric', month: 'short' })}
                  {e.takenAt ? ` · taken ${formatDateTime(e.takenAt, timeZone, locale, { hour: 'numeric', minute: '2-digit' })}` : ''}
                </AppText>
                <DoseItem event={e} now={now} locale={locale} />
              </View>
            ))}
          </Card>
        )}
        <AppText variant="caption" tone="subtle">
          Statuses: {Object.values(DOSE_STATUS_LABEL).join(' · ')}. “Not confirmed” means nothing was recorded — FAITH never assumes a dose was taken.
        </AppText>
      </Section>

      <View style={{ gap: SPACE.sm }}>
        {m.status === 'active' ? <Button title="Pause medication" icon="pause-circle-outline" variant="secondary" onPress={() => void changeStatus('paused')} /> : <Button title="Resume medication" icon="play-circle-outline" variant="secondary" onPress={() => void changeStatus('active')} />}
        {m.status !== 'stopped' ? <Button title="Mark as stopped (keep history)" icon="stop-circle-outline" variant="ghost" onPress={() => void changeStatus('stopped')} /> : null}
        <Button title="Delete medication" icon="trash-outline" variant="danger" onPress={confirmDelete} />
      </View>
    </Screen>
  );
}
