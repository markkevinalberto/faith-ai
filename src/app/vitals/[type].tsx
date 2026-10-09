import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { listTargets } from '@/db/repo/profiles';
import { listCustomTypes, listReadings } from '@/db/repo/vitals';
import { mostSevere } from '@/domain/escalation';
import { dailyAggregates, linearTrend, mean, rangeWindow, summarize, type ChartRange } from '@/domain/stats';
import { formatTargetRange, glucoseMetricForContext, resolveTarget, type ResolvedTarget } from '@/domain/targets';
import { formatDateTime } from '@/domain/time';
import type { VitalType } from '@/domain/types';
import { useApp, useProfile } from '@/state/AppState';
import { useNow, useQuery } from '@/state/hooks';
import { IconButton } from '@/ui/Button';
import { EscalationCard } from '@/ui/EscalationCard';
import { EmptyState, InlineLoading, Pill } from '@/ui/Feedback';
import { ChipSelect, SegmentedControl } from '@/ui/Fields';
import { Card, Screen, Section, Stat } from '@/ui/Layout';
import { AppText } from '@/ui/Text';
import { TimeChart, type ChartPoint } from '@/ui/TimeChart';
import { SPACE, useTheme } from '@/ui/theme';
import { GLUCOSE_CONTEXT_OPTIONS, VITAL_META, assessReading, contextLabel, displayUnit, formatDisplay, positionPill, readingDisplay, toDisplay, type BuiltInVital } from '@/ui/vitals';

const TREND_THRESHOLD: Record<string, number> = { glucose: 10, blood_pressure: 5, weight: 1, pulse: 5, spo2: 2, temperature: 0.5, custom: 0 };

