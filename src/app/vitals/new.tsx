import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { hasReadingNote } from '@/ai/coach';
import { parseVoiceReading } from '@/ai/voice/voiceCommands';
import { CoachCard } from '@/components/CoachCard';
import { VoiceButton } from '@/components/VoiceButton';
import { listTargets } from '@/db/repo/profiles';
import { addReading, deleteReading, getReading, listCustomTypes, updateReading, type ReadingInput } from '@/db/repo/vitals';
import { evaluateReading, type EscalationResult } from '@/domain/escalation';
import type { CustomVitalType, GlucoseUnit, TemperatureUnit, VitalReading, VitalType, WeightUnit } from '@/domain/types';
import { cToTemperatureUnit, glucoseDecimals, kgToWeightUnit, mgdlToGlucoseUnit, parseDecimal, roundTo } from '@/domain/units';
import { validateBloodPressure, validateGlucose, validateSimpleVital } from '@/domain/validation';
import { useApp, useProfile } from '@/state/AppState';
import { useAction, useQuery } from '@/state/hooks';
import { Button } from '@/ui/Button';
import { showAlert } from '@/ui/dialog';
import { EscalationCard } from '@/ui/EscalationCard';
import { Banner, InlineLoading } from '@/ui/Feedback';
import { Illustration } from '@/ui/Illustration';
import { ChipSelect, DateTimeField, SegmentedControl, TextField } from '@/ui/Fields';
import { Card, FormFooter, Screen } from '@/ui/Layout';
import { AppText } from '@/ui/Text';
import { SPACE } from '@/ui/theme';
import { BP_CONTEXT_OPTIONS, GLUCOSE_CONTEXT_OPTIONS, VITAL_META, VITAL_ORDER, assessReading, positionPill } from '@/ui/vitals';

type Kind = VitalType;

/** `value`, `unit`, `context`, `systolic`, `diastolic` and `pulse` pre-fill a new reading (from Ask FAITH); the person still saves it. */
type Params = { type?: string; id?: string; customId?: string; value?: string; unit?: string; context?: string; systolic?: string; diastolic?: string; pulse?: string };

export default function ReadingFormLoader() {
  const params = useLocalSearchParams<Params>();
  const profile = useProfile();
  const extra = useQuery(
    async (d) => ({ custom: await listCustomTypes(d, profile.id), existing: params.id ? await getReading(d, profile.id, params.id) : null }),
    [profile.id, params.id],
  );
  if (!extra.data) return <InlineLoading />;
  return <ReadingForm key={params.id ?? 'new'} params={params} existing={extra.data.existing} customTypes={extra.data.custom} />;
}

