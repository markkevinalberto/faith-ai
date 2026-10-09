import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { DemoBanner, ProfileButton } from '@/components/AppChrome';
import { DoseItem } from '@/components/DoseItem';
import { applyDoseAction, countTakenSince, listEventsForLocalDate } from '@/db/repo/doseEvents';
import { listMedications, type MedicationWithSchedules } from '@/db/repo/medications';
import { averageDailyDoses, describeDays } from '@/domain/schedule';
import { estimateSupply } from '@/domain/supply';
import { formatLocalTime, localDateKey } from '@/domain/time';
import { useApp, useProfile } from '@/state/AppState';
import { useAction, useNow, useQuery } from '@/state/hooks';
import { IconButton } from '@/ui/Button';
import { EmptyState, InlineLoading, Pill } from '@/ui/Feedback';
import { Card, PageHeader, Screen, Section } from '@/ui/Layout';
import { AppText } from '@/ui/Text';
import { RADIUS, SPACE, useTheme } from '@/ui/theme';

interface MedRow extends MedicationWithSchedules {
  daysLeft: number | null;
}

export default function Medications() {
  const profile = useProfile();
  const { db, timeZone, locale } = useApp();
  const { c } = useTheme();
  const now = useNow(30_000);
  const run = useAction();
  const today = localDateKey(now, timeZone);

  const q = useQuery(
    async (d) => {
      const meds = await listMedications(d, profile.id);
      const rows: MedRow[] = [];
      for (const m of meds) {
        let daysLeft: number | null = null;
        const med = m.medication;
        if (med.refillSupplyCount !== null && med.refillUnitsPerDose && med.supplyUpdatedAt) {
          const taken = await countTakenSince(d, profile.id, med.id, med.supplyUpdatedAt);
          daysLeft = estimateSupply({ supplyCount: med.refillSupplyCount, unitsPerDose: med.refillUnitsPerDose, takenSinceUpdate: taken, averageDailyDoses: averageDailyDoses(m.schedules) })?.daysLeft ?? null;
        }
        rows.push({ ...m, daysLeft });
      }
      return { rows, events: await listEventsForLocalDate(d, profile.id, today) };
    },
    [profile.id, today],
  );

  const active = q.data?.rows.filter((r) => r.medication.status === 'active') ?? [];
  const inactive = q.data?.rows.filter((r) => r.medication.status !== 'active') ?? [];

  const renderMed = (r: MedRow) => {
    const m = r.medication;
    const schedule = m.asNeeded
      ? 'As needed'
      : r.schedules.length
        ? `${r.schedules.map((s) => formatLocalTime(s.timeOfDay, locale)).join(' · ')} — ${describeDays(r.schedules[0].daysOfWeek)}`
        : 'No schedule';
    return (
      <Card key={m.id} onPress={() => router.push({ pathname: '/medications/[id]', params: { id: m.id } })} accessibilityLabel={`${m.name} ${m.strength ?? ''}, ${schedule}`}>
        <View style={styles.row}>
          <View style={[styles.icon, { backgroundColor: m.status === 'active' ? c.primarySoft : c.surfaceMuted }]}>
            <Ionicons name={m.form === 'Injection' ? 'eyedrop-outline' : 'medical-outline'} size={22} color={m.status === 'active' ? c.primary : c.textSubtle} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="bodyStrong">
              {m.name}
              {m.strength ? <AppText variant="body" tone="muted">{`  ${m.strength}`}</AppText> : null}
            </AppText>
            <AppText variant="caption" tone="muted" numberOfLines={2}>
              {schedule}
            </AppText>
            {m.doseInstructions ? (
              <AppText variant="caption" tone="subtle" numberOfLines={2}>
                “{m.doseInstructions}”
              </AppText>
            ) : null}
            <View style={{ flexDirection: 'row', gap: SPACE.xs, flexWrap: 'wrap', marginTop: 2 }}>
              {m.status !== 'active' ? <Pill label={m.status === 'paused' ? 'Paused' : 'Stopped'} tone="neutral" /> : null}
              {r.daysLeft !== null ? <Pill label={`~${r.daysLeft} days supply`} tone={m.refillThresholdDays !== null && r.daysLeft <= m.refillThresholdDays ? 'warning' : 'neutral'} icon="bag-handle-outline" /> : null}
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={c.textSubtle} />
        </View>
      </Card>
    );
  };

  return (
    <Screen>
      <PageHeader
        title="Medications"
        subtitle="Exactly as prescribed — FAITH never changes your plan."
        right={
          <View style={{ flexDirection: 'row', gap: SPACE.xs }}>
            <IconButton icon="add" label="Add medication" tone="primary" filled onPress={() => router.push('/medications/edit')} />
            <ProfileButton />
          </View>
        }
      />
      <DemoBanner />
      {!q.data ? <InlineLoading /> : null}
      {q.data && q.data.rows.length === 0 ? (
        <EmptyState
          icon="medkit-outline"
          illustration="mascot-medication-reminder"
          title="No medications yet"
          message="Add each medicine with the strength and instructions from your prescription label. You’ll get a daily plan and reminders."
          action={{ label: 'Add medication', onPress: () => router.push('/medications/edit') }}
        />
      ) : null}
      {q.data && q.data.events.length > 0 ? (
        <Section title="Today">
          <Card padded={false} style={{ paddingHorizontal: SPACE.lg, paddingVertical: SPACE.xs }}>
            {q.data.events.map((e) => (
              <DoseItem key={e.id} event={e} now={now} locale={locale} onTake={() => void run(async () => void (await applyDoseAction(db, profile.id, e.id, { type: 'take', at: new Date().toISOString() })))} />
            ))}
          </Card>
        </Section>
      ) : null}
      {active.length > 0 ? <Section title={`Active (${active.length})`}>{active.map(renderMed)}</Section> : null}
      {inactive.length > 0 ? <Section title="Paused or stopped">{inactive.map(renderMed)}</Section> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  icon: { width: 44, height: 44, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
});