export default function VitalDetail() {
  const { type: typeParam, customId } = useLocalSearchParams<{ type: string; customId?: string }>();
  const type = typeParam as VitalType;
  const profile = useProfile();
  const { timeZone, locale } = useApp();
  const { c } = useTheme();
  const now = useNow();
  const [range, setRange] = useState<ChartRange>('week');
  const [contexts, setContexts] = useState<string[]>([]);
  const win = rangeWindow(range, now, timeZone);

  const q = useQuery(
    async (d) => ({
      readings: await listReadings(d, profile.id, { type, customTypeId: customId, fromIso: new Date(win.start).toISOString(), toIso: new Date(win.end).toISOString(), order: 'asc' }),
      targets: await listTargets(d, profile.id),
      custom: customId ? ((await listCustomTypes(d, profile.id)).find((t) => t.id === customId) ?? null) : null,
    }),
    [profile.id, type, customId, range, win.start],
  );

  const builtIn = type === 'custom' ? null : (type as BuiltInVital);
  const title = builtIn ? VITAL_META[builtIn].label : (q.data?.custom?.name ?? 'Measurement');
  const unit = builtIn ? displayUnit(builtIn, profile) : (q.data?.custom?.unit ?? '');
  const decimals = q.data?.custom?.decimals;
  const all = q.data?.readings ?? [];
  const readings = type === 'glucose' && contexts.length > 0 ? all.filter((r) => r.context && contexts.includes(r.context)) : all;

  // Chart data (display units). Long ranges use daily averages so the chart stays readable.
  const aggregate = (range === 'month' || range === 'year') && readings.length > 60;
  let points: ChartPoint[] = [];
  if (type === 'blood_pressure') {
    if (aggregate) {
      const sys = dailyAggregates(readings.map((r) => ({ t: Date.parse(r.measuredAt), v: r.systolic as number })), timeZone);
      const dia = new Map(dailyAggregates(readings.map((r) => ({ t: Date.parse(r.measuredAt), v: r.diastolic as number })), timeZone).map((a) => [a.date, a.mean]));
      points = sys.map((a) => ({ t: a.t, v: a.mean, v2: dia.get(a.date) }));
    } else points = readings.map((r) => ({ t: Date.parse(r.measuredAt), v: r.systolic as number, v2: r.diastolic as number }));
  } else {
    const raw = readings.map((r) => ({ t: Date.parse(r.measuredAt), v: type === 'custom' ? (r.value as number) : toDisplay(type, r.valueCanonical as number, profile) }));
    points = aggregate ? dailyAggregates(raw, timeZone).map((a) => ({ t: a.t, v: a.mean })) : raw;
  }

  // Target band (only when a single, well-defined target applies).
  let target: ResolvedTarget | null = null;
  if (type === 'glucose' && contexts.length === 1) {
    const metric = glucoseMetricForContext(contexts[0]);
    target = metric ? resolveTarget(metric, q.data?.targets ?? []) : null;
  } else if (type === 'pulse' || type === 'spo2') {
    target = resolveTarget(type, q.data?.targets ?? []);
  }
  const band = target ? { low: target.low === null ? null : toDisplay(type, target.low, profile), high: target.high === null ? null : toDisplay(type, target.high, profile) } : null;
  const bpTargetS = type === 'blood_pressure' ? resolveTarget('bp_systolic', q.data?.targets ?? []) : null;
  const bpTargetD = type === 'blood_pressure' ? resolveTarget('bp_diastolic', q.data?.targets ?? []) : null;

  const fmt = (v: number) => (type === 'custom' ? formatDisplay('custom', v, profile, decimals) : formatDisplay(type, v, profile));
  const s = summarize(points.map((p) => ({ t: p.t, v: p.v })));
  const trend = linearTrend(
    readings.map((r) => ({ t: Date.parse(r.measuredAt), v: type === 'blood_pressure' ? (r.systolic as number) : type === 'custom' ? (r.value as number) : (r.valueCanonical as number) })),
    { stableThreshold: TREND_THRESHOLD[type] || 1 },
  );
  const latestAlert = mostSevere(all.slice(-1).map((r) => assessReading(r, q.data?.targets ?? [], profile.emergencyNumber).escalation));
  const summary = readings.length
    ? `${title}: ${readings.length} readings in this period. Average ${type === 'blood_pressure' ? `${Math.round(mean(readings.map((r) => r.systolic as number)) as number)}/${Math.round(mean(readings.map((r) => r.diastolic as number)) as number)}` : fmt(s.mean as number)} ${unit}.`
    : `${title}: no readings in this period.`;

  return (
    <Screen edges={[]}>
      <Stack.Screen
        options={{
          title,
          headerRight: () => (
            <IconButton icon="add" label={`Add ${title} reading`} tone="primary" onPress={() => router.push({ pathname: '/vitals/new', params: { type, ...(customId ? { customId } : {}) } })} />
          ),
        }}
      />
      {latestAlert && now.getTime() - Date.parse(all[all.length - 1].measuredAt) < 48 * 3_600_000 ? <EscalationCard result={latestAlert} emergencyNumber={profile.emergencyNumber} /> : null}
      <SegmentedControl
        options={[
          { value: 'day', label: 'Day' },
          { value: 'week', label: 'Week' },
          { value: 'month', label: 'Month' },
          { value: 'year', label: 'Year' },
        ]}
        value={range}
        onChange={setRange}
        label="Period"
      />
      {type === 'glucose' ? (
        <ChipSelect
          options={GLUCOSE_CONTEXT_OPTIONS.filter((o) => o.value !== 'overnight')}
          selected={contexts}
          onToggle={(v) => setContexts((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]))}
          helper={contexts.length === 1 ? undefined : 'Pick one context (e.g. Fasting) to show its target band.'}
        />
      ) : null}

      <Card>
        <View style={styles.chartHead}>
          <AppText variant="label" tone="muted">
            {aggregate ? 'Daily averages' : 'Readings'} · {unit}
          </AppText>
          <AppText variant="caption" tone="subtle">
            {formatDateTime(new Date(win.start).toISOString(), timeZone, locale, { day: 'numeric', month: 'short' })} – {formatDateTime(new Date(win.end - 1).toISOString(), timeZone, locale, { day: 'numeric', month: 'short' })}
          </AppText>
        </View>
        {q.loading && !q.data ? (
          <InlineLoading />
        ) : (
          <TimeChart
            points={points}
            range={range}
            window={win}
            timeZone={timeZone}
            locale={locale}
            band={band}
            formatY={fmt}
            accessibilitySummary={summary}
            seriesLabels={type === 'blood_pressure' ? ['Systolic', 'Diastolic'] : undefined}
          />
        )}
        {target ? (
          <AppText variant="caption" tone="subtle" style={{ marginTop: SPACE.sm }}>
            Shaded band: {target.source === 'clinician' ? 'your clinician-set target' : 'general reference range (not personalised)'}{' '}
            {formatTargetRange(band?.low !== null && band?.low !== undefined ? Number(fmt(band.low)) : null, band?.high !== null && band?.high !== undefined ? Number(fmt(band.high)) : null, unit)} — {target.sourceLabel}
            {target.source === 'reference' ? ' · Draft, pending clinical review' : ''}
          </AppText>
        ) : null}
        {bpTargetS && bpTargetD ? (
          <AppText variant="caption" tone="subtle" style={{ marginTop: SPACE.sm }}>
            Target: below {bpTargetS.high}/{bpTargetD.high} mmHg — {bpTargetS.source === 'clinician' ? bpTargetS.sourceLabel : `general reference (not personalised): ${bpTargetS.sourceLabel}`}
          </AppText>
        ) : null}
      </Card>

      {readings.length > 0 ? (
        <Card>
          <View style={styles.stats}>
            {type === 'blood_pressure' ? (
              <>
                <Stat label="Average" value={`${Math.round(mean(readings.map((r) => r.systolic as number)) as number)}/${Math.round(mean(readings.map((r) => r.diastolic as number)) as number)}`} unit="mmHg" />
                <Stat label="Highest" value={`${Math.max(...readings.map((r) => r.systolic as number))}`} unit="sys" />
              </>
            ) : (
              <>
                <Stat label="Average" value={fmt(s.mean as number)} unit={unit} />
                <Stat label="Range" value={`${fmt(s.min as number)}–${fmt(s.max as number)}`} />
              </>
            )}
            <Stat label="Readings" value={String(readings.length)} />
          </View>
          <AppText variant="caption" tone="muted" style={{ marginTop: SPACE.md }}>
            {trend.direction === 'insufficient_data'
              ? 'Trend: not enough readings across enough days yet.'
              : trend.direction === 'stable'
                ? 'Trend: no clear upward or downward change in this period.'
                : `Trend: ${trend.direction === 'rising' ? 'upward' : 'downward'} over ${Math.round(trend.spanDays as number)} days (straight-line fit; discuss changes with your clinician).`}
          </AppText>
        </Card>
      ) : null}

      <Section title="History">
        {readings.length === 0 ? (
          <EmptyState
            icon={builtIn ? VITAL_META[builtIn].icon : 'analytics-outline'}
            illustration="mascot-empty-history"
            title="No readings in this period"
            message="Try a longer period or add a new reading."
            action={{ label: 'Add reading', onPress: () => router.push({ pathname: '/vitals/new', params: { type, ...(customId ? { customId } : {}) } }) }}
          />
        ) : (
          <Card padded={false} style={{ paddingHorizontal: SPACE.lg, paddingVertical: SPACE.xs }}>
            {[...readings].reverse().slice(0, 100).map((r) => {
              const disp = readingDisplay(r, profile, q.data?.custom ?? undefined);
              const a = assessReading(r, q.data?.targets ?? [], profile.emergencyNumber);
              const pill = positionPill(a.position, a.target);
              return (
                <Pressable
                  key={r.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${disp.value} ${disp.unit}, ${formatDateTime(r.measuredAt, timeZone, locale)}${r.context ? `, ${contextLabel(r.context)}` : ''}. Opens editor`}
                  onPress={() => router.push({ pathname: '/vitals/new', params: { id: r.id } })}
                  style={styles.histRow}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                      <AppText variant="bodyStrong">{disp.value}</AppText>
                      <AppText variant="caption" tone="muted">
                        {disp.unit}
                        {r.type === 'blood_pressure' && r.pulse ? ` · pulse ${r.pulse}` : ''}
                      </AppText>
                      {a.escalation ? <Ionicons name="warning" size={16} color={a.escalation.level === 'attention' ? c.warning : c.danger} accessibilityLabel="Needs attention" /> : null}
                    </View>
                    <AppText variant="caption" tone="subtle">
                      {formatDateTime(r.measuredAt, timeZone, locale)}
                      {r.context ? ` · ${contextLabel(r.context)}` : ''}
                      {r.source === 'demo' ? ' · sample' : ''}
                    </AppText>
                    {r.notes ? (
                      <AppText variant="caption" tone="muted" numberOfLines={2}>
                        {r.notes}
                      </AppText>
                    ) : null}
                  </View>
                  {pill ? <Pill label={pill.label} tone={pill.tone} /> : null}
                </Pressable>
              );
            })}
          </Card>
        )}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chartHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.sm },
  stats: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACE.md },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: 60, paddingVertical: SPACE.sm },
});
