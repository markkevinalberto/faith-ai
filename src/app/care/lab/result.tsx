import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { addLabResult, getLabTest, setLabStatus } from '@/db/repo/care';
import type { LabTest } from '@/domain/types';
import { parseDecimal } from '@/domain/units';
import { useApp, useProfile } from '@/state/AppState';
import { useAction, useQuery } from '@/state/hooks';
import { Button } from '@/ui/Button';
import { Banner, InlineLoading } from '@/ui/Feedback';
import { ChipSelect, DateTimeField, SegmentedControl, TextField } from '@/ui/Fields';
import { FormFooter, Screen } from '@/ui/Layout';
import { SPACE } from '@/ui/theme';

export default function LabResultFormLoader() {
  const { labId } = useLocalSearchParams<{ labId: string }>();
  const profile = useProfile();
  const test = useQuery((d) => getLabTest(d, profile.id, labId), [profile.id, labId]);
  if (test.data === undefined) return <InlineLoading />;
  return <LabResultForm key={labId} labId={labId} test={test.data} />;
}

function LabResultForm({ labId, test }: { labId: string; test: LabTest | null }) {
  const profile = useProfile();
  const { db, locale } = useApp();
  const run = useAction();
  const [analyte, setAnalyte] = useState(test?.name ?? '');
  const [kind, setKind] = useState<'number' | 'text'>('number');
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('');
  const [refLow, setRefLow] = useState('');
  const [refHigh, setRefHigh] = useState('');
  const [refText, setRefText] = useState('');
  const [flag, setFlag] = useState<string | null>(null);
  const [date, setDate] = useState(() => new Date());
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [saving, setSaving] = useState(false);

  const save = async (addAnother: boolean) => {
    const e: Record<string, string | undefined> = {};
    if (!analyte.trim()) e.analyte = 'Enter what was measured, e.g. LDL cholesterol.';
    const num = kind === 'number' ? parseDecimal(value) : null;
    if (kind === 'number' && num === null) e.value = 'Enter the number from the report.';
    if (kind === 'text' && !value.trim()) e.value = 'Enter the result text from the report.';
    const low = refLow.trim() ? parseDecimal(refLow) : null;
    const high = refHigh.trim() ? parseDecimal(refHigh) : null;
    if ((refLow.trim() && low === null) || (refHigh.trim() && high === null)) e.ref = 'Range limits must be numbers (or use the text box).';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    const resultDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const ok = await run(async () => {
      await addLabResult(db, profile.id, labId, {
        analyte,
        valueNum: num,
        valueText: kind === 'text' ? value : null,
        unit,
        referenceLow: low,
        referenceHigh: high,
        referenceText: refText,
        labFlag: flag,
        resultDate,
        notes,
      });
      if (test?.status === 'scheduled') await setLabStatus(db, profile.id, labId, 'completed');
    });
    setSaving(false);
    if (!ok) return;
    if (addAnother) {
      setAnalyte('');
      setValue('');
      setUnit('');
      setRefLow('');
      setRefHigh('');
      setRefText('');
      setFlag(null);
      setNotes('');
    } else router.back();
  };

  return (
    <Screen
      edges={[]}
      keyboard
      footer={
        <FormFooter>
          <Button title="Save result" icon="checkmark" size="lg" loading={saving} onPress={() => void save(false)} />
          <Button title="Save and add another" variant="ghost" onPress={() => void save(true)} />
        </FormFooter>
      }>
      <Stack.Screen options={{ title: 'Add result' }} />
      <Banner tone="info" icon="document-text-outline" message="Copy each value, unit and reference range exactly as printed on your lab report. FAITH stores them as you enter them and does not interpret them." />
      <TextField label="Test / analyte" value={analyte} onChangeText={setAnalyte} error={errors.analyte} placeholder="e.g. HbA1c, LDL cholesterol" maxLength={80} />
      <SegmentedControl options={[{ value: 'number', label: 'Number' }, { value: 'text', label: 'Text result' }]} value={kind} onChange={setKind} />
      <View style={{ flexDirection: 'row', gap: SPACE.md }}>
        <View style={{ flex: 1.3 }}>
          <TextField label="Result" value={value} onChangeText={setValue} keyboardType={kind === 'number' ? 'decimal-pad' : 'default'} error={errors.value} />
        </View>
        <View style={{ flex: 1 }}>
          <TextField label="Unit" value={unit} onChangeText={setUnit} autoCapitalize="none" placeholder="%, mg/dL…" maxLength={24} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: SPACE.md }}>
        <View style={{ flex: 1 }}>
          <TextField label="Range low" value={refLow} onChangeText={setRefLow} keyboardType="decimal-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <TextField label="Range high" value={refHigh} onChangeText={setRefHigh} keyboardType="decimal-pad" error={errors.ref} />
        </View>
      </View>
      <TextField label="Or reference range as printed" value={refText} onChangeText={setRefText} placeholder="e.g. <100 mg/dL" maxLength={60} />
      <ChipSelect
        label="Flag printed on the report (if any)"
        options={['H', 'L', 'Abnormal', 'Critical'].map((f) => ({ value: f, label: f }))}
        selected={flag ? [flag] : []}
        onToggle={(v) => setFlag(flag === v ? null : v)}
      />
      <DateTimeField label="Result date" value={date} onChange={setDate} mode="date" locale={locale} maximumDate={new Date()} />
      <TextField label="Notes" value={notes} onChangeText={setNotes} multiline maxLength={500} />
    </Screen>
  );
}
