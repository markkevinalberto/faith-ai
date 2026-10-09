/**
 * Retrieval: turns a routed question into FACTS drawn from the active profile's own records.
 * Every number here is computed by tested domain code; the language model only rephrases them.
 */
import { listAppointments, listLabResults, listLabTests, listUpcomingAppointments } from '../db/repo/care';
import { countTakenSince, listEventsBetween } from '../db/repo/doseEvents';
import { listMedications } from '../db/repo/medications';
import { listConditions, listTargets } from '../db/repo/profiles';
import { listReadings } from '../db/repo/vitals';
import type { SqlExecutor } from '../db/sql';
import { evaluateReading } from '../domain/escalation';
import { averageDailyDoses, describeDays } from '../domain/schedule';
import { adherence, linearTrend, mean, rangeBreakdown, summarize } from '../domain/stats';
import { estimateSupply } from '../domain/supply';
import { formatTargetRange, glucoseMetricForContext, resolveTarget } from '../domain/targets';
import { formatDateTime, formatLocalDate, formatLocalTime } from '../domain/time';
import type { ClinicianTarget, GlucoseContext, Profile, VitalReading } from '../domain/types';
import {
  cToTemperatureUnit,
  formatBloodPressure,
  formatGlucose,
  formatTemperature,
  formatWeight,
  glucoseDecimals,
  kgToWeightUnit,
  mgdlToGlucoseUnit,
  roundTo,
} from '../domain/units';
import { tokenize } from './knowledge/search';
import type { MetricHint, Route } from './router';

export type FactKind = 'record' | 'computed' | 'question';

export interface Fact {
  id: string;
  kind: FactKind;
  label: string;
  text: string;
  at?: string | null;
}

export interface RetrievalResult {
  facts: Fact[];
  limitations: string[];
}

export interface RetrievalContext {
  db: SqlExecutor;
  profile: Profile;
  now: Date;
  timeZone: string;
}

const DAY = 86_400_000;

const CONTEXT_LABEL: Record<GlucoseContext, string> = {
  fasting: 'Fasting',
  before_meal: 'Before meals',
  after_meal: 'After meals',
  bedtime: 'Bedtime',
  overnight: 'Overnight',
  random: 'Other times',
};

function fmtWhen(ctx: RetrievalContext, iso: string): string {
  return formatDateTime(iso, ctx.timeZone, ctx.profile.locale);
}
function fmtDay(ctx: RetrievalContext, iso: string): string {
  return formatDateTime(iso, ctx.timeZone, ctx.profile.locale, { dateStyle: 'medium' });
}

function glucoseRange(low: number | null, high: number | null, ctx: RetrievalContext): string {
  const u = ctx.profile.glucoseUnit;
  const d = glucoseDecimals(u);
  const conv = (v: number | null) => (v === null ? null : roundTo(mgdlToGlucoseUnit(v, u), d));
  return formatTargetRange(conv(low), conv(high), u);
}

async function windowReadings(ctx: RetrievalContext, type: VitalReading['type'], days: number): Promise<VitalReading[]> {
  return listReadings(ctx.db, ctx.profile.id, {
    type,
    fromIso: new Date(ctx.now.getTime() - days * DAY).toISOString(),
    toIso: new Date(ctx.now.getTime() + 60_000).toISOString(),
    order: 'asc',
  });
}

