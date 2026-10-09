import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, View } from 'react-native';

import { useEngineState } from '@/ai/inference/engineStore';
import { getModelSpec } from '@/ai/inference/modelCatalog';
import { PROVIDERS, isOnlineConfigured, loadOnlineSettings, useOnlineSettings } from '@/ai/inference/onlineAssistant';
import { initials } from '@/components/AppChrome';
import { TextSizePicker } from '@/components/TextSizePicker';
import { deleteProfileData } from '@/db/dataManagement';
import { SETTINGS, setSetting, updateProfile } from '@/db/repo/profiles';
import { seedDemoProfile } from '@/services/demoSeed';
import { deleteProfileDocuments } from '@/services/files';
import { getNotificationPermission, openSystemSettings, requestNotificationPermission } from '@/services/notifications';
import { useApp, useProfile } from '@/state/AppState';
import { useAppLock } from '@/state/AppLock';
import { friendlyError, useAction, useQuery } from '@/state/hooks';
import { Button } from '@/ui/Button';
import { showAlert } from '@/ui/dialog';
import { Banner, Pill } from '@/ui/Feedback';
import { ToggleRow } from '@/ui/Fields';
import { Card, Divider, ListRow, Screen, Section } from '@/ui/Layout';
import { AppText } from '@/ui/Text';
import { RADIUS, SPACE, useTheme } from '@/ui/theme';

