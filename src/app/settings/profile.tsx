import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { addCondition, deleteCondition, listConditions, updateProfile } from '@/db/repo/profiles';
import type { GlucoseUnit, TemperatureUnit, WeightUnit } from '@/domain/types';
import { validateProfileName } from '@/domain/validation';
import { useApp, useProfile } from '@/state/AppState';
import { useAction, useQuery } from '@/state/hooks';
import { Button, IconButton } from '@/ui/Button';
import { showAlert } from '@/ui/dialog';
import { ChipSelect, SegmentedControl, TextField } from '@/ui/Fields';
import { Card, Divider, FormFooter, Screen, Section } from '@/ui/Layout';
import { CONDITION_OPTIONS } from '@/ui/options';
import { AppText } from '@/ui/Text';
import { SPACE } from '@/ui/theme';

export default function ProfileSettings() {
  const profile = useProfile();
  const { db, refreshProfiles } = useApp();
  const run = useAction();
  const [name, setName] = useState(profile.displayName);
  const [glucoseUnit, setGlucoseUnit] = useState<GlucoseUnit>(profile.glucoseUnit);
  const [weightUnit, setWeightUnit] = useState<WeightUnit>(profile.weightUnit);
  const [temperatureUnit, setTemperatureUnit] = useState<TemperatureUnit>(profile.temperatureUnit);
  const [emergency, setEmergency] = useState(profile.emergencyNumber ?? '');
  const [error, setError] = useState<string | null>(null);
  const conditions = useQuery((d) => listConditions(d, profile.id), [profile.id]);

  const save = async () => {
    const e = validateProfileName(name);
    setError(e);
    if (e) return;
    const ok = await run(async () => {
      await updateProfile(db, profile.id, { ...profile, displayName: name, glucoseUnit, weightUnit, temperatureUnit, emergencyNumber: emergency.trim() || null });
      await refreshProfiles();
    });
    if (ok) router.back();
  };

  const existing = new Set((conditions.data ?? []).map((c) => c.category));

  return (
    <Screen edges={[]} keyboard footer={<FormFooter><Button title="Save profile" icon="checkmark" size="lg" onPress={() => void save()} /></FormFooter>}>
      <TextField label="Name or nickname" value={name} onChangeText={setName} error={error} autoCapitalize="words" maxLength={80} />
      <SegmentedControl label="Blood glucose unit" options={[{ value: 'mg/dL', label: 'mg/dL' }, { value: 'mmol/L', label: 'mmol/L' }]} value={glucoseUnit} onChange={setGlucoseUnit} />
      <SegmentedControl label="Weight unit" options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]} value={weightUnit} onChange={setWeightUnit} />
      <SegmentedControl label="Temperature unit" options={[{ value: 'C', label: '°C' }, { value: 'F', label: '°F' }]} value={temperatureUnit} onChange={setTemperatureUnit} />
      <AppText variant="caption" tone="subtle">
        Changing units only changes how values are shown. Stored readings keep their original unit and are converted for display.
      </AppText>
      <TextField label="Local emergency number" value={emergency} onChangeText={setEmergency} keyboardType="phone-pad" helper="Shown on urgent safety cards as a Call button." maxLength={16} />

      <Section title="Conditions">
        {(conditions.data ?? []).length > 0 ? (
          <Card padded={false} style={{ paddingHorizontal: SPACE.lg, paddingVertical: SPACE.xs }}>
            {(conditions.data ?? []).map((cnd, i) => (
              <View key={cnd.id}>
                {i > 0 ? <Divider /> : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 52 }}>
                  <AppText variant="body" style={{ flex: 1 }}>
                    {cnd.name}
                  </AppText>
                  <IconButton
                    icon="close"
                    label={`Remove ${cnd.name}`}
                    onPress={() =>
                      showAlert('Remove condition?', cnd.name, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Remove', style: 'destructive', onPress: () => void run(() => deleteCondition(db, profile.id, cnd.id)) },
                      ])
                    }
                  />
                </View>
              </View>
            ))}
          </Card>
        ) : null}
        <ChipSelect
          label="Add a condition"
          options={CONDITION_OPTIONS.filter((o) => !existing.has(o.value))}
          selected={[]}
          onToggle={(v) => void run(async () => void (await addCondition(db, profile.id, { name: CONDITION_OPTIONS.find((o) => o.value === v)?.label ?? v, category: v })))}
        />
      </Section>
    </Screen>
  );
}