export async function glucoseFacts(ctx: RetrievalContext, days: number, targets: ClinicianTarget[]): Promise<RetrievalResult> {
  const readings = await windowReadings(ctx, 'glucose', days);
  if (readings.length === 0) return { facts: [], limitations: [`No glucose readings were recorded in the last ${days} days.`] };
  const unit = ctx.profile.glucoseUnit;
  const pts = readings.map((r) => ({ t: Date.parse(r.measuredAt), v: r.valueCanonical as number }));
  const s = summarize(pts);
  const facts: Fact[] = [
    {
      id: 'glucose.summary',
      kind: 'computed',
      label: `Glucose · last ${days} days`,
      text: `${s.count} reading${s.count === 1 ? '' : 's'} between ${fmtDay(ctx, readings[0].measuredAt)} and ${fmtDay(ctx, readings[readings.length - 1].measuredAt)}. Average ${formatGlucose(s.mean as number, unit)}; lowest ${formatGlucose(s.min as number, unit)}; highest ${formatGlucose(s.max as number, unit)}.`,
    },
  ];
  const limitations: string[] = [];
  for (const c of ['fasting', 'before_meal', 'after_meal', 'bedtime'] as GlucoseContext[]) {
    const subset = readings.filter((r) => r.context === c);
    if (subset.length === 0) continue;
    const metric = glucoseMetricForContext(c);
    const target = metric ? resolveTarget(metric, targets) : null;
    const values = subset.map((r) => r.valueCanonical as number);
    let text = `${subset.length} reading${subset.length === 1 ? '' : 's'}, average ${formatGlucose(mean(values) as number, unit)}.`;
    if (target) {
      const rb = rangeBreakdown(values, target.low, target.high);
      const whose = target.source === 'clinician' ? 'your clinician-set target' : 'the general reference range (not personalised)';
      text += ` ${rb.within} of ${rb.total} within ${whose} of ${glucoseRange(target.low, target.high, ctx)}; ${rb.below} below, ${rb.above} above. Target source: ${target.sourceLabel}.`;
    }
    facts.push({ id: `glucose.context.${c}`, kind: 'computed', label: `Glucose · ${CONTEXT_LABEL[c]}`, text });
  }
  const untagged = readings.filter((r) => !r.context || r.context === 'random' || r.context === 'overnight').length;
  if (untagged > 0) limitations.push(`${untagged} glucose reading${untagged === 1 ? ' has' : 's have'} no meal context, so ${untagged === 1 ? 'it is' : 'they are'} not compared with a target.`);

  const trend = linearTrend(pts, { stableThreshold: 10 });
  if (trend.direction === 'insufficient_data') {
    limitations.push('Not enough readings over enough days to describe a trend (needs at least 4 readings across 3 days).');
  } else {
    const change = formatGlucose(Math.abs(trend.changeOverSpan as number), unit);
    facts.push({
      id: 'glucose.trend',
      kind: 'computed',
      label: 'Glucose · trend',
      text:
        trend.direction === 'stable'
          ? `No clear upward or downward trend (fitted change under ${formatGlucose(10, unit)} over ${Math.round(trend.spanDays as number)} days).`
          : `Readings trended ${trend.direction === 'rising' ? 'upward' : 'downward'} by about ${change} over ${Math.round(trend.spanDays as number)} days (straight-line fit; individual readings vary).`,
    });
  }
  const lows = readings.filter((r) => (r.valueCanonical as number) < 70);
  const veryHigh = readings.filter((r) => (r.valueCanonical as number) >= 250);
  if (lows.length > 0) {
    facts.push({
      id: 'glucose.lows',
      kind: 'computed',
      label: 'Glucose · low readings',
      text: `${lows.length} reading${lows.length === 1 ? '' : 's'} below ${formatGlucose(70, unit)} (most recent ${formatGlucose(lows[lows.length - 1].valueCanonical as number, unit)} on ${fmtWhen(ctx, lows[lows.length - 1].measuredAt)}).`,
      at: lows[lows.length - 1].measuredAt,
    });
  }
  if (veryHigh.length > 0) {
    facts.push({
      id: 'glucose.highs',
      kind: 'computed',
      label: 'Glucose · very high readings',
      text: `${veryHigh.length} reading${veryHigh.length === 1 ? '' : 's'} at or above ${formatGlucose(250, unit)}.`,
    });
  }
  const last = readings[readings.length - 1];
  facts.push({
    id: 'glucose.latest',
    kind: 'record',
    label: 'Glucose · latest',
    text: `${formatGlucose(last.valueCanonical as number, unit)}${last.context ? ` (${CONTEXT_LABEL[last.context as GlucoseContext] ?? last.context})` : ''} on ${fmtWhen(ctx, last.measuredAt)}.`,
    at: last.measuredAt,
  });
  return { facts, limitations };
}

