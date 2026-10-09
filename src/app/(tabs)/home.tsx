import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { DemoBanner, ProfileButton, greeting } from '@/components/AppChrome';
import { DateBadge } from '@/components/CareItems';
import { DoseItem, canTakeNow } from '@/components/DoseItem';
import { listLabTests, listUpcomingAppointments } from '@/db/repo/care';
import { applyDoseAction, countTakenSince, listEventsForLocalDate, nextPendingDose } from '@/db/repo/doseEvents';
import { listMedications } from '@/db/repo/medications';
import { listTargets } from '@/db/repo/profiles';
import { latestReadings } from '@/db/repo/vitals';
import { mostSevere } from '@/domain/escalation';
import { effectiveStatus } from '@/domain/doseStatus';
import { averageDailyDoses } from '@/domain/schedule';
import { estimateSupply } from '@/domain/supply';
import { formatDateTime, formatLocalTime, localDateKey, relativeFromNow } from '@/domain/time';
import { getNotificationPermission, openSystemSettings, requestNotificationPermission } from '@/services/notifications';
import { useApp, useProfile } from '@/state/AppState';
import { useAction, useNow, useQuery } from '@/state/hooks';
import { Button } from '@/ui/Button';
import { EscalationCard } from '@/ui/EscalationCard';
import { Banner, EmptyState, InlineLoading, Pill } from '@/ui/Feedback';
import { Illustration } from '@/ui/Illustration';
import { Card, PageHeader, Screen, Section } from '@/ui/Layout';
import { AppText } from '@/ui/Text';
import { useTextSize } from '@/ui/textSize';
import { RADIUS, SPACE, useTheme } from '@/ui/theme';
import { VITAL_META, assessReading, positionPill, readingDisplay, type BuiltInVital } from '@/ui/vitals';

const HOME_VITALS: BuiltInVital[] = ['glucose', 'blood_pressure', 'weight', 'pulse', 'spo2', 'temperature'];
const ASK_CHIPS = ['Summarize my glucose this week', 'How do I take my medications?', 'Prepare questions for my next appointment'];

