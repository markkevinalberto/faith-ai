import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { takeLabelDraft } from '@/ai/scan/draftStore';
import { syncDoseEvents } from '@/db/repo/doseEvents';
import { createMedication, getMedication, listMedications, updateMedication, type MedicationInput, type MedicationWithSchedules } from '@/db/repo/medications';
import { formatLocalTime, localDateKey, pad2 } from '@/domain/time';
import { parseDecimal } from '@/domain/units';
import { validateMedication } from '@/domain/validation';
import { getNotificationPermission, requestNotificationPermission } from '@/services/notifications';
import { useApp, useProfile } from '@/state/AppState';
import { useAction, useQuery } from '@/state/hooks';
import { Button, IconButton } from '@/ui/Button';
import { showAlert } from '@/ui/dialog';
import { Banner, InlineLoading } from '@/ui/Feedback';
import { ChipSelect, DateTimeField, TextField, ToggleRow } from '@/ui/Fields';
import { Card, FormFooter, Screen, Section } from '@/ui/Layout';
import { DAY_OPTIONS, MED_FORMS } from '@/ui/options';
import { AppText } from '@/ui/Text';
import { RADIUS, SPACE, useTheme } from '@/ui/theme';

function dateFromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}
function keyFromDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export default function MedicationFormLoader() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const profile = useProfile();
  const existing = useQuery(async (d) => (id ? getMedication(d, profile.id, id) : null), [profile.id, id]);
  if (id && existing.data === undefined) return <InlineLoading />;
  return <MedicationForm key={id ?? 'new'} id={id} loaded={existing.data ?? null} />;
}