export async function bloodPressureFacts(ctx: RetrievalContext, days: number, targets: ClinicianTarget[]): Promise<RetrievalResult> {
  const readings = await windowReadings(ctx, 'blood_pressure', days);
  if (readings.length === 0) return { facts: [], limitations: [`No blood pressure readings were recorded in the last ${days} days.`] };
  const sys = readings.map((r) => r.systolic as number);
  const dia = readings.map((r) => r.diastolic as number);
  const sysT = resolveTarget('bp_systolic', targets);
  const diaT = resolveTarget('bp_diastolic', targets);
  const above = readings.filter((r) => (sysT?.high != null && (r.systolic as number) > sysT.high) || (diaT?.high != null && (r.diastolic as number) > diaT.high)).length;
  const facts: Fact[] = [
    {
      id: 'bp.summary',
      kind: 'computed',
      label: `Blood pressure · last ${days} days`,
      text: `${readings.length} reading${readings.length === 1 ? '' : 's'}. Average ${formatBloodPressure(mean(sys) as number, mean(dia) as number)}; systolic ranged ${Math.min(...sys)}–${Math.max(...sys)} mmHg, diastolic ${Math.min(...dia)}–${Math.max(...dia)} mmHg.`,
    },
  ];
  if (sysT && diaT) {
    const whose = sysT.source === 'clinician' ? 'your clinician-set target' : 'the general reference target (not personalised)';
    facts.push({
      id: 'bp.target',
      kind: 'computed',
      label: 'Blood pressure · compared with target',
      text: `${above} of ${readings.length} reading${readings.length === 1 ? ' was' : 's were'} above ${whose} of ${sysT.high ?? '—'}/${diaT.high ?? '—'} mmHg. Target source: ${sysT.sourceLabel}.`,
    });
  }
  const severe = readings.filter((r) => evaluateReading(r)?.ruleId === 'bp.severe');
  if (severe.length > 0) {
    facts.push({
      id: 'bp.severe',
      kind: 'computed',
      label: 'Blood pressure · very high readings',
      text: `${severe.length} reading${severe.length === 1 ? '' : 's'} at or above 180/120 mmHg (most recent on ${fmtWhen(ctx, severe[severe.length - 1].measuredAt)}).`,
    });
  }
  const limitations: string[] = [];
  const trend = linearTrend(
    readings.map((r) => ({ t: Date.parse(r.measuredAt), v: r.systolic as number })),
    { stableThreshold: 5 },
  );
  if (trend.direction === 'insufficient_data') limitations.push('Not enough readings over enough days to describe a blood pressure trend.');
  else
    facts.push({
      id: 'bp.trend',
      kind: 'computed',
      label: 'Blood pressure · trend',
      text:
        trend.direction === 'stable'
          ? `Systolic readings show no clear trend (fitted change under 5 mmHg over ${Math.round(trend.spanDays as number)} days).`
          : `Systolic readings trended ${trend.direction === 'rising' ? 'upward' : 'downward'} by about ${Math.round(Math.abs(trend.changeOverSpan as number))} mmHg over ${Math.round(trend.spanDays as number)} days (straight-line fit).`,
    });
  const last = readings[readings.length - 1];
  facts.push({
    id: 'bp.latest',
    kind: 'record',
    label: 'Blood pressure · latest',
    text: `${formatBloodPressure(last.systolic as number, last.diastolic as number)}${last.pulse ? `, pulse ${last.pulse} bpm` : ''} on ${fmtWhen(ctx, last.measuredAt)}.`,
    at: last.measuredAt,
  });
  return { facts, limitations };
}

