/**
 * Scan a prescription label: photo → on-device OCR (ML Kit) → parser + grounded on-device LLM →
 * review. Nothing is saved here; the reviewed draft pre-fills the medication form.
 */
import { Image } from 'expo-image';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { engineStore } from '@/ai/inference/engineStore';
import { putLabelDraft } from '@/ai/scan/draftStore';
import { extractLabel, type ExtractionMeta } from '@/ai/scan/extract';
import type { LabelDraft } from '@/ai/scan/labelParser';
import { captureImage, recognizeText, type CapturedImage, type ImageSource } from '@/ai/scan/ocr';
import { discardTempFile } from '@/services/files';
import { friendlyError } from '@/state/hooks';
import { Button } from '@/ui/Button';
import { Banner, InlineLoading, Pill } from '@/ui/Feedback';
import { Illustration } from '@/ui/Illustration';
import { Card, FormFooter, Screen } from '@/ui/Layout';
import { AppText } from '@/ui/Text';
import { RADIUS, SPACE, useTheme } from '@/ui/theme';

type Phase = { step: 'pick' } | { step: 'reading'; label: string } | { step: 'review'; image: CapturedImage; ocrText: string; ocrMs: number; draft: LabelDraft; meta: ExtractionMeta };

const FIELDS: { key: keyof LabelDraft; label: string }[] = [
  { key: 'name', label: 'Medication' },
  { key: 'strength', label: 'Strength' },
  { key: 'form', label: 'Form' },
  { key: 'instructions', label: 'Instructions' },
  { key: 'quantity', label: 'Quantity dispensed' },
  { key: 'prescriber', label: 'Prescriber' },
];

export default function ScanLabel() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { c } = useTheme();
  const [phase, setPhase] = useState<Phase>({ step: 'pick' });
  const [error, setError] = useState<string | null>(null);
  const [showText, setShowText] = useState(false);

  const scan = async (source: ImageSource) => {
    setError(null);
    try {
      const image = await captureImage(source);
      if (!image) return;
      setPhase({ step: 'reading', label: 'Reading the label on this phone…' });
      const ocr = await recognizeText(image.uri);
      if (ocr.text.trim().length < 4) throw new Error('No text was found. Try again in good light, holding the phone steady and close to the label.');
      const engine = engineStore.get().status === 'ready' ? engineStore.get().engine : null;
      if (engine) setPhase({ step: 'reading', label: 'Checking the text with the on-device model…' });
      const { draft, meta } = await extractLabel(ocr.text, engine);
      setPhase({ step: 'review', image, ocrText: ocr.text, ocrMs: ocr.durationMs, draft, meta });
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

  const useDetails = () => {
    if (phase.step !== 'review') return;
    putLabelDraft(phase.draft);
    discardTempFile(phase.image.uri);
    if (from === 'edit') router.back();
    else router.replace('/medications/edit');
  };

  if (Platform.OS === 'web') {
    return (
      <Screen edges={[]}>
        <Stack.Screen options={{ title: 'Scan a label' }} />
        <Banner tone="info" message="Label scanning uses the phone camera and on-device text recognition. Open FAITH on Android or iOS to use it." />
      </Screen>
    );
  }

  if (phase.step === 'review') {
    const { draft, meta } = phase;
    const found = FIELDS.filter((f) => draft[f.key] !== null && draft[f.key] !== '').length;
    return (
      <Screen
        edges={[]}
        footer={
          <FormFooter>
            <Button title="Use these details" icon="checkmark" size="lg" disabled={found === 0} onPress={useDetails} />
            <Button title="Scan again" icon="camera-outline" variant="ghost" onPress={retake} />
          </FormFooter>
        }>
        <Stack.Screen options={{ title: 'Check what was read' }} />
        <Banner tone="warning" icon="eye-outline" title="Check every field against the label" message="FAITH copies what is printed. It does not suggest doses. You can edit anything on the next screen." />
        <View style={{ flexDirection: 'row', gap: SPACE.md, alignItems: 'flex-start' }}>
          <Image source={{ uri: phase.image.uri }} style={{ width: 96, height: 128, borderRadius: RADIUS.md, backgroundColor: c.surfaceMuted }} contentFit="cover" accessibilityLabel="Photo of the label" />
          <View style={{ flex: 1, gap: SPACE.xs }}>
            <Pill label={`Text read in ${(phase.ocrMs / 1000).toFixed(1)} s by ML Kit on this phone`} tone="success" icon="scan-outline" />
            {meta.usedModel ? <Pill label={`Missing fields checked by ${meta.modelLabel?.split(' · ')[0] ?? 'the on-device model'}`} tone="primary" icon="hardware-chip-outline" /> : null}
            <AppText variant="caption" tone="muted">
              {found} of {FIELDS.length} fields found. Nothing has been saved.
            </AppText>
          </View>
        </View>
        <Card style={{ gap: SPACE.md }}>
          {FIELDS.map((f) => {
            const v = draft[f.key];
            const ai = meta.aiFilled.includes(f.key);
            return (
              <View key={f.key} style={{ gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
                  <AppText variant="label" tone="muted">
                    {f.label}
                  </AppText>
                  {ai ? <Pill label="Filled by on-device AI" tone="primary" /> : null}
                </View>
                <AppText variant="body" tone={v === null ? 'subtle' : 'default'}>
                  {v === null ? 'Not found — you can type it in' : String(v)}
                </AppText>
              </View>
            );
          })}
          {draft.asNeeded ? <Pill label="Label says “as needed” — no reminders will be set" tone="info" /> : null}
          {draft.suggestedTimes.length ? (
            <View style={{ gap: 2 }}>
              <AppText variant="label" tone="muted">
                Suggested reminder times
              </AppText>
              <AppText variant="body">{draft.suggestedTimes.join(' · ')}</AppText>
              <AppText variant="caption" tone="subtle">
                Based only on how often the label says to take it. Change them to fit your day.
              </AppText>
            </View>
          ) : null}
        </Card>
        {meta.aiDropped.length ? (
          <Banner tone="info" icon="shield-checkmark-outline" message={`The on-device model suggested ${meta.aiDropped.join(', ')}, but that text is not on the label, so FAITH ignored it.`} />
        ) : null}
        {meta.note ? <Banner tone="info" message={meta.note} /> : null}
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
      <Stack.Screen options={{ title: 'Scan a label' }} />
      <View style={{ alignItems: 'center' }}>
        <Illustration name="onboard-add-medication" height={150} label="Scan a medicine label" />
      </View>
      <AppText variant="heading" center>
        Scan your pharmacy label
      </AppText>
      <AppText variant="body" tone="muted" center>
        FAITH reads the text on this phone — no internet needed — and fills in the medication form for you to check.
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
      <Banner tone="info" icon="bulb-outline" message="Tips: flat label, good light, fill the frame. The photo is deleted after scanning." />
    </Screen>
  );
}
