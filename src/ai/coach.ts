/**
 * "FAITH's note", shown right after a reading or lab result is saved: where the value sits, how it
 * compares with earlier records, and up to three guideline tips. Everything here is computed by
 * tested code. When an on-device model is loaded it only rewrites these facts and tips as a short,
 * warm note, and the output guard rejects anything that adds numbers, advice on medicines, a
 * diagnosis, or drops the computed position phrase. Without a model the computed note is shown.
 */
import { listLabResults } from '../db/repo/care';
import { listTargets } from '../db/repo/profiles';
import { listReadings } from '../db/repo/vitals';
import type { SqlExecutor } from '../db/sql';
import { classifyAgainst, formatTargetRange, glucoseMetricForContext, resolveTarget, type RangePosition, type ResolvedTarget } from '../domain/targets';
import { formatDateTime, formatLocalDate } from '../domain/time';
import type { ClinicianTarget, GlucoseContext, Profile, VitalReading } from '../domain/types';
import { formatBloodPressure, formatGlucose, glucoseDecimals, mgdlToGlucoseUnit, roundTo } from '../domain/units';
import { guardOutput } from './guard';
import type { ChatMessage, InferenceEngine } from './inference/types';
import { describeBandRange, findBiomarker, placeValue, type Biomarker } from './knowledge/biomarkers';
import { getSource } from './knowledge/sources';
import { tipsForLab, tipsForReading, type Tip } from './knowledge/tips';

export interface CoachNote {
  /** One plain sentence: the value and where it sits. */
  summary: string;
  /** Computed context: the previous result and the recent pattern. */
  details: string[];
  tips: Tip[];
  /** A generated note must repeat this phrase verbatim (null when there is nothing to compare with). */
  requiredPhrase: string | null;
  /** Organisations whose guidelines the tips come from, e.g. "American Diabetes Association". */
  sources: string[];
}

export interface CoachMessage {
  text: string;
  engineLabel: string;
  tokensPerSecond: number | null;
}

const DAY = 86_400_000;

const CONTEXT_WORD: Record<GlucoseContext, string> = {
  fasting: 'fasting',
  before_meal: 'before-meal',
  after_meal: 'after-meal',
  bedtime: 'bedtime',
  overnight: 'overnight',
  random: '',
};

function sourceTitles(tips: Tip[]): string[] {
  const publishers = tips.flatMap((t) => t.sourceIds).map((id) => getSource(id)?.publisher.split(' (')[0]);
  return [...new Set(publishers.filter((p): p is string => !!p))];
}

/** "above your target" / "within the general reference range": short enough for a model to repeat. */
function positionPhrase(position: RangePosition, target: ResolvedTarget): string {
  return `${position} ${target.source === 'clinician' ? 'your target' : 'the general reference range'}`;
}

function rangeText(target: ResolvedTarget, profile: Profile, glucose: boolean): string {
  if (!glucose) return formatTargetRange(target.low, target.high, target.unit);
  const u = profile.glucoseUnit;
  const d = glucoseDecimals(u);
  const conv = (v: number | null) => (v === null ? null : roundTo(mgdlToGlucoseUnit(v, u), d));
  return formatTargetRange(conv(target.low), conv(target.high), u);
}

export interface ReadingNoteParams {
  db: SqlExecutor;
  profile: Profile;
  reading: VitalReading;
  now: Date;
  timeZone: string;
}

type CoachedType = 'glucose' | 'blood_pressure' | 'pulse' | 'spo2';
const COACHED: CoachedType[] = ['glucose', 'blood_pressure', 'pulse', 'spo2'];

export function hasReadingNote(type: VitalReading['type']): boolean {
  return (COACHED as string[]).includes(type);
}

function assess(r: VitalReading, targets: ClinicianTarget[]): { target: ResolvedTarget | null; position: RangePosition | null } {
  if (r.type === 'glucose') {
    const metric = glucoseMetricForContext(r.context);
    const target = metric ? resolveTarget(metric, targets) : null;
    return { target, position: target ? classifyAgainst(r.valueCanonical as number, target) : null };
  }
  if (r.type === 'blood_pressure') {
    const s = resolveTarget('bp_systolic', targets);
    const d = resolveTarget('bp_diastolic', targets);
    if (!s || !d) return { target: null, position: null };
    const ps = classifyAgainst(r.systolic as number, s);
    const pd = classifyAgainst(r.diastolic as number, d);
    return { target: s, position: ps === 'above' || pd === 'above' ? 'above' : ps === 'below' && pd === 'below' ? 'below' : 'within' };
  }
  const target = resolveTarget(r.type as 'pulse' | 'spo2', targets);
  return { target, position: target ? classifyAgainst(r.valueCanonical as number, target) : null };
}