export async function simpleVitalFacts(ctx: RetrievalContext, type: 'weight' | 'pulse' | 'spo2' | 'temperature', days: number): Promise<RetrievalResult> {
  const readings = await windowReadings(ctx, type, days);
  const label = { weight: 'Weight', pulse: 'Pulse', spo2: 'Oxygen saturation', temperature: 'Temperature' }[type];
  if (readings.length === 0) return { facts: [], limitations: [`No ${label.toLowerCase()} readings were recorded in the last ${days} days.`] };
  const fmt = (v: number) =>
    type === 'weight'
      ? formatWeight(v, ctx.profile.weightUnit)
      : type === 'temperature'
        ? formatTemperature(v, ctx.profile.temperatureUnit)
        : type === 'pulse'
          ? `${Math.round(v)} bpm`
          : `${Math.round(v)}%`;
  const values = readings.map((r) => r.valueCanonical as number);
  const first = readings[0];
  const last = readings[readings.length - 1];
  const facts: Fact[] = [
    {
      id: `${type}.summary`,
      kind: 'computed',
      label: `${label} · last ${days} days`,
      text: `${readings.length} reading${readings.length === 1 ? '' : 's'}; average ${fmt(mean(values) as number)}, range ${fmt(Math.min(...values))}–${fmt(Math.max(...values))}.`,
    },
  ];
  if (type === 'weight' && readings.length >= 2) {
    const diffKg = (last.valueCanonical as number) - (first.valueCanonical as number);
    const diff = roundTo(Math.abs(kgToWeightUnit(diffKg, ctx.profile.weightUnit)), 1);
    facts.push({
      id: 'weight.change',
      kind: 'computed',
      label: 'Weight · change',
      text: diff === 0 ? 'No change between the first and latest reading.' : `${diffKg > 0 ? 'Up' : 'Down'} ${diff} ${ctx.profile.weightUnit} from ${fmtDay(ctx, first.measuredAt)} to ${fmtDay(ctx, last.measuredAt)}.`,
    });
  }
  facts.push({ id: `${type}.latest`, kind: 'record', label: `${label} · latest`, text: `${fmt(last.valueCanonical as number)} on ${fmtWhen(ctx, last.measuredAt)}.`, at: last.measuredAt });
  void cToTemperatureUnit;
  return { facts, limitations: [] };
}

export async function medicationFacts(ctx: RetrievalContext, mentioned: string[]): Promise<RetrievalResult> {
  const meds = await listMedications(ctx.db, ctx.profile.id);
  if (meds.length === 0) return { facts: [], limitations: ['No medications are recorded for this profile.'] };
  const lower = mentioned.map((m) => m.toLowerCase());
  const selected = lower.length ? meds.filter((m) => lower.includes(m.medication.name.toLowerCase())) : meds.filter((m) => m.medication.status === 'active');
  const facts: Fact[] = [];
  const weekAgo = new Date(ctx.now.getTime() - 7 * DAY).toISOString();
  const events = await listEventsBetween(ctx.db, ctx.profile.id, weekAgo, ctx.now.toISOString());
  for (const { medication: m, schedules } of selected) {
    const name = `${m.name}${m.strength ? ` ${m.strength}` : ''}`;
    const sched = m.asNeeded
      ? 'Taken as needed (no schedule).'
      : schedules.length
        ? `Scheduled at ${schedules.map((s) => formatLocalTime(s.timeOfDay, ctx.profile.locale)).join(', ')} — ${describeDays(schedules[0].daysOfWeek)}.`
        : 'No schedule set.';
    facts.push({
      id: `med.${m.id}`,
      kind: 'record',
      label: name,
      text: `Instructions as recorded: “${m.doseInstructions || 'none recorded'}” — ${sched} Status: ${m.status}.${m.prescriber ? ` Prescriber: ${m.prescriber}.` : ''}${m.endDate ? ` End date: ${formatLocalDate(m.endDate, ctx.profile.locale)}.` : ''}`,
    });
    const own = events.filter((e) => e.medicationId === m.id);
    const a = adherence(own.map((e) => e.status));
    if (a.resolved > 0) {
      facts.push({
        id: `med.${m.id}.adherence`,
        kind: 'computed',
        label: `${m.name} · last 7 days`,
        text: `${a.taken} taken, ${a.skipped} skipped, ${a.unconfirmed} not confirmed out of ${a.resolved} past scheduled dose${a.resolved === 1 ? '' : 's'}.`,
      });
    }
    if (m.refillSupplyCount !== null && m.refillUnitsPerDose !== null && m.supplyUpdatedAt) {
      const taken = await countTakenSince(ctx.db, ctx.profile.id, m.id, m.supplyUpdatedAt);
      const est = estimateSupply({ supplyCount: m.refillSupplyCount, unitsPerDose: m.refillUnitsPerDose, takenSinceUpdate: taken, averageDailyDoses: averageDailyDoses(schedules) });
      if (est) {
        facts.push({
          id: `med.${m.id}.supply`,
          kind: 'computed',
          label: `${m.name} · supply`,
          text: `About ${Math.floor(est.remainingUnits)} unit${est.remainingUnits === 1 ? '' : 's'} left based on your recorded count and doses marked taken${est.daysLeft !== null ? ` — roughly ${est.daysLeft} day${est.daysLeft === 1 ? '' : 's'} at your schedule` : ''}.`,
        });
      }
    }
  }
  const limitations = lower.length && selected.length === 0 ? ['None of your recorded medications matched that name.'] : [];
  return { facts, limitations };
}

