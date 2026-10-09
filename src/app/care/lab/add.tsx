/**
 * Add a lab result in three taps: pick the test, type the number, save. The unit is preselected,
 * the date defaults to today, and the reference range comes from the biomarker catalog (general,
 * not personalised) unless the person enters the range printed on their report. Results are grouped
 * into one "Lab report" entry per date; blood-sugar tests (FBS, RBS) are saved as glucose readings
 * so they appear on the Vitals chart.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BIOMARKERS, biomarkersByCategory, describeBandRange, getBiomarker, placeValue, type Biomarker, type Placement } from '@/ai/knowledge/biomarkers';
import { getSource } from '@/ai/knowledge/sources';
import { addLabResult, createLabTest, listLabTests } from '@/db/repo/care';
import { addReading } from '@/db/repo/vitals';
import { localDateKey } from '@/domain/time';
import { glucoseToMgdl, parseDecimal } from '@/domain/units';
import { useApp, useProfile } from '@/state/AppState';
import { useAction } from '@/state/hooks';
import { Button } from '@/ui/Button';
import { Banner } from '@/ui/Feedback';
import { DateTimeField, SegmentedControl, TextField } from '@/ui/Fields';
import { Illustration } from '@/ui/Illustration';
import { Card, FormFooter, Screen, Section } from '@/ui/Layout';
import { AppText } from '@/ui/Text';
import { SPACE, useTheme } from '@/ui/theme';

/** One umbrella lab test per report date keeps hand-entered results together in the Care plan. */
const REPORT_NAME = 'Lab report';

type Params = { biomarker?: string; value?: string; unit?: string; labId?: string };

const sourceNames = (ids: string[]) => ids.map((id) => getSource(id)?.publisher.split('(')[0].trim() ?? id).join(', ');