export default function Settings() {
  const profile = useProfile();
  const { db, profiles, encryption, timeZone, locale, setActiveProfile, refreshProfiles } = useApp();
  const lock = useAppLock();
  const engine = useEngineState();
  const { c } = useTheme();
  const run = useAction();
  const [busy, setBusy] = useState(false);
  const permission = useQuery(async () => (Platform.OS === 'web' ? 'denied' : await getNotificationPermission()), []);
  const demo = profiles.find((p) => p.isDemo);

  const toggle = (patch: { remindersEnabled?: boolean; reminderPrivacy?: boolean }) =>
    run(async () => {
      await updateProfile(db, profile.id, { ...profile, ...patch });
      await refreshProfiles();
    });

  const addDemo = async () => {
    setBusy(true);
    try {
      const p = await seedDemoProfile(db, { now: new Date(), timeZone, locale });
      await setSetting(db, SETTINGS.activeProfileId, p.id);
      await refreshProfiles();
      router.replace('/home');
    } catch (e) {
      showAlert("Couldn't create sample data", friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const removeDemo = () => {
    if (!demo) return;
    showAlert('Remove sample profile?', 'All fictional sample data will be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () =>
          void run(async () => {
            await deleteProfileData(db, demo.id);
            deleteProfileDocuments(demo.id);
            await refreshProfiles();
            if (profiles.length <= 1) router.replace('/onboarding');
          }),
      },
    ]);
  };

  const toggleLock = async (v: boolean) => {
    const r = await lock.setEnabled(v);
    if (!r.ok && r.reason) showAlert('App lock', r.reason);
  };

  const askPermission = async () => {
    const p = await requestNotificationPermission();
    if (p !== 'granted') openSystemSettings();
    permission.reload();
  };

  const activeModel = engine.modelId ? getModelSpec(engine.modelId) : null;
  const online = useOnlineSettings();
  useEffect(() => {
    void loadOnlineSettings(db).catch(() => undefined);
  }, [db]);

  return (
    <Screen edges={[]}>
      <Card onPress={() => router.push('/settings/profile')} accessibilityLabel={`Edit profile ${profile.displayName}`}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: profile.isDemo ? c.demoSoft : c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            <AppText variant="heading" style={{ color: profile.isDemo ? c.demo : c.primary }}>
              {initials(profile.displayName)}
            </AppText>
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="heading">{profile.displayName}</AppText>
            <AppText variant="caption" tone="muted">
              {profile.glucoseUnit} · {profile.weightUnit} · °{profile.temperatureUnit} · {timeZone}
            </AppText>
            {profile.isDemo ? <Pill label="Sample data" tone="demo" icon="flask-outline" /> : null}
          </View>
          <Ionicons name="chevron-forward" size={18} color={c.textSubtle} />
        </View>
      </Card>

      <Section title="Display">
        <Card>
          <TextSizePicker />
        </Card>
      </Section>

      <Section title="Profiles" hint="Each family member has separate records. Data is never mixed between profiles.">
        <Card padded={false} style={{ paddingHorizontal: SPACE.lg, paddingVertical: SPACE.xs }}>
          {profiles.map((p, i) => (
            <View key={p.id}>
              {i > 0 ? <Divider /> : null}
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected: p.id === profile.id }}
                accessibilityLabel={`Switch to ${p.displayName}`}
                onPress={() => void setActiveProfile(p.id)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: 56 }}>
                <Ionicons name={p.id === profile.id ? 'radio-button-on' : 'radio-button-off'} size={22} color={p.id === profile.id ? c.primary : c.textSubtle} />
                <AppText variant="bodyStrong" style={{ flex: 1 }}>
                  {p.displayName}
                </AppText>
                {p.isDemo ? <Pill label="Sample" tone="demo" /> : null}
              </Pressable>
            </View>
          ))}
        </Card>
        <Button title="Add a family member" icon="person-add-outline" variant="secondary" onPress={() => router.push({ pathname: '/onboarding/profile', params: { mode: 'add' } })} />
        {demo ? (
          <Button title="Remove sample profile" icon="trash-outline" variant="ghost" onPress={removeDemo} />
        ) : (
          <Button title="Add sample data profile" icon="flask-outline" variant="ghost" loading={busy} onPress={() => void addDemo()} />
        )}
      </Section>

      <Section title="Health targets">
        <Card padded={false} style={{ paddingHorizontal: SPACE.lg }}>
          <ListRow icon="locate-outline" title="Target ranges" subtitle="Record the ranges your clinician set. Otherwise general reference ranges are shown and labelled." onPress={() => router.push('/settings/targets')} />
        </Card>
      </Section>

      <Section title="Reminders">
        <Card padded={false} style={{ paddingHorizontal: SPACE.lg }}>
          <ToggleRow label="Reminders for this profile" description={profile.isDemo ? 'Sample profiles never schedule reminders.' : 'Doses, refills, lab tests and appointments.'} value={profile.remindersEnabled && !profile.isDemo} disabled={profile.isDemo} onValueChange={(v) => void toggle({ remindersEnabled: v })} />
          <Divider />
          <ToggleRow label="Hide medicine names" description="Lock-screen notifications say “Medication reminder” only." value={profile.reminderPrivacy} onValueChange={(v) => void toggle({ reminderPrivacy: v })} />
        </Card>
        {Platform.OS !== 'web' && permission.data && permission.data !== 'granted' ? (
          <Banner tone="warning" title="Notifications are not allowed" message="FAITH can't show reminders until you allow notifications." action={<Button title="Allow notifications" size="sm" onPress={() => void askPermission()} />} />
        ) : null}
        {Platform.OS === 'android' ? (
          <AppText variant="caption" tone="subtle">
            For on-time reminders, allow “Alarms & reminders” for FAITH in Android settings. Battery savers on some phones can delay notifications.{' '}
            <AppText variant="caption" tone="primary" onPress={() => void Linking.openSettings()} accessibilityRole="link">
              Open app settings
            </AppText>
          </AppText>
        ) : null}
      </Section>

      <Section title="Security & privacy">
        <Card padded={false} style={{ paddingHorizontal: SPACE.lg }}>
          <ToggleRow label="App lock" description="Require your fingerprint, face or phone PIN to open FAITH." value={lock.enabled} onValueChange={(v) => void toggleLock(v)} disabled={Platform.OS === 'web'} />
          <Divider />
          <View style={{ flexDirection: 'row', gap: SPACE.md, alignItems: 'center', minHeight: 64 }}>
            <Ionicons name={encryption.active ? 'shield-checkmark' : 'shield-outline'} size={22} color={encryption.active ? c.success : c.warning} />
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong">{encryption.active ? 'Database encrypted' : 'Encryption unavailable'}</AppText>
              <AppText variant="caption" tone="muted">
                {encryption.active ? `SQLCipher ${encryption.cipherVersion} · key stored in Android Keystore-backed secure storage` : encryption.reason}
              </AppText>
            </View>
          </View>
        </Card>
      </Section>

      <Section title="AI">
        <Card padded={false} style={{ paddingHorizontal: SPACE.lg }}>
          <ListRow
            icon="hardware-chip-outline"
            title="On-device models"
            subtitle={engine.status === 'ready' ? `${activeModel?.name ?? 'Model'} loaded — runs on this phone` : 'Not loaded. FAITH still answers from your records without it.'}
            onPress={() => router.push('/settings/model')}
          />
          <Divider />
          <ListRow
            icon="cloud-outline"
            iconTone="info"
            title="Online assistant (optional)"
            subtitle={
              isOnlineConfigured(online)
                ? `On · ${PROVIDERS[online!.provider].label} ${online!.model}. Used when you have internet; your question and the facts shown are sent there.`
                : 'Off. Clearer answers from a bigger online model when you have internet. One tap, no key needed.'
            }
            onPress={() => router.push('/settings/online')}
          />
        </Card>
      </Section>

      <Section title="Data">
        <Card padded={false} style={{ paddingHorizontal: SPACE.lg }}>
          <ListRow icon="download-outline" title="Export or delete your data" subtitle="Download a copy, delete a profile, or erase everything." onPress={() => router.push('/settings/data')} />
          <Divider />
          <ListRow icon="information-circle-outline" title="About & disclosures" subtitle="Medical disclaimer, privacy, sources, models and tools used." onPress={() => router.push('/settings/about')} />
        </Card>
      </Section>
      <View style={{ height: SPACE.md, borderRadius: RADIUS.sm }} />
    </Screen>
  );
}