export async function labFacts(ctx: RetrievalContext): Promise<RetrievalResult> {
  const results = await listLabResults(ctx.db, ctx.profile.id);
  const tests = await listLabTests(ctx.db, ctx.profile.id);
  const facts: Fact[] = [];
  const byAnalyte = new Map<string, typeof results>();
  for (const r of results) {
    const k = r.analyte.toLowerCase();
    byAnalyte.set(k, [...(byAnalyte.get(k) ?? []), r]);
  }
  for (const [, list] of byAnalyte) {
    const sorted = [...list].sort((a, b) => (a.resultDate < b.resultDate ? 1 : -1));
    const [latest, prev] = sorted;
    const val = (r: (typeof list)[number]) => `${r.valueNum ?? r.valueText}${r.unit ? ` ${r.unit}` : ''}`;
    const ref =
      latest.referenceText ?? (latest.referenceLow !== null || latest.referenceHigh !== null ? formatTargetRange(latest.referenceLow, latest.referenceHigh, latest.unit ?? '') : null);
    facts.push({
      id: `lab.${latest.id}`,
      kind: 'record',
      label: `Lab · ${latest.analyte}`,
      text: `${val(latest)} on ${formatLocalDate(latest.resultDate, ctx.profile.locale)}${ref ? ` (reference range on the report: ${ref})` : ''}${latest.labFlag ? `; flagged "${latest.labFlag}" on the report` : ''}.${prev ? ` Previous: ${val(prev)} on ${formatLocalDate(prev.resultDate, ctx.profile.locale)}.` : ''}`,
    });
  }
  const upcoming = tests.filter((t) => t.status === 'scheduled' && t.scheduledAt && t.scheduledAt >= ctx.now.toISOString());
  for (const t of upcoming.slice(0, 3)) {
    facts.push({
      id: `labtest.${t.id}`,
      kind: 'record',
      label: `Upcoming lab · ${t.name}`,
      text: `Scheduled ${fmtWhen(ctx, t.scheduledAt as string)}${t.location ? ` at ${t.location}` : ''}.${t.fastingRequired ? ' Fasting was noted for this test.' : ''}${t.preparationNotes ? ` Preparation notes: ${t.preparationNotes}` : ''}`,
      at: t.scheduledAt,
    });
  }
  return { facts, limitations: facts.length === 0 ? ['No lab results or upcoming lab tests are recorded.'] : [] };
}

export async function appointmentFacts(ctx: RetrievalContext): Promise<RetrievalResult> {
  const upcoming = await listUpcomingAppointments(ctx.db, ctx.profile.id, ctx.now.toISOString(), 3);
  const facts: Fact[] = upcoming.map((a) => ({
    id: `appt.${a.id}`,
    kind: 'record' as const,
    label: `Appointment · ${a.title}`,
    text: `${fmtWhen(ctx, a.startsAt)}${a.clinician ? ` with ${a.clinician}` : ''}${a.location ? ` at ${a.location}` : ''}.${a.preparationNotes ? ` Preparation: ${a.preparationNotes}` : ''}${a.questions ? ` Your saved questions: ${a.questions}` : ''}`,
    at: a.startsAt,
  }));
  const labs = await labFacts(ctx);
  facts.push(...labs.facts.filter((f) => f.id.startsWith('labtest.')));
  return { facts, limitations: facts.length === 0 ? ['No upcoming appointments or lab tests are recorded.'] : [] };
}

