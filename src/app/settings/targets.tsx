import { useState } from 'react';
import { Alert, View } from 'react-native';

import { deleteTarget, listTargets, upsertTarget } from '@/db/repo/profiles';
import { REFERENCE_TARGETS, formatTargetRange, resolveTarget } from '@/domain/targets';
import type { TargetMetric } from '@/domain/types';
import { glucoseDecimals, glucoseToMgdl, mgdlToGlucoseUnit, roundTo } from '@/domain/units';
import { validateTarget } from '@/domain/validation';
import { useApp, useProfile } from '@/state/AppState';
import { useAction, useQuery } from '@/state/hooks';
import { Button } from '@/ui/Button';
import { Banner, Pill } from '@/ui/Feedback';
import { TextField } from '@/ui/Fields';
import { Card, Screen } from '@/ui/Layout';
import { AppText } from '@/ui/Text';
import { SPACE } from '@/ui/theme';

const METRICS: { metric: TargetMetric; label: string }[] = [
  { metric: 'glucose_fasting', label: 'Fasting glucose' },
  { metric: 'glucose_before_meal', label: 'Before-meal glucose' },
  { metric: 'glucose_after_meal', label: 'After-meal glucose' },
  { metric: 'glucose_bedtime', label: 'Bedtime glucose' },
  { metric: 'bp_systolic', label: 'Systolic blood pressure' },
  { metric: 'bp_diastolic', label: 'Diastolic blood pressure' },
  { metric: 'pulse', label: 'Resting pulse' },
  { metric: 'spo2', label: 'Oxygen saturation' },
];

export default function Targets() {
  const profile = useProfile();
  const { db } = useApp();
  const run = useAction();
  const q = useQuery((d) => listTargets(d, profile.id), [profile.id]);
  const [editing, setEditing] = useState<TargetMetric | null>(null);
  const [low, setLow] = useState('');
  const [high, setHigh] = useState('');
  const [setBy, setSetBy] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const isGlucose = (m: TargetMetric) => m.startsWith('glucose');
  const unitFor = (m: TargetMetric) => (isGlucose(m) ? profile.glucoseUnit : m.startsWith('bp') ? 'mmHg' : m === 'pulse' ? 'bpm' : '%');
  const toDisplay = (m: TargetMetric, v: number | null) => (v === null ? null : isGlucose(m) ? roundTo(mgdlToGlucoseUnit(v, profile.glucoseUnit), glucoseDecimals(profile.glucoseUnit)) : v);

  const startEdit = (m: TargetMetric) => {
    const own = q.data?.find((t) => t.metric === m);
    setEditing(m);
    setLow(own?.low != null ? String(toDisplay(m, own.low)) : '');
    setHigh(own?.high != null ? String(toDisplay(m, own.high)) : '');
    setSetBy(own?.setBy ?? '');
    setErr(null);
  };

  const save = (m: TargetMetric) => {
    const v = validateTarget(low, high);
    if (!v.ok) return setErr(v.error ?? 'Invalid range');
    if (!setBy.trim()) return setErr('Enter who set this target (e.g. your clinician’s name).');
    const conv = (x: number | null) => (x === null ? null : isGlucose(m) ? glucoseToMgdl(x, profile.glucoseUnit) : x);
    void run(async () => {
      await upsertTarget(db, profile.id, { metric: m, low: conv(v.low), high: conv(v.high), unit: isGlucose(m) ? 'mg/dL' : unitFor(m), setBy, setOn: new Date().toISOString().slice(0, 10) });
      setEditing(null);
    });
  };

  return (
    <Screen edges={[]} keyboard>
      <Banner
        tone="info"
        message="Targets are personal. Enter the ranges your clinician gave you — FAITH will label them “clinician-set”. Where you haven’t entered one, a general reference range is shown and clearly labelled as not personalised."
      />
      {METRICS.map(({ metric, label }) => {
        const r = resolveTarget(metric, q.data ?? []);
        const unit = unitFor(metric);
        return (
          <Card key={metric} style={{ gap: SPACE.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
              <AppText variant="bodyStrong" style={{ flex: 1 }}>
                {label}
              </AppText>
              {r ? <Pill label={r.source === 'clinician' ? 'Clinician-set' : 'Reference'} tone={r.source === 'clinician' ? 'success' : 'neutral'} /> : <Pill label="None" />}
            </View>
            {r ? (
              <>
                <AppText variant="metricSmall">{formatTargetRange(toDisplay(metric, r.low), toDisplay(metric, r.high), unit)}</AppText>
                <AppText variant="caption" tone="subtle">
                  {r.sourceLabel}
                  {r.source === 'reference' ? ' · Draft, pending clinical review' : ''}
                </AppText>
              </>
            ) : (
              <AppText variant="caption" tone="subtle">
                No general reference range — add one from your clinician if you have it.
              </AppText>
            )}
            {editing === metric ? (
              <View style={{ gap: SPACE.md }}>
                <View style={{ flexDirection: 'row', gap: SPACE.md }}>
                  <View style={{ flex: 1 }}>
                    <TextField label={`Lower (${unit})`} value={low} onChangeText={setLow} keyboardType="decimal-pad" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <TextField label={`Upper (${unit})`} value={high} onChangeText={setHigh} keyboardType="decimal-pad" />
                  </View>
                </View>
                <TextField label="Set by" value={setBy} onChangeText={setSetBy} placeholder="e.g. Dr. Santos, diabetes clinic" error={err} autoCapitalize="words" maxLength={80} />
                <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
                  <Button title="Cancel" variant="ghost" onPress={() => setEditing(null)} style={{ flex: 1 }} />
                  <Button title="Save" icon="checkmark" onPress={() => save(metric)} style={{ flex: 1 }} />
                </View>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
                <Button title={r?.source === 'clinician' ? 'Edit' : 'Enter my clinician’s target'} size="sm" variant="secondary" onPress={() => startEdit(metric)} />
                {r?.source === 'clinician' ? (
                  <Button
                    title={REFERENCE_TARGETS[metric] ? 'Use reference range' : 'Remove'}
                    size="sm"
                    variant="ghost"
                    onPress={() =>
                      Alert.alert('Remove your clinician target?', label, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Remove', style: 'destructive', onPress: () => void run(() => deleteTarget(db, profile.id, metric)) },
                      ])
                    }
                  />
                ) : null}
              </View>
            )}
          </Card>
        );
      })}
    </Screen>
  );
}
