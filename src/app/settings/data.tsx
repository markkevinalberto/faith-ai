import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { deleteProfileData, exportProfileData, readingsToCsv } from '@/db/dataManagement';
import { listReadings } from '@/db/repo/vitals';
import { deleteProfileDocuments, shareExport } from '@/services/files';
import { useApp, useProfile } from '@/state/AppState';
import { friendlyError } from '@/state/hooks';
import { Button } from '@/ui/Button';
import { showAlert } from '@/ui/dialog';
import { Banner } from '@/ui/Feedback';
import { Illustration } from '@/ui/Illustration';
import { Card, Screen, Section } from '@/ui/Layout';
import { AppText } from '@/ui/Text';
import { SPACE } from '@/ui/theme';

function safeName(s: string) {
  return s.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'profile';
}

export default function DataSettings() {
  const profile = useProfile();
  const { db, profiles, refreshProfiles, resetAll } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const stamp = new Date().toISOString().slice(0, 10);

  const doExport = async (kind: 'json' | 'csv') => {
    setBusy(kind);
    try {
      if (kind === 'json') {
        const data = await exportProfileData(db, profile.id);
        await shareExport(`faith-ai-${safeName(profile.displayName)}-${stamp}.json`, JSON.stringify(data, null, 2), 'application/json');
      } else {
        const readings = await listReadings(db, profile.id, { order: 'asc', limit: 1_000_000 });
        await shareExport(`faith-ai-readings-${safeName(profile.displayName)}-${stamp}.csv`, readingsToCsv(readings, profile), 'text/csv');
      }
    } catch (e) {
      showAlert('Export failed', friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  const confirmExport = (kind: 'json' | 'csv') =>
    showAlert('Export unencrypted copy?', 'The exported file is NOT encrypted. Only share it with apps or people you trust. FAITH deletes its temporary copy after sharing.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Continue', onPress: () => void doExport(kind) },
    ]);

  const deleteProfile = () =>
    showAlert(`Delete ${profile.displayName}?`, 'Permanently deletes this profile’s readings, medications, dose history, lab tests, appointments, attachments and reminders. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete permanently',
        style: 'destructive',
        onPress: async () => {
          try {
            const res = await deleteProfileData(db, profile.id);
            deleteProfileDocuments(profile.id);
            await refreshProfiles();
            showAlert('Deleted', `All data for this profile was removed (${res.documentPaths.length} attachment file${res.documentPaths.length === 1 ? '' : 's'} deleted).`);
            router.replace(profiles.length > 1 ? '/home' : '/onboarding');
          } catch (e) {
            showAlert('Delete failed', friendlyError(e));
          }
        },
      },
    ]);

  const eraseAll = () =>
    showAlert('Erase everything?', 'Deletes ALL profiles, the encrypted database and its key, attachments and scheduled reminders from this phone. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Erase, keep AI model', style: 'destructive', onPress: () => void resetAll({ keepModels: true }).then(() => router.replace('/onboarding')) },
      { text: 'Erase everything', style: 'destructive', onPress: () => void resetAll({ keepModels: false }).then(() => router.replace('/onboarding')) },
    ]);

  return (
    <Screen edges={[]}>
      <View style={{ alignItems: 'center' }}>
        <Illustration name="status-secure-storage" height={140} label="Secure storage" />
      </View>
      <Section title="How your data is stored">
        <Card style={{ gap: SPACE.sm }}>
          <AppText variant="body">• Everything is stored only on this phone, in a database encrypted with SQLCipher. The key is held in secure hardware-backed storage.</AppText>
          <AppText variant="body">• Attachments are kept in FAITH’s private app storage.</AppText>
          <AppText variant="body">• Nothing is uploaded: no account, no cloud sync, no analytics, no crash reporting. Android cloud backup is disabled for FAITH.</AppText>
          <AppText variant="body">• Data is kept until you delete it. Uninstalling the app also deletes it.</AppText>
        </Card>
      </Section>

      <Section title={`Export · ${profile.displayName}`}>
        {Platform.OS === 'web' ? <Banner tone="info" message="Export is available in the Android and iOS app." /> : null}
        <Button title="Full export (JSON)" icon="code-download-outline" variant="secondary" loading={busy === 'json'} disabled={Platform.OS === 'web'} onPress={() => confirmExport('json')} />
        <Button title="Readings (CSV for spreadsheets)" icon="grid-outline" variant="secondary" loading={busy === 'csv'} disabled={Platform.OS === 'web'} onPress={() => confirmExport('csv')} />
        <AppText variant="caption" tone="subtle">
          JSON includes profile, conditions, targets, medications, every dose event, readings, labs, appointments and attachment names (not file contents).
        </AppText>
      </Section>

      <Section title="Delete">
        <Button title={`Delete ${profile.displayName}’s data`} icon="person-remove-outline" variant="danger" onPress={deleteProfile} />
        <Button title="Erase all data on this phone" icon="nuclear-outline" variant="danger" onPress={eraseAll} />
      </Section>
    </Screen>
  );
}