/** Deterministic, data-driven questions the user may want to raise with their clinician. */
export async function clinicianQuestionFacts(ctx: RetrievalContext): Promise<RetrievalResult> {
  const targets = await listTargets(ctx.db, ctx.profile.id);
  const questions: string[] = [];
  const unit = ctx.profile.glucoseUnit;
  const glucose = await windowReadings(ctx, 'glucose', 14);
  for (const c of ['fasting', 'before_meal', 'after_meal'] as GlucoseContext[]) {
    const subset = glucose.filter((r) => r.context === c);
    const metric = glucoseMetricForContext(c);
    const target = metric ? resolveTarget(metric, targets) : null;
    if (subset.length >= 3 && target) {
      const rb = rangeBreakdown(subset.map((r) => r.valueCanonical as number), target.low, target.high);
      if (rb.above / rb.total >= 0.3) {
        questions.push(`My ${CONTEXT_LABEL[c].toLowerCase()} glucose readings were above ${target.source === 'clinician' ? 'my target' : 'the general reference range'} on ${rb.above} of ${rb.total} readings in the last 14 days. Should we review my plan?`);
      }
    }
  }
  const lows = glucose.filter((r) => (r.valueCanonical as number) < 70);
  if (lows.length > 0) questions.push(`I recorded ${lows.length} low glucose reading${lows.length === 1 ? '' : 's'} (below ${formatGlucose(70, unit)}) in the last 14 days. How can I prevent lows, and what should my low-glucose plan be?`);
  const bp = await windowReadings(ctx, 'blood_pressure', 14);
  if (bp.length >= 3) {
    const s = mean(bp.map((r) => r.systolic as number)) as number;
    const d = mean(bp.map((r) => r.diastolic as number)) as number;
    const sysT = resolveTarget('bp_systolic', targets);
    if (sysT?.high != null && s > sysT.high) questions.push(`My average home blood pressure was ${formatBloodPressure(s, d)} over ${bp.length} readings in the last 14 days. Is my treatment working as expected?`);
  }
  const events = await listEventsBetween(ctx.db, ctx.profile.id, new Date(ctx.now.getTime() - 14 * DAY).toISOString(), ctx.now.toISOString());
  const missed = events.filter((e) => e.status === 'skipped' || e.status === 'unconfirmed').length;
  if (missed >= 3) questions.push(`I skipped or didn't confirm ${missed} scheduled doses in the last 14 days. Could my medication schedule be made simpler?`);
  const tests = await listLabTests(ctx.db, ctx.profile.id);
  for (const t of tests.filter((x) => x.status === 'scheduled' && x.scheduledAt && x.scheduledAt >= ctx.now.toISOString()).slice(0, 2)) {
    questions.push(`Before my ${t.name} test, do I need to fast or change the timing of any medicines?`);
  }
  if (targets.length === 0) questions.push('Which glucose and blood pressure targets are right for me, so I can record them in FAITH?');
  const conditions = await listConditions(ctx.db, ctx.profile.id);
  if (conditions.some((c) => c.category === 'diabetes_type2' || c.category === 'diabetes_type1') && !(await listLabResults(ctx.db, ctx.profile.id)).some((r) => /a1c/i.test(r.analyte))) {
    questions.push('When is my next HbA1c test due?');
  }
  const appts = await listAppointments(ctx.db, ctx.profile.id);
  const next = appts.find((a) => a.status === 'scheduled' && a.startsAt >= ctx.now.toISOString());
  const facts: Fact[] = questions.map((q, i) => ({ id: `q.${i}`, kind: 'question', label: `Question ${i + 1}`, text: q }));
  if (next?.questions) facts.push({ id: 'q.saved', kind: 'record', label: `Saved for ${next.title}`, text: next.questions, at: next.startsAt });
  return { facts, limitations: questions.length === 0 ? ['Your recent records did not raise specific questions — you can still ask your clinician about your targets and plan.'] : [] };
}