function ReadingForm({ params, existing, customTypes }: { params: Params; existing: VitalReading | null; customTypes: CustomVitalType[] }) {
  const editing = !!params.id;
  const profile = useProfile();
  const { db, timeZone, locale } = useApp();
  const run = useAction();
  const isBp = existing?.type === 'blood_pressure';

  const [kind, setKind] = useState<Kind>(existing?.type ?? (params.type as Kind) ?? 'glucose');
  const [customTypeId, setCustomTypeId] = useState<string | null>(existing ? existing.customTypeId : (params.customId ?? null));
  const prefill = existing ? {} : params;
  const [value, setValue] = useState(existing && !isBp ? String(existing.value) : (prefill.value ?? ''));
  const [glucoseUnit, setGlucoseUnit] = useState<GlucoseUnit>(
    existing?.type === 'glucose' ? (existing.unit as GlucoseUnit) : prefill.unit === 'mmol/L' || prefill.unit === 'mg/dL' ? prefill.unit : profile.glucoseUnit,
  );
  const [weightUnit, setWeightUnit] = useState<WeightUnit>(existing?.type === 'weight' ? (existing.unit as WeightUnit) : prefill.unit === 'kg' || prefill.unit === 'lb' ? prefill.unit : profile.weightUnit);
  const [tempUnit, setTempUnit] = useState<TemperatureUnit>(
    existing?.type === 'temperature' ? (existing.unit.replace('°', '') as TemperatureUnit) : prefill.unit === 'C' || prefill.unit === 'F' ? prefill.unit : profile.temperatureUnit,
  );
  const [systolic, setSystolic] = useState(isBp ? String(existing.systolic) : (prefill.systolic ?? ''));
  const [diastolic, setDiastolic] = useState(isBp ? String(existing.diastolic) : (prefill.diastolic ?? ''));
  const [pulse, setPulse] = useState(isBp && existing.pulse ? String(existing.pulse) : (prefill.pulse ?? ''));
  const [context, setContext] = useState<string | null>(existing?.context ?? prefill.context ?? null);
  const [measuredAt, setMeasuredAt] = useState(() => (existing ? new Date(existing.measuredAt) : new Date()));
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [saved, setSaved] = useState<{ escalation: EscalationResult | null; pill: { label: string; tone: 'success' | 'warning' } | null; reading: VitalReading } | null>(null);
  const [saving, setSaving] = useState(false);
  const [heard, setHeard] = useState<{ text: string; understood: boolean } | null>(null);
  const kindOptions = [
    ...VITAL_ORDER.map((t) => ({ value: t as string, label: VITAL_META[t].short })),
    ...customTypes.map((t) => ({ value: `custom:${t.id}`, label: t.name })),
  ];
  const selectedKey = kind === 'custom' ? `custom:${customTypeId}` : kind;
  const custom = customTypes.find((t) => t.id === customTypeId);

  const build = (): ReadingInput | null => {
    const base = { measuredAt: measuredAt.toISOString(), timezone: timeZone, notes, context, source: existing?.source === 'demo' ? ('demo' as const) : ('manual' as const) };
    if (measuredAt.getTime() > Date.now() + 5 * 60_000) {
      setErrors({ when: 'The time cannot be in the future.' });
      return null;
    }
    if (kind === 'glucose') {
      const v = validateGlucose(value, glucoseUnit);
      setErrors(v.errors);
      return v.ok && v.value ? { ...base, type: 'glucose', value: v.value.value, unit: glucoseUnit, valueCanonical: v.value.mgdl } : null;
    }
    if (kind === 'blood_pressure') {
      const v = validateBloodPressure(systolic, diastolic, pulse);
      setErrors(v.errors);
      return v.ok && v.value ? { ...base, type: 'blood_pressure', unit: 'mmHg', systolic: v.value.systolic, diastolic: v.value.diastolic, pulse: v.value.pulse } : null;
    }
    if (kind === 'custom') {
      const n = parseDecimal(value);
      if (n === null || !custom) {
        setErrors({ value: 'Enter a number.' });
        return null;
      }
      setErrors({});
      return { ...base, context: null, type: 'custom', customTypeId: custom.id, value: n, unit: custom.unit, valueCanonical: n };
    }
    const unit = kind === 'weight' ? weightUnit : kind === 'temperature' ? tempUnit : kind === 'pulse' ? 'bpm' : '%';
    const v = validateSimpleVital(kind as 'pulse' | 'weight' | 'temperature' | 'spo2', value, unit);
    setErrors(v.errors);
    return v.ok && v.value ? { ...base, context: null, type: kind, value: v.value.value, unit: kind === 'temperature' ? `°${tempUnit}` : unit, valueCanonical: v.value.canonical } : null;
  };

  const save = async () => {
    const input = build();
    if (!input) return;
    setSaving(true);
    let savedId = params.id ?? '';
    const ok = await run(async () => {
      if (editing && params.id) await updateReading(db, profile.id, params.id, input);
      else savedId = await addReading(db, profile.id, input);
    });
    setSaving(false);
    if (!ok) return;
    const escalation = evaluateReading(
      { type: input.type, valueCanonical: input.valueCanonical ?? null, systolic: input.systolic ?? null, diastolic: input.diastolic ?? null },
      profile.emergencyNumber,
    );
    const targets = await listTargets(db, profile.id);
    const reading: VitalReading = {
      id: savedId,
      profileId: profile.id,
      type: input.type,
      customTypeId: input.customTypeId ?? null,
      value: input.value ?? null,
      unit: input.unit,
      valueCanonical: input.valueCanonical ?? null,
      systolic: input.systolic ?? null,
      diastolic: input.diastolic ?? null,
      pulse: input.pulse ?? null,
      measuredAt: input.measuredAt,
      timezone: input.timezone,
      utcOffsetMin: 0,
      context: input.context ?? null,
      source: 'manual',
      notes: null,
      createdAt: '',
    };
    const assessed = assessReading(reading, targets, profile.emergencyNumber);
    const pill = positionPill(assessed.position, assessed.target) as { label: string; tone: 'success' | 'warning' } | null;
    // Glucose, blood pressure, pulse and oxygen readings get FAITH's note with tips.
    if (escalation || pill || hasReadingNote(reading.type)) setSaved({ escalation, pill, reading });
    else router.back();
  };

  const remove = () =>
    showAlert('Delete this reading?', 'It will be permanently removed from this phone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          void run(async () => {
            await deleteReading(db, profile.id, params.id as string);
            router.back();
          }),
      },
    ]);

  if (saved) {
    // Tips are left out when a safety card is shown: the person should follow that first.
    const coach = !saved.escalation && hasReadingNote(saved.reading.type);
    return (
      <Screen edges={[]} footer={<FormFooter><Button title="Done" icon="checkmark" size="lg" onPress={() => router.back()} /></FormFooter>}>
        <Stack.Screen options={{ title: 'Reading saved' }} />
        {!saved.escalation && !coach ? (
          <View style={{ alignItems: 'center' }}>
            <Illustration name="mascot-encouragement" height={140} />
          </View>
        ) : null}
        <Banner
          tone="success"
          title="Saved"
          message={coach ? 'Your reading is saved on this phone.' : saved.pill ? `${saved.pill.label}. A single reading can vary — look at your trend over time.` : 'Your reading has been recorded.'}
        />
        {saved.escalation ? <EscalationCard result={saved.escalation} emergencyNumber={profile.emergencyNumber} /> : null}
        {coach ? <CoachCard subject={{ kind: 'reading', reading: saved.reading }} /> : null}
      </Screen>
    );
  }

  /** Pre-fills the form from a spoken sentence. Nothing is saved until the user taps Save. */
  const applyVoice = (text: string) => {
    const r = parseVoiceReading(text);
    setHeard({ text, understood: !!r });
    if (!r) return;
    setErrors({});
    setCustomTypeId(null);
    setKind(r.type);
    setContext(null);
    if (r.type === 'blood_pressure') {
      setSystolic(String(r.systolic));
      setDiastolic(String(r.diastolic));
      setPulse(r.pulse !== null ? String(r.pulse) : '');
      return;
    }
    setValue(String(r.value));
    if (r.type === 'glucose') {
      if (r.unit) setGlucoseUnit(r.unit);
      setContext(r.context);
    } else if (r.type === 'weight' && r.unit) setWeightUnit(r.unit);
    else if (r.type === 'temperature' && r.unit) setTempUnit(r.unit);
  };

  const switchGlucoseUnit = (u: GlucoseUnit) => {
    const n = parseDecimal(value);
    if (n !== null && u !== glucoseUnit) {
      const mg = glucoseUnit === 'mg/dL' ? n : n * 18.0182;
      setValue(String(roundTo(mgdlToGlucoseUnit(mg, u), glucoseDecimals(u))));
    }
    setGlucoseUnit(u);
  };

  return (
    <Screen
      edges={[]}
      keyboard
      footer={
        <FormFooter>
          <Button title={editing ? 'Save changes' : 'Save reading'} icon="checkmark" size="lg" loading={saving} onPress={() => void save()} />
          {editing ? <Button title="Delete reading" icon="trash-outline" variant="danger" onPress={remove} /> : null}
        </FormFooter>
      }>
      <Stack.Screen options={{ title: editing ? 'Edit reading' : 'Add reading' }} />
      {!editing && Platform.OS !== 'web' ? (
        <Card style={{ gap: SPACE.sm }}>
          <VoiceButton label="Say your reading" size={48} showLabel onTranscript={applyVoice} />
          <AppText variant="caption" tone="muted">
            For example “blood pressure 130 over 85, pulse 72” or “sugar 145 fasting”. Transcribed on this phone; check the fields before saving.
          </AppText>
          {heard ? (
            <AppText variant="caption" tone={heard.understood ? 'success' : 'warning'}>
              Heard: “{heard.text}”{heard.understood ? ' — form filled below.' : ' — no reading found. Try again or type it.'}
            </AppText>
          ) : null}
        </Card>
      ) : null}
      {!editing ? (
        <ChipSelect
          label="What are you recording?"
          options={kindOptions}
          selected={[selectedKey]}
          onToggle={(v) => {
            setErrors({});
            setValue('');
            setContext(null);
            if (v.startsWith('custom:')) {
              setKind('custom');
              setCustomTypeId(v.slice(7));
            } else {
              setKind(v as Kind);
              setCustomTypeId(null);
            }
          }}
        />
      ) : null}

      {kind === 'glucose' ? (
        <>
          <TextField label="Glucose" value={value} onChangeText={setValue} keyboardType="decimal-pad" suffix={glucoseUnit} error={errors.value} autoFocus={!editing} />
          <SegmentedControl label="Unit shown on your meter" options={[{ value: 'mg/dL', label: 'mg/dL' }, { value: 'mmol/L', label: 'mmol/L' }]} value={glucoseUnit} onChange={switchGlucoseUnit} />
          <ChipSelect label="When was it taken?" options={GLUCOSE_CONTEXT_OPTIONS} selected={context ? [context] : []} onToggle={(v) => setContext(context === v ? null : v)} helper="Context lets FAITH compare the reading with the right target." />
        </>
      ) : null}

      {kind === 'blood_pressure' ? (
        <>
          <View style={{ flexDirection: 'row', gap: SPACE.md }}>
            <View style={{ flex: 1 }}>
              <TextField label="Systolic (top)" value={systolic} onChangeText={setSystolic} keyboardType="number-pad" suffix="mmHg" error={errors.systolic} autoFocus={!editing} />
            </View>
            <View style={{ flex: 1 }}>
              <TextField label="Diastolic (bottom)" value={diastolic} onChangeText={setDiastolic} keyboardType="number-pad" suffix="mmHg" error={errors.diastolic} />
            </View>
          </View>
          <TextField label="Pulse (optional)" value={pulse} onChangeText={setPulse} keyboardType="number-pad" suffix="bpm" error={errors.pulse} />
          <ChipSelect label="Position" options={BP_CONTEXT_OPTIONS} selected={context ? [context] : []} onToggle={(v) => setContext(context === v ? null : v)} />
        </>
      ) : null}

      {kind === 'pulse' || kind === 'spo2' ? (
        <TextField label={VITAL_META[kind].label} value={value} onChangeText={setValue} keyboardType="number-pad" suffix={kind === 'pulse' ? 'bpm' : '%'} error={errors.value} autoFocus={!editing} />
      ) : null}

      {kind === 'weight' ? (
        <>
          <TextField label="Weight" value={value} onChangeText={setValue} keyboardType="decimal-pad" suffix={weightUnit} error={errors.value} autoFocus={!editing} />
          <SegmentedControl
            label="Unit"
            options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]}
            value={weightUnit}
            onChange={(u) => {
              const n = parseDecimal(value);
              if (n !== null && u !== weightUnit) setValue(String(roundTo(u === 'lb' ? kgToWeightUnit(n, 'lb') : n / 2.2046226218, 1)));
              setWeightUnit(u);
            }}
          />
        </>
      ) : null}

      {kind === 'temperature' ? (
        <>
          <TextField label="Temperature" value={value} onChangeText={setValue} keyboardType="decimal-pad" suffix={`°${tempUnit}`} error={errors.value} autoFocus={!editing} />
          <SegmentedControl
            label="Unit"
            options={[{ value: 'C', label: '°C' }, { value: 'F', label: '°F' }]}
            value={tempUnit}
            onChange={(u) => {
              const n = parseDecimal(value);
              if (n !== null && u !== tempUnit) setValue(String(roundTo(u === 'F' ? cToTemperatureUnit(n, 'F') : ((n - 32) * 5) / 9, 1)));
              setTempUnit(u);
            }}
          />
        </>
      ) : null}

      {kind === 'custom' && custom ? <TextField label={custom.name} value={value} onChangeText={setValue} keyboardType="decimal-pad" suffix={custom.unit} error={errors.value} autoFocus={!editing} /> : null}

      <DateTimeField label="Measured at" value={measuredAt} onChange={setMeasuredAt} mode="datetime" locale={locale} maximumDate={new Date()} />
      {errors.when ? (
        <AppText variant="caption" tone="danger">
          {errors.when}
        </AppText>
      ) : null}
      <TextField label="Notes (optional)" value={notes} onChangeText={setNotes} multiline maxLength={500} placeholder="e.g. after a walk, feeling unwell, new meter" />
    </Screen>
  );
}