function MedicationForm({ id, loaded }: { id?: string; loaded: MedicationWithSchedules | null }) {
  const editing = !!id;
  const profile = useProfile();
  const { db, timeZone, locale } = useApp();
  const { c } = useTheme();
  const run = useAction();
  const m = loaded?.medication;
  const firstSchedule = loaded?.schedules[0];
  const initialDays = firstSchedule?.daysOfWeek ?? [];

  const [name, setName] = useState(m?.name ?? '');
  const [strength, setStrength] = useState(m?.strength ?? '');
  const [form, setForm] = useState<string | null>(m ? m.form : 'Tablet');
  const [instructions, setInstructions] = useState(m?.doseInstructions ?? '');
  const [prescriber, setPrescriber] = useState(m?.prescriber ?? '');
  const [startDate, setStartDate] = useState(() => m?.startDate ?? localDateKey(new Date(), timeZone));
  const [hasEnd, setHasEnd] = useState(!!m?.endDate);
  const [endDate, setEndDate] = useState(() => m?.endDate ?? localDateKey(new Date(Date.now() + 30 * 86_400_000), timeZone));
  const [asNeeded, setAsNeeded] = useState(m?.asNeeded ?? false);
  const [times, setTimes] = useState<string[]>(loaded ? loaded.schedules.map((s) => s.timeOfDay) : ['08:00']);
  const [everyDay, setEveryDay] = useState(initialDays.length === 0);
  const [days, setDays] = useState<number[]>(initialDays.length ? initialDays : [1, 2, 3, 4, 5]);
  const [doseLabel, setDoseLabel] = useState(firstSchedule?.doseLabel ?? '');
  const [supply, setSupply] = useState(m?.refillSupplyCount != null ? String(m.refillSupplyCount) : '');
  const [unitsPerDose, setUnitsPerDose] = useState(m?.refillUnitsPerDose != null ? String(m.refillUnitsPerDose) : '1');
  const [threshold, setThreshold] = useState(m?.refillThresholdDays != null ? String(m.refillThresholdDays) : '7');
  const [notes, setNotes] = useState(m?.notes ?? '');
  const [status] = useState<'active' | 'paused' | 'stopped'>(m?.status ?? 'active');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [saving, setSaving] = useState(false);
  const [fromScan, setFromScan] = useState(false);

  // A reviewed label scan (see medications/scan) pre-fills only the fields it found.
  useFocusEffect(
    useCallback(() => {
      const d = takeLabelDraft();
      if (!d) return;
      if (d.name) setName(d.name);
      if (d.strength) setStrength(d.strength);
      if (d.form) setForm(MED_FORMS.includes(d.form) ? d.form : 'Other');
      if (d.instructions) setInstructions(d.instructions);
      if (d.prescriber) setPrescriber(d.prescriber);
      if (d.quantity !== null) setSupply(String(d.quantity));
      if (d.asNeeded) setAsNeeded(true);
      else if (d.suggestedTimes.length) setTimes(d.suggestedTimes);
      setFromScan(true);
    }, []),
  );

  const addTime = () => {
    const pick = (base: Date) => {
      const t = `${pad2(base.getHours())}:${pad2(base.getMinutes())}`;
      setTimes((cur) => (cur.includes(t) ? cur : [...cur, t].sort()));
    };
    if (Platform.OS === 'android') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { DateTimePickerAndroid } = require('@react-native-community/datetimepicker') as typeof import('@react-native-community/datetimepicker');
      DateTimePickerAndroid.open({ value: new Date(2000, 0, 1, 12, 0), mode: 'time', onChange: (e, d) => e.type === 'set' && d && pick(d) });
    } else {
      const defaults = ['08:00', '12:00', '18:00', '20:00', '21:00', '22:00'];
      const next = defaults.find((t) => !times.includes(t)) ?? '09:00';
      setTimes((cur) => [...cur, next].sort());
    }
  };

  const changeTime = (index: number) => {
    if (Platform.OS !== 'android') return;
    const [h, m] = times[index].split(':').map(Number);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DateTimePickerAndroid } = require('@react-native-community/datetimepicker') as typeof import('@react-native-community/datetimepicker');
    DateTimePickerAndroid.open({
      value: new Date(2000, 0, 1, h, m),
      mode: 'time',
      onChange: (e, d) => {
        if (e.type !== 'set' || !d) return;
        const t = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
        setTimes((cur) => [...new Set(cur.map((x, i) => (i === index ? t : x)))].sort());
      },
    });
  };

  const save = async () => {
    const daysOfWeek = everyDay ? [] : days;
    const v = validateMedication({ name, strength, doseInstructions: instructions, startDate, endDate: hasEnd ? endDate : '', times, daysOfWeek, asNeeded });
    if (!everyDay && days.length === 0 && !asNeeded) v.daysOfWeek = 'Choose at least one day.';
    setErrors(v);
    if (Object.keys(v).length > 0) return;
    const supplyN = supply.trim() ? parseDecimal(supply) : null;
    const unitsN = parseDecimal(unitsPerDose);
    const thresholdN = parseDecimal(threshold);
    const input: MedicationInput = {
      name,
      strength,
      form,
      doseInstructions: instructions,
      prescriber,
      startDate,
      endDate: hasEnd ? endDate : null,
      status,
      asNeeded,
      refillSupplyCount: supplyN,
      refillUnitsPerDose: supplyN !== null && unitsN && unitsN > 0 ? unitsN : null,
      refillThresholdDays: supplyN !== null && thresholdN !== null ? Math.round(thresholdN) : null,
      notes,
      schedules: asNeeded ? [] : times.map((t) => ({ timeOfDay: t, daysOfWeek, doseLabel })),
    };
    setSaving(true);
    const firstMed = !editing && (await listMedications(db, profile.id)).length === 0;
    const ok = await run(async () => {
      if (editing && id) await updateMedication(db, profile.id, id, input);
      else await createMedication(db, profile.id, input);
      await syncDoseEvents(db, profile.id, { now: new Date(), timeZone });
    });
    setSaving(false);
    if (!ok) return;
    if (firstMed && !asNeeded && !profile.isDemo && Platform.OS !== 'web' && (await getNotificationPermission()) === 'undetermined') {
      showAlert('Turn on dose reminders?', 'FAITH can remind you at each scheduled time. Reminders are created on this phone only.', [
        { text: 'Not now', style: 'cancel', onPress: () => router.back() },
        { text: 'Allow', onPress: () => void requestNotificationPermission().finally(() => router.back()) },
      ]);
    } else router.back();
  };

  return (
    <Screen edges={[]} keyboard footer={<FormFooter><Button title={editing ? 'Save changes' : 'Add medication'} icon="checkmark" size="lg" loading={saving} onPress={() => void save()} /></FormFooter>}>
      <Stack.Screen options={{ title: editing ? 'Edit medication' : 'Add medication' }} />
      {fromScan ? (
        <Banner tone="warning" icon="scan-outline" title="Filled from your scan" message="Check each field against the label before saving. Reminder times are only a starting point — set them to match your prescriber’s instructions." />
      ) : (
        <Banner tone="info" icon="document-text-outline" message="Enter details exactly as they appear on your prescription or pharmacy label. FAITH records your plan — it doesn’t suggest doses." />
      )}
      {!editing && Platform.OS !== 'web' ? (
        <Button title={fromScan ? 'Scan the label again' : 'Scan the label instead'} icon="scan-outline" variant="soft" onPress={() => router.push({ pathname: '/medications/scan', params: { from: 'edit' } })} />
      ) : null}
      <TextField label="Medication name" value={name} onChangeText={setName} error={errors.name} autoCapitalize="words" placeholder="e.g. Metformin" maxLength={120} />
      <TextField label="Strength" value={strength} onChangeText={setStrength} placeholder="e.g. 500 mg" helper="As printed on the label." maxLength={40} />
      <ChipSelect label="Form" options={MED_FORMS.map((f) => ({ value: f, label: f }))} selected={form ? [form] : []} onToggle={(v) => setForm(form === v ? null : v)} />
      <TextField label="Prescribed instructions" value={instructions} onChangeText={setInstructions} multiline placeholder="e.g. Take 1 tablet twice daily with meals" maxLength={500} />
      <TextField label="Prescriber (optional)" value={prescriber} onChangeText={setPrescriber} autoCapitalize="words" maxLength={80} />

      <Section title="Schedule">
        <Card padded={false} style={{ paddingHorizontal: SPACE.lg }}>
          <ToggleRow label="Take only as needed" description="No scheduled times or dose reminders." value={asNeeded} onValueChange={setAsNeeded} />
        </Card>
        {!asNeeded ? (
          <>
            <AppText variant="label">Times</AppText>
            <View style={{ gap: SPACE.sm }}>
              {times.map((t, i) => (
                <View key={t} style={[styles.timeRow, { borderColor: c.borderStrong, backgroundColor: c.surface }]}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Dose time ${formatLocalTime(t, locale)}. Tap to change`} onPress={() => changeTime(i)} style={styles.timeBtn}>
                    <Ionicons name="time-outline" size={20} color={c.primary} />
                    <AppText variant="bodyStrong">{formatLocalTime(t, locale)}</AppText>
                  </Pressable>
                  <IconButton icon="close" label={`Remove ${formatLocalTime(t, locale)}`} onPress={() => setTimes((cur) => cur.filter((x) => x !== t))} />
                </View>
              ))}
              <Button title="Add a time" icon="add" variant="secondary" onPress={addTime} />
            </View>
            {errors.times ? (
              <AppText variant="caption" tone="danger">
                {errors.times}
              </AppText>
            ) : null}
            <Card padded={false} style={{ paddingHorizontal: SPACE.lg }}>
              <ToggleRow label="Every day" value={everyDay} onValueChange={setEveryDay} />
            </Card>
            {!everyDay ? (
              <ChipSelect label="Days" options={DAY_OPTIONS} selected={days} onToggle={(d) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]))} />
            ) : null}
            {errors.daysOfWeek ? (
              <AppText variant="caption" tone="danger">
                {errors.daysOfWeek}
              </AppText>
            ) : null}
            <TextField label="Amount per dose (as prescribed)" value={doseLabel} onChangeText={setDoseLabel} placeholder="e.g. 1 tablet" maxLength={40} />
          </>
        ) : null}
        <DateTimeField label="Start date" value={dateFromKey(startDate)} onChange={(d) => setStartDate(keyFromDate(d))} mode="date" locale={locale} />
        {errors.startDate ? (
          <AppText variant="caption" tone="danger">
            {errors.startDate}
          </AppText>
        ) : null}
        <Card padded={false} style={{ paddingHorizontal: SPACE.lg }}>
          <ToggleRow label="Has an end date" value={hasEnd} onValueChange={setHasEnd} />
        </Card>
        {hasEnd ? <DateTimeField label="End date" value={dateFromKey(endDate)} onChange={(d) => setEndDate(keyFromDate(d))} mode="date" locale={locale} /> : null}
        {errors.endDate ? (
          <AppText variant="caption" tone="danger">
            {errors.endDate}
          </AppText>
        ) : null}
      </Section>

      <Section title="Refill reminders (optional)">
        <TextField label="How many do you have now?" value={supply} onChangeText={setSupply} keyboardType="decimal-pad" helper="Tablets, capsules, pens or doses. Leave empty to skip refill tracking." />
        {supply.trim() ? (
          <View style={{ flexDirection: 'row', gap: SPACE.md }}>
            <View style={{ flex: 1 }}>
              <TextField label="Used per dose" value={unitsPerDose} onChangeText={setUnitsPerDose} keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <TextField label="Remind at (days left)" value={threshold} onChangeText={setThreshold} keyboardType="number-pad" />
            </View>
          </View>
        ) : null}
      </Section>
      <TextField label="Notes (optional)" value={notes} onChangeText={setNotes} multiline maxLength={500} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  timeRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: RADIUS.md, paddingLeft: SPACE.md },
  timeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, minHeight: 52 },
});
