import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { SETTINGS, addCondition, createProfile, setSetting } from '@/db/repo/profiles';
import type { ConditionCategory, GlucoseUnit, TemperatureUnit, WeightUnit } from '@/domain/types';
import { validateProfileName } from '@/domain/validation';
import { currentRegion, defaultUnits } from '@/services/device';
import { useApp } from '@/state/AppState';
import { friendlyError } from '@/state/hooks';
import { Button } from '@/ui/Button';
import { showAlert } from '@/ui/dialog';
import { ChipSelect, SegmentedControl, TextField, ToggleRow } from '@/ui/Fields';
import { Card, FormFooter, Screen, Section } from '@/ui/Layout';
import { Illustration } from '@/ui/Illustration';
import { CONDITION_OPTIONS } from '@/ui/options';
import { AppText } from '@/ui/Text';
import { SPACE } from '@/ui/theme';

export default function ProfileSetup() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const adding = mode === 'add';
  const { db, timeZone, locale, refreshProfiles } = useApp();
  const defaults = defaultUnits(currentRegion());
  const [name, setName] = useState('');
  const [conditions, setConditions] = useState<ConditionCategory[]>([]);
  const [glucoseUnit, setGlucoseUnit] = useState<GlucoseUnit>(defaults.glucoseUnit);
  const [weightUnit, setWeightUnit] = useState<WeightUnit>(defaults.weightUnit);
  const [temperatureUnit, setTemperatureUnit] = useState<TemperatureUnit>(defaults.temperatureUnit);
  const [emergency, setEmergency] = useState('');
  const [privacy, setPrivacy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const nameError = validateProfileName(name);
    setError(nameError);
    if (nameError) return;
    setSaving(true);
    try {
      const p = await createProfile(db, {
        displayName: name,
        locale,
        timezone: timeZone,
        glucoseUnit,
        weightUnit,
        temperatureUnit,
        emergencyNumber: emergency.trim() || null,
        reminderPrivacy: privacy,
      });
      for (const cat of conditions) {
        await addCondition(db, p.id, { name: CONDITION_OPTIONS.find((o) => o.value === cat)?.label ?? cat, category: cat });
      }
      await setSetting(db, SETTINGS.activeProfileId, p.id);
      await refreshProfiles();
      if (adding) router.back();
      else router.replace('/home');
    } catch (e) {
      showAlert("Couldn't create profile", friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen edges={[]} keyboard footer={<FormFooter><Button title={adding ? 'Add profile' : 'Continue'} icon="checkmark" size="lg" loading={saving} onPress={() => void save()} /></FormFooter>}>
      <View style={{ alignItems: 'center', marginTop: SPACE.sm }}>
        <Illustration name="onboard-setup-profile" height={140} />
      </View>
      <AppText variant="body" tone="muted">
        {adding
          ? 'Each person gets a separate profile. Records are never mixed between profiles.'
          : 'Only a name is required. Everything stays on this phone and you can change it later.'}
      </AppText>
      <TextField label="Name or nickname" value={name} onChangeText={setName} autoCapitalize="words" error={error} maxLength={80} autoFocus />
      <ChipSelect
        label="Conditions you manage (optional)"
        options={CONDITION_OPTIONS}
        selected={conditions}
        onToggle={(v) => setConditions((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]))}
        helper="Used to tailor the dashboard and suggestions. FAITH does not diagnose."
      />
      <Section title="Units">
        <SegmentedControl label="Blood glucose" options={[{ value: 'mg/dL', label: 'mg/dL' }, { value: 'mmol/L', label: 'mmol/L' }]} value={glucoseUnit} onChange={setGlucoseUnit} />
        <SegmentedControl label="Weight" options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]} value={weightUnit} onChange={setWeightUnit} />
        <SegmentedControl label="Temperature" options={[{ value: 'C', label: '°C' }, { value: 'F', label: '°F' }]} value={temperatureUnit} onChange={setTemperatureUnit} />
      </Section>
      <Section title="Safety & privacy">
        <TextField
          label="Local emergency number (optional)"
          value={emergency}
          onChangeText={setEmergency}
          keyboardType="phone-pad"
          helper="For example 911, 112, 999 or 000. Used for the Call button on urgent safety cards."
          maxLength={16}
        />
        <Card tone="muted" padded={false} style={{ paddingHorizontal: SPACE.lg }}>
          <ToggleRow
            label="Hide medicine names in notifications"
            description="Lock-screen reminders will say “Medication reminder” instead of the medicine name."
            value={privacy}
            onValueChange={setPrivacy}
          />
        </Card>
      </Section>
    </Screen>
  );
}