export default function AddResult() {
  const params = useLocalSearchParams<Params>();
  const profile = useProfile();
  const { db, timeZone, locale } = useApp();
  const { c } = useTheme();
  const run = useAction();
  const [biomarker, setBiomarker] = useState<Biomarker | null>(() => (params.biomarker ? getBiomarker(params.biomarker) : null));
  const [custom, setCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [search, setSearch] = useState('');
  const [value, setValue] = useState(params.value ?? '');
  const [unit, setUnit] = useState(params.unit ?? '');
  const [date, setDate] = useState(() => new Date());
  const [showReportRange, setShowReportRange] = useState(false);
  const [refText, setRefText] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ name: string; shown: string; placement: Placement | null; asReading: boolean } | null>(null);

  const effectiveUnit = biomarker ? (biomarker.units.includes(unit) ? unit : biomarker.units[0]) : unit.trim();
  const num = parseDecimal(value);
  const placement = biomarker && num !== null ? placeValue(biomarker, num, effectiveUnit) : null;

  const choose = (b: Biomarker) => {
    setBiomarker(b);
    setCustom(false);
    setUnit(b.units[0]);
    setError(null);
  };

  const reset = () => {
    setBiomarker(null);
    setCustom(false);
    setCustomName('');
    setSearch('');
    setValue('');
    setUnit('');
    setRefText('');
    setNotes('');
    setShowReportRange(false);
    setError(null);
    setSaved(null);
  };

  const findOrCreateReport = async (resultDate: string): Promise<string> => {
    const tests = await listLabTests(db, profile.id);
    const existing = tests.find((t) => t.name === REPORT_NAME && t.scheduledAt && localDateKey(new Date(t.scheduledAt), timeZone) === resultDate);
    if (existing) return existing.id;
    const at = new Date(date);
    at.setHours(12, 0, 0, 0);
    return createLabTest(db, profile.id, { name: REPORT_NAME, status: 'completed', scheduledAt: at.toISOString(), timezone: timeZone, notes: 'Results entered by hand from a report.' });
  };

  const save = async () => {
    const n = parseDecimal(value);
    if (!biomarker && !customName.trim()) {
      setError('Choose the test, or type its name.');
      return;
    }
    if (n === null) {
      setError('Enter the number from the report.');
      return;
    }
    if (date.getTime() > Date.now() + 5 * 60_000) {
      setError('The date cannot be in the future.');
      return;
    }
    setError(null);
    setSaving(true);
    const name = biomarker?.name ?? customName.trim();
    const resultDate = localDateKey(date, timeZone);
    const asReading = biomarker?.readingType === 'glucose';
    const ok = await run(async () => {
      if (biomarker && asReading) {
        const u = effectiveUnit === 'mmol/L' ? 'mmol/L' : 'mg/dL';
        const measuredAt = new Date(date);
        if (localDateKey(measuredAt, timeZone) !== localDateKey(new Date(), timeZone)) measuredAt.setHours(8, 0, 0, 0);
        await addReading(db, profile.id, {
          type: 'glucose',
          value: n,
          unit: u,
          valueCanonical: glucoseToMgdl(n, u),
          context: biomarker.readingContext === 'fasting' ? 'fasting' : 'random',
          measuredAt: measuredAt.toISOString(),
          timezone: timeZone,
          notes: notes.trim(),
          source: 'manual',
        });
        return;
      }
      const labId = params.labId ?? (await findOrCreateReport(resultDate));
      await addLabResult(db, profile.id, labId, {
        analyte: name,
        valueNum: n,
        unit: effectiveUnit || null,
        referenceText: refText.trim() || null,
        resultDate,
        notes: notes.trim() || null,
      });
    });
    setSaving(false);
    if (ok) setSaved({ name, shown: `${n}${effectiveUnit ? ` ${effectiveUnit}` : ''}`, placement, asReading });
  };

  if (saved) {
    return (
      <Screen
        edges={[]}
        footer={
          <FormFooter>
            <Button title="Add another result" icon="add" size="lg" onPress={reset} />
            <Button title="Done" variant="secondary" onPress={() => router.back()} />
            <Button title="Ask FAITH about this" icon="sparkles-outline" variant="ghost" onPress={() => router.push({ pathname: '/ask', params: { q: `my ${saved.name} is ${saved.shown}` } })} />
          </FormFooter>
        }>
        <Stack.Screen options={{ title: 'Result saved' }} />
        <View style={{ alignItems: 'center' }}>
          <Illustration name="mascot-encouragement" height={130} />
        </View>
        <Banner
          tone="success"
          title={`${saved.name}: ${saved.shown} saved`}
          message={
            saved.placement
              ? `${saved.placement.band.label} (${describeBandRange(saved.placement.band, saved.placement.canonicalUnit)}). General reference, not personalised.`
              : 'Saved exactly as entered. Compare it with the range printed on your report.'
          }
        />
        {saved.asReading ? (
          <AppText variant="caption" tone="subtle">
            Blood sugar results are kept with your glucose readings, so they appear on the Vitals chart too.
          </AppText>
        ) : null}
      </Screen>
    );
  }

  if (!biomarker && !custom) {
    const q = search.trim().toLowerCase();
    const groups = q
      ? [{ category: 'other' as const, label: 'Matches', items: BIOMARKERS.filter((b) => b.name.toLowerCase().includes(q) || b.aliases.some((a) => a.includes(q))) }]
      : biomarkersByCategory();
    return (
      <Screen edges={[]} keyboard>
        <Stack.Screen options={{ title: 'Add a result' }} />
        <AppText variant="heading">What was tested?</AppText>
        <TextField label="Search" value={search} onChangeText={setSearch} placeholder="e.g. HbA1c, FBS, cholesterol" autoCapitalize="none" />
        {groups.map((g) => (
          <Section key={g.category} title={g.label}>
            {g.items.map((b) => (
              <Card key={b.id} onPress={() => choose(b)} accessibilityLabel={`${b.name}, ${b.units[0]}`} accessibilityHint="Opens the result form for this test">
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyStrong">{b.name}</AppText>
                    <AppText variant="caption" tone="muted">
                      {b.units.join(' · ')}
                      {b.reference ? ' · reference range included' : ''}
                    </AppText>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={c.textSubtle} />
                </View>
              </Card>
            ))}
            {g.items.length === 0 ? (
              <AppText variant="body" tone="muted">
                No test matches “{search}”.
              </AppText>
            ) : null}
          </Section>
        ))}
        <Button title="Something else: type the test name" icon="create-outline" variant="ghost" onPress={() => setCustom(true)} />
      </Screen>
    );
  }

  return (
    <Screen edges={[]} keyboard footer={<FormFooter><Button title="Save result" icon="checkmark" size="lg" loading={saving} onPress={() => void save()} /></FormFooter>}>
      <Stack.Screen options={{ title: 'Add a result' }} />
      <Pressable accessibilityRole="button" accessibilityLabel={`Test: ${biomarker?.name ?? 'other test'}. Tap to change`} onPress={reset}>
        <Card>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <AppText variant="label" tone="muted">
                Test
              </AppText>
              <AppText variant="heading">{biomarker?.name ?? 'Another test'}</AppText>
            </View>
            <AppText variant="label" tone="primary">
              Change
            </AppText>
          </View>
        </Card>
      </Pressable>
      {custom ? <TextField label="Test name" value={customName} onChangeText={setCustomName} placeholder="e.g. Vitamin D" autoCapitalize="words" maxLength={80} /> : null}
      <TextField label="Result" value={value} onChangeText={setValue} keyboardType="decimal-pad" suffix={effectiveUnit || undefined} error={error} autoFocus={!!biomarker && !params.value} />
      {biomarker && biomarker.units.length > 1 ? (
        <SegmentedControl label="Unit on your report" options={biomarker.units.map((u) => ({ value: u, label: u }))} value={effectiveUnit} onChange={setUnit} />
      ) : null}
      {custom ? <TextField label="Unit" value={unit} onChangeText={setUnit} placeholder="e.g. ng/mL" autoCapitalize="none" maxLength={24} /> : null}
      {placement && num !== null ? (
        <Banner
          tone="info"
          icon="analytics-outline"
          title={`${num} ${effectiveUnit}: ${placement.band.label}`}
          message={`${describeBandRange(placement.band, placement.canonicalUnit)}. ${placement.reference.note} General reference, not personalised (${sourceNames(placement.reference.sourceIds)}).`}
        />
      ) : biomarker && num !== null && !biomarker.reference ? (
        <AppText variant="caption" tone="muted">
          FAITH has no general reference range for this test. Compare it with the range printed on your report.
        </AppText>
      ) : null}
      <DateTimeField label="Date of the test" value={date} onChange={setDate} mode="date" locale={locale} maximumDate={new Date()} />
      <Button title={showReportRange ? 'Hide report details' : 'My report shows a range or a note'} icon={showReportRange ? 'chevron-up' : 'chevron-down'} variant="ghost" size="sm" onPress={() => setShowReportRange((s) => !s)} />
      {showReportRange ? (
        <>
          <TextField label="Reference range printed on the report" value={refText} onChangeText={setRefText} placeholder="e.g. 4.0–5.6 %" maxLength={60} />
          <TextField label="Notes (optional)" value={notes} onChangeText={setNotes} multiline maxLength={300} />
        </>
      ) : null}
      <AppText variant="caption" tone="subtle">
        Values are stored exactly as you enter them. FAITH shows where a value sits on published reference scales; it does not interpret results — your clinician does.
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, minHeight: 44 },
});