/** Keyword search across the profile's own records (offline fallback for free-form questions). */
export async function searchRecords(ctx: RetrievalContext, question: string, limit = 8): Promise<RetrievalResult> {
  const tokens = tokenize(question).filter((t) => t.length >= 3);
  if (tokens.length === 0) return { facts: [], limitations: [] };
  const hit = (s: string | null | undefined) => !!s && tokens.some((t) => s.toLowerCase().includes(t));
  const facts: Fact[] = [];
  for (const { medication: m } of await listMedications(ctx.db, ctx.profile.id)) {
    if (hit(m.name) || hit(m.doseInstructions) || hit(m.notes)) facts.push({ id: `med.${m.id}`, kind: 'record', label: `Medication · ${m.name}`, text: `Instructions as recorded: “${m.doseInstructions || 'none recorded'}”${m.notes ? ` — Notes: ${m.notes}` : ''}` });
  }
  for (const t of await listLabTests(ctx.db, ctx.profile.id)) {
    if (hit(t.name) || hit(t.preparationNotes) || hit(t.notes)) facts.push({ id: `labtest.${t.id}`, kind: 'record', label: `Lab test · ${t.name}`, text: `Status: ${t.status}.${t.scheduledAt ? ` Scheduled ${fmtWhen(ctx, t.scheduledAt)}.` : ''}${t.preparationNotes ? ` Preparation: ${t.preparationNotes}` : ''}` });
  }
  for (const a of await listAppointments(ctx.db, ctx.profile.id)) {
    if (hit(a.title) || hit(a.clinician) || hit(a.notes) || hit(a.preparationNotes) || hit(a.questions)) facts.push({ id: `appt.${a.id}`, kind: 'record', label: `Appointment · ${a.title}`, text: `${fmtWhen(ctx, a.startsAt)} (${a.status}).${a.notes ? ` Notes: ${a.notes}` : ''}`, at: a.startsAt });
  }
  for (const c of await listConditions(ctx.db, ctx.profile.id)) {
    if (hit(c.name) || hit(c.notes)) facts.push({ id: `cond.${c.id}`, kind: 'record', label: `Condition · ${c.name}`, text: `Recorded as ${c.status}.${c.diagnosedOn ? ` Since ${formatLocalDate(c.diagnosedOn, ctx.profile.locale)}.` : ''}${c.notes ? ` Notes: ${c.notes}` : ''}` });
  }
  const withNotes = (await listReadings(ctx.db, ctx.profile.id, { limit: 500 })).filter((r) => hit(r.notes));
  for (const r of withNotes.slice(0, 3)) facts.push({ id: `reading.${r.id}`, kind: 'record', label: `Reading note · ${fmtDay(ctx, r.measuredAt)}`, text: r.notes as string, at: r.measuredAt });
  return { facts: facts.slice(0, limit), limitations: [] };
}

export async function metricFacts(ctx: RetrievalContext, metrics: MetricHint[], days: number): Promise<RetrievalResult> {
  const targets = await listTargets(ctx.db, ctx.profile.id);
  const out: RetrievalResult = { facts: [], limitations: [] };
  for (const m of metrics) {
    const r =
      m === 'glucose'
        ? await glucoseFacts(ctx, days, targets)
        : m === 'blood_pressure'
          ? await bloodPressureFacts(ctx, days, targets)
          : await simpleVitalFacts(ctx, m, days);
    out.facts.push(...r.facts);
    out.limitations.push(...r.limitations);
  }
  return out;
}

/** Facts for a routed question. */
export async function retrieve(route: Route, question: string, ctx: RetrievalContext): Promise<RetrievalResult> {
  switch (route.intent) {
    case 'readings_summary':
      return metricFacts(ctx, route.metrics.length ? route.metrics : ['glucose', 'blood_pressure'], route.timeframeDays);
    case 'medication_lookup':
    case 'dose_change':
      return medicationFacts(ctx, route.mentionedMedications);
    case 'lab_summary':
      return labFacts(ctx);
    case 'appointments':
      return appointmentFacts(ctx);
    case 'clinician_questions':
      return clinicianQuestionFacts(ctx);
    case 'diagnosis':
      return metricFacts(ctx, route.metrics.length ? route.metrics : ['glucose', 'blood_pressure'], route.timeframeDays);
    case 'explain_term': {
      if (route.metrics.length) return metricFacts(ctx, route.metrics, route.timeframeDays);
      if (/\b(a1c|hba1c|cholesterol|ldl|egfr|uacr|microalbumin|lipid)/i.test(question)) {
        const labs = await labFacts(ctx);
        const tokens = tokenize(question);
        return { facts: labs.facts.filter((f) => f.id.startsWith('lab.') && tokens.some((t) => f.label.toLowerCase().includes(t))), limitations: [] };
      }
      return { facts: [], limitations: [] };
    }
    case 'general':
      return searchRecords(ctx, question);
    default:
      return { facts: [], limitations: [] };
  }
}

export function factsAsPlainText(facts: Fact[]): string {
  return facts.map((f) => `${f.label}: ${f.text}`).join('\n');
}
