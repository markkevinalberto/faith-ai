/**
 * Scan a lab report: photo → on-device OCR (ML Kit) → row parser + grounded on-device LLM →
 * the user ticks the rows to keep and saves them as a completed lab test. Values are copied exactly
 * as printed; FAITH does not interpret them here.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { engineStore } from '@/ai/inference/engineStore';
import { extractLabReport, type ExtractionMeta } from '@/ai/scan/extract';
import type { LabRowDraft } from '@/ai/scan/labReportParser';
import { captureImage, recognizeText, type CapturedImage, type ImageSource } from '@/ai/scan/ocr';
import { addDocument, addLabResult, createLabTest } from '@/db/repo/care';
import { localDateKey } from '@/domain/time';
import { discardTempFile, storeScannedImage } from '@/services/files';
import { useApp, useProfile } from '@/state/AppState';
import { friendlyError, useAction } from '@/state/hooks';
import { Button } from '@/ui/Button';
import { Banner, InlineLoading, Pill } from '@/ui/Feedback';
import { DateTimeField, TextField, ToggleRow } from '@/ui/Fields';
import { Illustration } from '@/ui/Illustration';
import { Card, FormFooter, Screen, Section } from '@/ui/Layout';
import { AppText } from '@/ui/Text';
import { RADIUS, SPACE, useTheme } from '@/ui/theme';

type Phase =
  | { step: 'pick' }
  | { step: 'reading'; label: string }
  | { step: 'review'; image: CapturedImage; ocrText: string; ocrMs: number; rows: LabRowDraft[]; meta: ExtractionMeta };

function rowValue(r: LabRowDraft): string {
  return `${r.valueNum ?? r.valueText}${r.unit ? ` ${r.unit}` : ''}`;
}

export default function ScanLabReport() {
  const profile = useProfile();
  const { db, timeZone, locale } = useApp();
  const { c } = useTheme();
  const run = useAction();
  const [phase, setPhase] = useState<Phase>({ step: 'pick' });
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [name, setName] = useState('Lab report');
  const [resultDate, setResultDate] = useState(() => new Date());
  const [keepPhoto, setKeepPhoto] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showText, setShowText] = useState(false);

  const scan = async (source: ImageSource) => {
    setError(null);
    try {
      const image = await captureImage(source);
      if (!image) return;
      setPhase({ step: 'reading', label: 'Reading the report on this phone…' });
      const ocr = await recognizeText(image.uri);
      if (ocr.text.trim().length < 4) throw new Error('No text was found. Try again in good light with the whole table in the frame.');
      const engine = engineStore.get().status === 'ready' ? engineStore.get().engine : null;
      if (engine) setPhase({ step: 'reading', label: 'Checking unclear lines with the on-device model…' });
      const { rows, meta } = await extractLabReport(ocr.text, engine);
      setSelected(new Set(rows.map((_, i) => i)));
      setPhase({ step: 'review', image, ocrText: ocr.text, ocrMs: ocr.durationMs, rows, meta });
    } catch (e) {
      setError(friendlyError(e));
      setPhase({ step: 'pick' });
    }
  };

  const retake = () => {
    if (phase.step === 'review') discardTempFile(phase.image.uri);
    setShowText(false);
    setPhase({ step: 'pick' });
  };

  const save = async () => {
    if (phase.step !== 'review') return;
    const rows = phase.rows.filter((_, i) => selected.has(i));
    if (rows.length === 0) return;
    setSaving(true);
    const date = localDateKey(resultDate, timeZone);
    let testId: string | null = null;
    const ok = await run(async () => {
      testId = await createLabTest(db, profile.id, { name: name.trim() || 'Lab report', status: 'completed', notes: 'Added from a scanned report. Values copied as printed.' });
      for (const r of rows) {
        await addLabResult(db, profile.id, testId, {
          analyte: r.analyte,
          valueNum: r.valueNum,
          valueText: r.valueText,
          unit: r.unit,
          referenceLow: r.refLow,
          referenceHigh: r.refHigh,
          referenceText: r.refText,
          labFlag: r.flag,
          resultDate: date,
        });
      }
      if (keepPhoto) {
        const stored = await storeScannedImage(profile.id, phase.image.uri, `${name.trim() || 'Lab report'} (photo)`, phase.image.mimeType);
        await addDocument(db, profile.id, { ...stored, labTestId: testId });
      } else {
        discardTempFile(phase.image.uri);
      }
    });
    setSaving(false);
    if (ok && testId) router.replace({ pathname: '/care/lab/[id]', params: { id: testId } });
  };

  if (Platform.OS === 'web') {
    return (
      <Screen edges={[]}>
        <Stack.Screen options={{ title: 'Scan a lab report' }} />
        <Banner tone="info" message="Report scanning uses the phone camera and on-device text recognition. Open FAITH on Android or iOS to use it." />
      </Screen>
    );
  }

  if (phase.step === 'review') {
    const { rows, meta } = phase;
    const toggle = (i: number) =>
      setSelected((cur) => {
        const next = new Set(cur);
        if (next.has(i)) next.delete(i);
        else next.add(i);
        return next;
      });
    return (
      <Screen
        edges={[]}
        keyboard
        footer={
          <FormFooter>
            <Button title={`Save ${selected.size} result${selected.size === 1 ? '' : 's'}`} icon="checkmark" size="lg" loading={saving} disabled={selected.size === 0} onPress={() => void save()} />
            <Button title="Scan again" icon="camera-outline" variant="ghost" onPress={retake} />
          </FormFooter>
        }>
        <Stack.Screen options={{ title: 'Check what was read' }} />
        <Banner tone="warning" icon="eye-outline" title="Compare each row with your report" message="Untick anything that was read wrongly. FAITH saves values exactly as printed and does not interpret them." />
        <View style={{ flexDirection: 'row', gap: SPACE.md, alignItems: 'flex-start' }}>
          <Image source={{ uri: phase.image.uri }} style={{ width: 96, height: 128, borderRadius: RADIUS.md, backgroundColor: c.surfaceMuted }} contentFit="cover" accessibilityLabel="Photo of the lab report" />
          <View style={{ flex: 1, gap: SPACE.xs }}>
            <Pill label={`Text read in ${(phase.ocrMs / 1000).toFixed(1)} s by ML Kit on this phone`} tone="success" icon="scan-outline" />
            {meta.usedModel ? <Pill label={`Unclear lines checked by ${meta.modelLabel?.split(' · ')[0] ?? 'the on-device model'}`} tone="primary" icon="hardware-chip-outline" /> : null}
            <AppText variant="caption" tone="muted">
              {rows.length} result{rows.length === 1 ? '' : 's'} found. Nothing has been saved.
            </AppText>
          </View>
        </View>
        {rows.length === 0 ? (
          <Banner tone="info" message="No result rows could be read. Try a sharper photo of just the results table, or add the results by hand." />
        ) : (
          <Card padded={false}>
            {rows.map((r, i) => {
              const on = selected.has(i);
              const ai = meta.aiFilled.includes(r.analyte);
              return (
                <Pressable
                  key={`${r.analyte}-${i}`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${r.analyte} ${rowValue(r)}${r.refText ? `, reference ${r.refText}` : ''}`}
                  onPress={() => toggle(i)}
                  style={[styles.row, { borderBottomColor: c.border, borderBottomWidth: i === rows.length - 1 ? 0 : StyleSheet.hairlineWidth }]}>
                  <Ionicons name={on ? 'checkbox' : 'square-outline'} size={24} color={on ? c.primary : c.textSubtle} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, flexWrap: 'wrap' }}>
                      <AppText variant="bodyStrong">{r.analyte}</AppText>
                      {r.flag ? <Pill label={`Flag ${r.flag}`} tone="warning" /> : null}
                      {ai ? <Pill label="On-device AI" tone="primary" /> : null}
                    </View>
                    <AppText variant="body">{rowValue(r)}</AppText>
                    {r.refText ? (
                      <AppText variant="caption" tone="muted">
                        Reference on report: {r.refText}
                      </AppText>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </Card>
        )}
        {meta.aiDropped.length ? (
          <Banner tone="info" icon="shield-checkmark-outline" message={`The on-device model also suggested ${meta.aiDropped.join(', ')}, but those values are not printed together on the report, so FAITH ignored them.`} />
        ) : null}
        {meta.note ? <Banner tone="info" message={meta.note} /> : null}
        <Section title="Save as">
          <TextField label="Test name" value={name} onChangeText={setName} maxLength={80} helper="For example “Quarterly bloods” or the lab’s name." />
          <DateTimeField label="Result date" value={resultDate} onChange={setResultDate} mode="date" locale={locale} maximumDate={new Date()} />
          <Card padded={false} style={{ paddingHorizontal: SPACE.lg }}>
            <ToggleRow label="Keep the photo with this record" description="Stored privately on this phone only." value={keepPhoto} onValueChange={setKeepPhoto} />
          </Card>
        </Section>
        <Button title={showText ? 'Hide scanned text' : 'Show scanned text'} variant="ghost" size="sm" icon="document-text-outline" onPress={() => setShowText((s) => !s)} />
        {showText ? (
          <Card tone="muted">
            <AppText variant="caption" selectable>
              {phase.ocrText}
            </AppText>
          </Card>
        ) : null}
      </Screen>
    );
  }

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: 'Scan a lab report' }} />
      <View style={{ alignItems: 'center' }}>
        <Illustration name="empty-no-lab-tests" height={150} label="Scan a lab report" />
      </View>
      <AppText variant="heading" center>
        Scan your lab results
      </AppText>
      <AppText variant="body" tone="muted" center>
        FAITH reads the results table on this phone — no internet needed — and lets you choose which rows to save.
      </AppText>
      {phase.step === 'reading' ? (
        <InlineLoading label={phase.label} />
      ) : (
        <View style={{ gap: SPACE.sm }}>
          <Button title="Take a photo" icon="camera" size="lg" onPress={() => void scan('camera')} />
          <Button title="Choose from gallery" icon="images-outline" variant="secondary" onPress={() => void scan('library')} />
        </View>
      )}
      {error ? <Banner tone="danger" message={error} /> : null}
      <Banner tone="info" icon="bulb-outline" message="Tips: photograph one page at a time, flat and in good light. Printed reports work best." />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.md, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md, minHeight: 56 },
});