function shown(r: VitalReading, profile: Profile): string {
  if (r.type === 'glucose') return formatGlucose(r.valueCanonical as number, profile.glucoseUnit);
  if (r.type === 'blood_pressure') return formatBloodPressure(r.systolic as number, r.diastolic as number);
  if (r.type === 'pulse') return `${Math.round(r.valueCanonical as number)} bpm`;
  return `${Math.round(r.valueCanonical as number)}%`;
}

/** The note for a reading that was just saved, or null for types FAITH has no tips for. */
export async function buildReadingNote(p: ReadingNoteParams): Promise<CoachNote | null> {
  const r = p.reading;
  if (!hasReadingNote(r.type)) return null;
  const targets = await listTargets(p.db, p.profile.id);
  const { target, position } = assess(r, targets);
  const glucose = r.type === 'glucose';
  const ctxWord = glucose && r.context ? CONTEXT_WORD[r.context as GlucoseContext] : '';
  const value = shown(r, p.profile);
  const label = r.type === 'blood_pressure' ? 'blood pressure' : r.type === 'spo2' ? 'oxygen level' : r.type === 'pulse' ? 'pulse' : `${ctxWord ? `${ctxWord} ` : ''}glucose`;

  let summary: string;
  let requiredPhrase: string | null = null;
  if (target && position) {
    requiredPhrase = positionPhrase(position, target);
    const dia = r.type === 'blood_pressure' ? resolveTarget('bp_diastolic', targets) : null;
    // Blood pressure targets read as one pair, e.g. "below 130/80 mmHg".
    const range = dia && target.high !== null && dia.high !== null && target.low === null && dia.low === null ? `below ${target.high}/${dia.high} mmHg` : rangeText(target, p.profile, glucose);
    summary = `Your ${label} of ${value} is ${requiredPhrase} (${range}).${target.source === 'clinician' ? '' : ' That range is general, not personalised.'}`;
  } else {
    summary = `Your ${label} of ${value} is saved.${glucose ? ' It has no meal timing, so it is not compared with a target.' : ''}`;
  }

  const details: string[] = [];
  // Earlier readings of the same kind (and, for glucose, the same meal timing).
  const earlier = (await listReadings(p.db, p.profile.id, { type: r.type, toIso: r.measuredAt, limit: 60, order: 'desc' }))
    .filter((x) => x.id !== r.id && (!glucose || (x.context ?? null) === (r.context ?? null)));
  const prev = earlier[0];
  if (prev) {
    const when = formatDateTime(prev.measuredAt, p.timeZone, p.profile.locale, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
    let text = `Your previous ${label} reading was ${shown(prev, p.profile)} on ${when}.`;
    if (r.type === 'blood_pressure') {
      const diff = (r.systolic as number) - (prev.systolic as number);
      if (diff !== 0) text += ` The top number is ${Math.abs(diff)} mmHg ${diff > 0 ? 'higher' : 'lower'} this time.`;
    } else if (glucose) {
      const diff = roundTo(mgdlToGlucoseUnit((r.valueCanonical as number) - (prev.valueCanonical as number), p.profile.glucoseUnit), glucoseDecimals(p.profile.glucoseUnit));
      if (diff !== 0) text += ` This one is ${Math.abs(diff)} ${p.profile.glucoseUnit} ${diff > 0 ? 'higher' : 'lower'}.`;
    }
    details.push(text);
  }

  let repeatedlyAbove = false;
  if (target) {
    const since = Date.parse(r.measuredAt) - 7 * DAY;
    const week = [r, ...earlier.filter((x) => Date.parse(x.measuredAt) >= since)];
    const above = week.filter((x) => assess(x, targets).position === 'above').length;
    if (week.length >= 3) {
      details.push(`${above} of your last ${week.length} ${label} readings in the past 7 days ${above === 1 ? 'was' : 'were'} above ${target.source === 'clinician' ? 'your target' : 'the general reference range'}.`);
    }
    repeatedlyAbove = above >= 3 && above * 2 >= week.length;
  }

  const tips = tipsForReading({ type: r.type as CoachedType, position, glucoseContext: glucose ? ((r.context as GlucoseContext | null) ?? null) : null, repeatedlyAbove });
  return { summary, details, tips, requiredPhrase, sources: sourceTitles(tips) };
}

export interface LabNoteParams {
  db: SqlExecutor;
  profile: Profile;
  biomarker: Biomarker;
  value: number;
  unit: string;
  /** The id of the result that was just saved, so it is not compared with itself. */
  resultId?: string | null;
}

export async function buildLabNote(p: LabNoteParams): Promise<CoachNote> {
  const { biomarker, value, unit } = p;
  const v = `${value} ${unit}`;
  const placement = placeValue(biomarker, value, unit);
  const summary = placement
    ? `Your ${biomarker.name} of ${v} is ${placement.band.say} (${describeBandRange(placement.band, placement.canonicalUnit)}). This is a general reference, not personalised.`
    : `Your ${biomarker.name} of ${v} is saved. FAITH has no general range for it, so compare it with the range printed on your report.`;
  const details: string[] = [];
  const previous = (await listLabResults(p.db, p.profile.id)).filter((x) => x.id !== p.resultId && findBiomarker(x.analyte)?.biomarker.id === biomarker.id);
  const last = previous[0];
  if (last) {
    let text = `Your previous ${biomarker.name} was ${last.valueNum ?? last.valueText}${last.unit ? ` ${last.unit}` : ''} on ${formatLocalDate(last.resultDate, p.profile.locale)}.`;
    if (last.valueNum !== null && last.unit === unit) {
      const diff = roundTo(value - last.valueNum, Math.max(1, biomarker.decimals));
      if (diff !== 0) text += ` This result is ${Math.abs(diff)} ${unit} ${diff > 0 ? 'higher' : 'lower'}.`;
    }
    details.push(text);
  }
  const tips = tipsForLab(biomarker, placement);
  return { summary, details, tips, requiredPhrase: placement ? placement.band.say : null, sources: sourceTitles(tips) };
}

export const COACH_PROMPT = `You are FAITH, a kind, experienced nurse talking with an older adult who has just recorded a health result on their phone. You are not a doctor.
Rules you must always follow:
- Use ONLY the RESULT and TIPS below. Never add numbers, dates, foods, medicines or advice that are not written there.
- First sentence: the result and where it sits, worded exactly as in RESULT.
- Then encourage one or two of the TIPS in your own simple, friendly words. Do not copy every tip.
- Never diagnose. Never say a result is safe, normal or fine. Never suggest starting, stopping or changing any medicine.
- Write 2 or 3 short sentences in plain English. No lists, no headings, no questions.`;

/**
 * What the model sees: the headline result and the tips. The comparison lines are shown under the
 * note as computed text, so the model is not asked to restate them (small models copy everything).
 */
export function coachContext(note: CoachNote): string {
  const tips = note.tips.map((t) => `- ${t.text}`).join('\n');
  return `RESULT:\n- ${note.summary}\n\nTIPS:\n${tips}`;
}

export function coachMessages(note: CoachNote): ChatMessage[] {
  return [
    { role: 'system', content: COACH_PROMPT },
    { role: 'user', content: `${coachContext(note)}\n\nWrite the note now.` },
  ];
}

/** Words a tips note must never contain: tips are not about medicines or doses. */
const NOT_IN_TIPS = ['dose', 'doses', 'dosage', 'insulin', 'prescription'];

/**
 * Has the on-device model write the note. `message` is null when the draft does not pass the guard
 * (which here also rejects any mention of the person's own medicines); the caller then keeps
 * showing the computed note.
 */
export async function writeCoachMessage(
  note: CoachNote,
  engine: InferenceEngine,
  opts: { medicationNames?: string[]; onToken?: (t: string) => void } = {},
): Promise<{ message: CoachMessage | null; violations: string[] }> {
  const result = await engine.generate(coachMessages(note), { maxTokens: 120, temperature: 0.3, timeoutMs: 60_000, onToken: opts.onToken });
  const guard = guardOutput(result.text, coachContext(note), {
    requiredPhrases: note.requiredPhrase ? [note.requiredPhrase] : [],
    forbiddenTerms: [...NOT_IN_TIPS, ...(opts.medicationNames ?? [])],
  });
  if (!guard.ok) return { message: null, violations: guard.violations };
  return { message: { text: guard.text, engineLabel: engine.label, tokensPerSecond: result.tokensPerSecond }, violations: [] };
}
