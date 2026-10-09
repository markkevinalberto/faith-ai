import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DemoBanner, ProfileButton } from '@/components/AppChrome';
import { listTargets } from '@/db/repo/profiles';
import { addCustomType, latestReadings, listCustomTypes, listReadings } from '@/db/repo/vitals';
import { mean } from '@/domain/stats';
import { relativeFromNow } from '@/domain/time';
import { useApp, useProfile } from '@/state/AppState';
import { useAction, useNow, useQuery } from '@/state/hooks';
import { Button } from '@/ui/Button';
import { InlineLoading, Pill } from '@/ui/Feedback';
import { TextField } from '@/ui/Fields';
import { Card, PageHeader, Screen, Section } from '@/ui/Layout';
import { AppText } from '@/ui/Text';
import { RADIUS, SPACE, toneColors, useTheme } from '@/ui/theme';
import { VITAL_META, VITAL_ORDER, assessReading, displayUnit, formatDisplay, positionPill, readingDisplay, toDisplay } from '@/ui/vitals';

export default function Vitals() {
  const profile = useProfile();
  const { db } = useApp();
  const { c } = useTheme();
  const now = useNow();
  const run = useAction();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');

  const q = useQuery(
    async (d) => {
      const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
      return {
        latest: await latestReadings(d, profile.id),
        week: await listReadings(d, profile.id, { fromIso: weekAgo }),
        custom: await listCustomTypes(d, profile.id),
        targets: await listTargets(d, profile.id),
      };
    },
    [profile.id],
  );
  const data = q.data;

  const saveCustom = () =>
    run(async () => {
      if (!name.trim() || !unit.trim()) throw new Error('Enter a name and a unit, for example “Peak flow” and “L/min”.');
      await addCustomType(db, profile.id, name, unit, 1);
      setName('');
      setUnit('');
      setAdding(false);
    });

  return (
    <Screen>
      <PageHeader title="Vitals" subtitle="Log readings and see trends over time." right={<ProfileButton />} />
      <DemoBanner />
      <Button title="Add a reading" icon="add-circle-outline" size="lg" onPress={() => router.push('/vitals/new')} />
      {!data ? <InlineLoading /> : null}
      {data ? (
        <>
          <View style={{ gap: SPACE.md }}>
            {VITAL_ORDER.map((type) => {
              const meta = VITAL_META[type];
              const tone = toneColors(c, meta.tone);
              const latest = data.latest.find((r) => r.type === type);
              const week = data.week.filter((r) => r.type === type);
              const avg =
                type === 'blood_pressure'
                  ? week.length
                    ? `${Math.round(mean(week.map((r) => r.systolic as number)) as number)}/${Math.round(mean(week.map((r) => r.diastolic as number)) as number)}`
                    : null
                  : week.length
                    ? formatDisplay(type, mean(week.map((r) => toDisplay(type, r.valueCanonical as number, profile))) as number, profile)
                    : null;
              const disp = latest ? readingDisplay(latest, profile) : null;
              const a = latest ? assessReading(latest, data.targets, profile.emergencyNumber) : null;
              const pos = a ? positionPill(a.position, a.target) : null;
              return (
                <Card
                  key={type}
                  onPress={() => router.push({ pathname: '/vitals/[type]', params: { type } })}
                  accessibilityLabel={`${meta.label}. ${disp ? `Latest ${disp.value} ${disp.unit}, ${relativeFromNow(latest!.measuredAt, now)}` : 'No readings yet'}`}>
                  <View style={styles.row}>
                    <View style={[styles.icon, { backgroundColor: tone.bg }]}>
                      <Ionicons name={meta.icon} size={22} color={tone.fg} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <AppText variant="bodyStrong">{meta.label}</AppText>
                      {disp && latest ? (
                        <AppText variant="caption" tone="muted">
                          Latest {relativeFromNow(latest.measuredAt, now)}
                          {avg ? ` · 7-day avg ${avg} ${displayUnit(type, profile)} (${week.length})` : ''}
                        </AppText>
                      ) : (
                        <AppText variant="caption" tone="subtle">
                          No readings yet — tap to view or add
                        </AppText>
                      )}
                      {pos ? <Pill label={pos.label} tone={pos.tone} /> : null}
                    </View>
                    {disp ? (
                      <View style={{ alignItems: 'flex-end' }}>
                        <AppText variant="metricSmall">{disp.value}</AppText>
                        <AppText variant="caption" tone="muted">
                          {disp.unit}
                        </AppText>
                      </View>
                    ) : (
                      <Ionicons name="chevron-forward" size={18} color={c.textSubtle} />
                    )}
                  </View>
                </Card>
              );
            })}
          </View>

          <Section title="Other measurements" hint="Track anything else your care team asks for, with its own unit.">
            {data.custom.map((t) => {
              const latest = data.latest.find((r) => r.type === 'custom' && r.customTypeId === t.id);
              return (
                <Card key={t.id} onPress={() => router.push({ pathname: '/vitals/[type]', params: { type: 'custom', customId: t.id } })} accessibilityLabel={t.name}>
                  <View style={styles.row}>
                    <View style={[styles.icon, { backgroundColor: c.surfaceMuted }]}>
                      <Ionicons name="analytics-outline" size={22} color={c.textMuted} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <AppText variant="bodyStrong">{t.name}</AppText>
                      <AppText variant="caption" tone="muted">
                        {latest ? `Latest ${relativeFromNow(latest.measuredAt, now)}` : 'No readings yet'} · unit {t.unit}
                      </AppText>
                    </View>
                    {latest ? (
                      <AppText variant="metricSmall">{readingDisplay(latest, profile, t).value}</AppText>
                    ) : (
                      <Ionicons name="chevron-forward" size={18} color={c.textSubtle} />
                    )}
                  </View>
                </Card>
              );
            })}
            {adding ? (
              <Card style={{ gap: SPACE.md }}>
                <TextField label="Measurement name" value={name} onChangeText={setName} placeholder="e.g. Peak flow" autoCapitalize="sentences" maxLength={40} />
                <TextField label="Unit" value={unit} onChangeText={setUnit} placeholder="e.g. L/min" autoCapitalize="none" maxLength={16} helper="Shown with every value. Units are never converted for custom measurements." />
                <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
                  <Button title="Cancel" variant="ghost" onPress={() => setAdding(false)} style={{ flex: 1 }} />
                  <Button title="Save" icon="checkmark" onPress={() => void saveCustom()} style={{ flex: 1 }} />
                </View>
              </Card>
            ) : (
              <Pressable accessibilityRole="button" onPress={() => setAdding(true)} style={[styles.addRow, { borderColor: c.borderStrong }]}>
                <Ionicons name="add" size={20} color={c.primary} />
                <AppText variant="bodyStrong" tone="primary">
                  Add a measurement type
                </AppText>
              </Pressable>
            )}
          </Section>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  icon: { width: 44, height: 44, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  addRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.sm, minHeight: 52, borderRadius: RADIUS.md, borderWidth: 1, borderStyle: 'dashed' },
});