export default function Home() {
  const profile = useProfile();
  const { db, timeZone, locale, notifyChanged } = useApp();
  const { c } = useTheme();
  // At Large/Extra large text the two-column reading tiles get too narrow; stack them instead.
  const oneColumn = useTextSize().scale > 1;
  const now = useNow(30_000);
  const run = useAction();
  const today = localDateKey(now, timeZone);

  const q = useQuery(
    async (db) => {
      const nowIso = new Date().toISOString();
      const events = await listEventsForLocalDate(db, profile.id, today);
      const next = await nextPendingDose(db, profile.id, nowIso);
      const latest = await latestReadings(db, profile.id);
      const targets = await listTargets(db, profile.id);
      const appts = await listUpcomingAppointments(db, profile.id, nowIso, 2);
      const labs = (await listLabTests(db, profile.id)).filter((t) => t.status === 'scheduled' && t.scheduledAt && t.scheduledAt >= nowIso).slice(0, 2);
      const meds = await listMedications(db, profile.id);
      const lowSupply: { id: string; name: string; daysLeft: number }[] = [];
      for (const { medication: m, schedules } of meds) {
        if (m.status !== 'active' || m.refillSupplyCount === null || !m.refillUnitsPerDose || !m.supplyUpdatedAt || m.refillThresholdDays === null) continue;
        const taken = await countTakenSince(db, profile.id, m.id, m.supplyUpdatedAt);
        const est = estimateSupply({ supplyCount: m.refillSupplyCount, unitsPerDose: m.refillUnitsPerDose, takenSinceUpdate: taken, averageDailyDoses: averageDailyDoses(schedules) });
        if (est?.daysLeft !== null && est !== null && est.daysLeft <= m.refillThresholdDays) lowSupply.push({ id: m.id, name: m.name, daysLeft: est.daysLeft });
      }
      const permission = Platform.OS === 'web' ? 'granted' : await getNotificationPermission().catch(() => 'denied' as const);
      return { events, next, latest, targets, appts, labs, activeMeds: meds.filter((m) => m.medication.status === 'active' && !m.medication.asNeeded).length, lowSupply, permission };
    },
    [profile.id, today],
  );

  const data = q.data;
  const recent = data?.latest.filter((r) => now.getTime() - Date.parse(r.measuredAt) < 24 * 3_600_000) ?? [];
  const alert = mostSevere(recent.map((r) => assessReading(r, data?.targets ?? [], profile.emergencyNumber).escalation));
  const resolved = data?.events.filter((e) => ['taken', 'skipped'].includes(effectiveStatus(e, now))).length ?? 0;
  const total = data?.events.length ?? 0;

  const take = (id: string) =>
    run(async () => {
      await applyDoseAction(db, profile.id, id, { type: 'take', at: new Date().toISOString() });
    });

  const enableReminders = async () => {
    const p = await requestNotificationPermission();
    if (p !== 'granted') openSystemSettings();
    notifyChanged();
  };

  const next = data?.next ?? null;
  const nextTime = next ? (next.status === 'snoozed' && next.snoozedUntil ? next.snoozedUntil : next.scheduledFor) : null;

  return (
    <Screen>
      <PageHeader
        eyebrow={formatDateTime(now.toISOString(), timeZone, locale, { weekday: 'long', day: 'numeric', month: 'long' })}
        title={`${greeting(now)}, ${profile.displayName.split(/[\s(]/)[0]}`}
        right={<ProfileButton />}
      />
      <DemoBanner />
      {alert ? <EscalationCard result={alert} emergencyNumber={profile.emergencyNumber} /> : null}

      {!data && q.loading ? <InlineLoading label="Loading today’s plan…" /> : null}

      {data ? (
        <>
          {/* Next action */}
          {next && nextTime ? (
            <Card tone="hero">
              <AppText variant="overline" tone="heroMuted">
                Next dose · {relativeFromNow(nextTime, now)}
              </AppText>
              <AppText variant="title" tone="hero" style={{ marginTop: SPACE.xs }}>
                {next.medicationName}
                {next.strength ? ` ${next.strength}` : ''}
              </AppText>
              <AppText variant="body" tone="heroMuted">
                {formatLocalTime(next.localTime, locale)}
                {next.localDate !== today ? ' tomorrow' : ''}
                {next.doseLabel ? ` · ${next.doseLabel}` : ''}
              </AppText>
              {next.doseInstructions ? (
                <AppText variant="caption" tone="heroMuted" style={{ marginTop: SPACE.xs }}>
                  “{next.doseInstructions}”
                </AppText>
              ) : null}
              <View style={styles.heroActions}>
                {canTakeNow(next, now) ? <Button title="I took it" icon="checkmark" variant="secondary" onPress={() => void take(next.id)} style={{ flex: 1 }} /> : null}
                <Button title="Details" icon="ellipsis-horizontal" variant="onHero" onPress={() => router.push({ pathname: '/dose/[id]', params: { id: next.id } })} style={{ flex: 1 }} />
              </View>
            </Card>
          ) : data.activeMeds > 0 ? (
            <Card style={styles.caughtUp}>
              <Illustration name="mascot-celebrating" height={96} />
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="heading">All caught up</AppText>
                <AppText variant="caption" tone="muted">
                  No more doses scheduled for now. Nice work keeping your record up to date.
                </AppText>
              </View>
            </Card>
          ) : null}

          {data.activeMeds > 0 && data.permission !== 'granted' && !profile.isDemo ? (
            <Banner
              tone="warning"
              title="Reminders are off"
              message="Allow notifications so FAITH can remind you about doses, refills and appointments."
              action={<Button title="Turn on reminders" size="sm" icon="notifications-outline" onPress={() => void enableReminders()} />}
            />
          ) : null}

          {data.lowSupply.map((m) => (
            <Banner
              key={m.id}
              tone="info"
              icon="bag-handle-outline"
              title={m.daysLeft <= 0 ? `${m.name} may have run out` : `${m.name}: about ${m.daysLeft} day${m.daysLeft === 1 ? '' : 's'} left`}
              message="Based on your recorded count and the doses marked taken. Ask your pharmacy about a refill, then update the count."
              action={<Button title="Update count" size="sm" variant="secondary" onPress={() => router.push({ pathname: '/medications/[id]', params: { id: m.id } })} />}
            />
          ))}

          {/* Today's plan */}
          <Section title="Today’s doses" action={total > 0 ? { label: 'All medications', onPress: () => router.push('/medications') } : undefined}>
            {total === 0 ? (
              <EmptyState
                icon="medkit-outline"
                illustration="onboard-add-medication"
                title="No doses scheduled today"
                message="Add your medications with their prescribed times to get a daily plan and reminders."
                action={{ label: 'Add medication', onPress: () => router.push('/medications/edit') }}
              />
            ) : (
              <Card padded={false} style={{ paddingHorizontal: SPACE.lg, paddingVertical: SPACE.sm }}>
                <View style={styles.progressRow}>
                  <AppText variant="label" tone="muted">
                    {resolved} of {total} recorded
                  </AppText>
                  <View style={[styles.track, { backgroundColor: c.surfaceMuted }]}>
                    <View style={[styles.fill, { backgroundColor: c.primary, width: `${total ? Math.round((resolved / total) * 100) : 0}%` }]} />
                  </View>
                </View>
                {data.events.map((e) => (
                  <DoseItem key={e.id} event={e} now={now} locale={locale} onTake={() => void take(e.id)} />
                ))}
              </Card>
            )}
          </Section>

          {/* Latest readings */}
          <Section title="Latest readings" action={{ label: 'Add reading', icon: 'add', onPress: () => router.push('/vitals/new') }}>
            {data.latest.filter((r) => r.type !== 'custom').length === 0 ? (
              <EmptyState icon="pulse-outline" illustration="onboard-record-glucose" title="No readings yet" message="Log glucose, blood pressure, weight and more. Charts and summaries appear here." action={{ label: 'Add reading', onPress: () => router.push('/vitals/new') }} />
            ) : (
              <View style={styles.grid}>
                {HOME_VITALS.map((type) => {
                  const r = data.latest.find((x) => x.type === type);
                  if (!r) return null;
                  const meta = VITAL_META[type];
                  const disp = readingDisplay(r, profile);
                  const a = assessReading(r, data.targets, profile.emergencyNumber);
                  const pill = positionPill(a.position, a.target);
                  return (
                    <Pressable
                      key={type}
                      accessibilityRole="button"
                      accessibilityLabel={`${meta.label}: ${disp.value} ${disp.unit}, ${relativeFromNow(r.measuredAt, now)}${pill ? `, ${pill.label}` : ''}`}
                      onPress={() => router.push({ pathname: '/vitals/[type]', params: { type } })}
                      style={({ pressed }) => [styles.tile, oneColumn && { flexBasis: '100%' }, { backgroundColor: c.surface, borderColor: c.border, opacity: pressed ? 0.9 : 1 }]}>
                      <View style={styles.tileHead}>
                        <Ionicons name={meta.icon} size={18} color={c.primary} />
                        <AppText variant="label" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
                          {meta.short}
                        </AppText>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                        <AppText variant="metricSmall">{disp.value}</AppText>
                        <AppText variant="caption" tone="muted">
                          {disp.unit}
                        </AppText>
                      </View>
                      <AppText variant="caption" tone="subtle">
                        {relativeFromNow(r.measuredAt, now)}
                      </AppText>
                      {pill ? <Pill label={pill.label} tone={pill.tone} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </Section>

          {/* Coming up */}
          {data.appts.length + data.labs.length > 0 ? (
            <Section title="Coming up" action={{ label: 'Care plan', onPress: () => router.push('/care') }}>
              <Card padded={false} style={{ paddingHorizontal: SPACE.lg, paddingVertical: SPACE.xs }}>
                {[...data.appts.map((a) => ({ kind: 'appt' as const, id: a.id, at: a.startsAt, title: a.title, sub: a.clinician ?? a.location ?? '' })), ...data.labs.map((t) => ({ kind: 'lab' as const, id: t.id, at: t.scheduledAt as string, title: `Lab: ${t.name}`, sub: t.fastingRequired ? 'Fasting noted — see preparation' : t.location ?? '' }))]
                  .sort((a, b) => (a.at < b.at ? -1 : 1))
                  .map((item) => (
                    <Pressable
                      key={item.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${item.title}, ${formatDateTime(item.at, timeZone, locale)}`}
                      onPress={() => router.push({ pathname: item.kind === 'appt' ? '/care/appointment/[id]' : '/care/lab/[id]', params: { id: item.id } })}
                      style={styles.upcoming}>
                      <DateBadge iso={item.at} timeZone={timeZone} locale={locale} />
                      <View style={{ flex: 1 }}>
                        <AppText variant="bodyStrong" numberOfLines={3}>
                          {item.title}
                        </AppText>
                        <AppText variant="caption" tone="muted">
                          {formatDateTime(item.at, timeZone, locale, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
                          {item.sub ? ` · ${item.sub}` : ''}
                        </AppText>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={c.textSubtle} />
                    </Pressable>
                  ))}
              </Card>
            </Section>
          ) : null}

          {/* Assistant entry */}
          <Card style={{ gap: SPACE.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
              <Illustration name="mascot-thinking" height={72} />
              <View style={{ flex: 1 }}>
                <AppText variant="heading">Ask FAITH</AppText>
                <AppText variant="caption" tone="muted">
                  Answers from your own records, computed and explained on this phone.
                </AppText>
              </View>
            </View>
            <View style={{ gap: SPACE.sm }}>
              {ASK_CHIPS.map((text) => (
                <Pressable
                  key={text}
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/ask', params: { q: text } })}
                  style={({ pressed }) => [styles.askChip, { borderColor: c.border, backgroundColor: pressed ? c.surfaceMuted : c.surface }]}>
                  <AppText variant="body" style={{ flex: 1 }}>
                    {text}
                  </AppText>
                  <Ionicons name="arrow-forward" size={18} color={c.primary} />
                </Pressable>
              ))}
            </View>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroActions: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.lg },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingVertical: SPACE.sm },
  track: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md },
  tile: { flexBasis: '47%', flexGrow: 1, borderRadius: RADIUS.lg, borderWidth: StyleSheet.hairlineWidth, padding: SPACE.lg, gap: 4, minHeight: 120 },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  upcoming: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: 72, paddingVertical: SPACE.sm },
  caughtUp: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  askChip: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, minHeight: 48, paddingHorizontal: SPACE.md, borderRadius: RADIUS.md, borderWidth: 1 },
});
