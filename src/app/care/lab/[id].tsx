import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, View } from 'react-native';

import { AttachmentList } from '@/components/CareItems';
import { deleteLabResult, deleteLabTest, getLabTest, listLabResults, setLabStatus } from '@/db/repo/care';
import { formatTargetRange } from '@/domain/targets';
import { formatDateTime, formatLocalDate } from '@/domain/time';
import { deleteDocumentFile } from '@/services/files';
import { useApp, useProfile } from '@/state/AppState';
import { useAction, useQuery } from '@/state/hooks';
import { Button, IconButton } from '@/ui/Button';
import { Banner, EmptyState, InlineLoading, Pill } from '@/ui/Feedback';
import { Card, Divider, Screen, Section } from '@/ui/Layout';
import { AppText } from '@/ui/Text';
import { SPACE } from '@/ui/theme';

export default function LabDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const profile = useProfile();
  const { db, timeZone, locale } = useApp();
  const run = useAction();
  const q = useQuery(async (d) => ({ test: await getLabTest(d, profile.id, id), results: await listLabResults(d, profile.id, id) }), [profile.id, id]);

  if (q.data === undefined) return <InlineLoading />;
  if (!q.data.test) return <EmptyState icon="alert-circle-outline" title="Lab test not found" message="It may have been deleted." />;
  const t = q.data.test;
  const results = q.data.results;

  const remove = () =>
    Alert.alert('Delete lab test?', 'The test, its results and attachments will be permanently deleted from this phone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          void run(async () => {
            const paths = await deleteLabTest(db, profile.id, t.id);
            paths.forEach(deleteDocumentFile);
            router.back();
          }),
      },
    ]);

  const removeResult = (rid: string, analyte: string) =>
    Alert.alert('Delete result?', `Remove the ${analyte} result?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void run(() => deleteLabResult(db, profile.id, rid)) },
    ]);

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: 'Lab test', headerRight: () => <IconButton icon="create-outline" label="Edit lab test" onPress={() => router.push({ pathname: '/care/lab/edit', params: { id: t.id } })} /> }} />
      <View style={{ gap: SPACE.xs }}>
        <AppText variant="title">{t.name}</AppText>
        <AppText variant="body" tone="muted">
          {t.scheduledAt ? formatDateTime(t.scheduledAt, timeZone, locale, { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }) : 'Not scheduled yet'}
          {t.location ? ` · ${t.location}` : ''}
        </AppText>
        <View style={{ flexDirection: 'row', gap: SPACE.xs, flexWrap: 'wrap' }}>
          <Pill label={t.status === 'scheduled' ? 'Scheduled' : t.status === 'completed' ? 'Completed' : 'Cancelled'} tone={t.status === 'scheduled' ? 'info' : t.status === 'completed' ? 'success' : 'neutral'} />
          {t.fastingRequired ? <Pill label="Fasting noted" tone="warning" icon="restaurant-outline" /> : null}
          {t.orderedBy ? <Pill label={`Ordered by ${t.orderedBy}`} /> : null}
        </View>
      </View>
      {t.status === 'scheduled' && (t.preparationNotes || t.fastingRequired) ? (
        <Banner tone="warning" icon="clipboard-outline" title="Preparation" message={`${t.fastingRequired ? 'Fasting was noted for this test. ' : ''}${t.preparationNotes ?? ''} Follow the instructions from your clinic or lab, including whether to take medicines beforehand.`} />
      ) : null}

      <Section title="Results" action={{ label: 'Add result', onPress: () => router.push({ pathname: '/care/lab/result', params: { labId: t.id } }) }}>
        {results.length === 0 ? (
          <Card tone="muted">
            <AppText variant="body" tone="muted">
              No results recorded. When you receive the report, add each value exactly as printed.
            </AppText>
          </Card>
        ) : (
          <Card padded={false} style={{ paddingHorizontal: SPACE.lg, paddingVertical: SPACE.sm }}>
            {results.map((r, i) => {
              const ref = r.referenceText ?? (r.referenceLow !== null || r.referenceHigh !== null ? formatTargetRange(r.referenceLow, r.referenceHigh, r.unit ?? '') : null);
              return (
                <View key={r.id}>
                  {i > 0 ? <Divider /> : null}
                  <Pressable accessibilityRole="button" accessibilityHint="Long press to delete" onLongPress={() => removeResult(r.id, r.analyte)} style={{ paddingVertical: SPACE.sm, gap: 2, minHeight: 56 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: SPACE.sm }}>
                      <AppText variant="bodyStrong" style={{ flex: 1 }}>
                        {r.analyte}
                      </AppText>
                      <AppText variant="bodyStrong">
                        {r.valueNum ?? r.valueText} {r.unit ?? ''}
                      </AppText>
                    </View>
                    <AppText variant="caption" tone="subtle">
                      {formatLocalDate(r.resultDate, locale)}
                      {ref ? ` · Report range: ${ref}` : ''}
                      {r.labFlag ? ` · Flag on report: ${r.labFlag}` : ''}
                    </AppText>
                  </Pressable>
                </View>
              );
            })}
          </Card>
        )}
        <AppText variant="caption" tone="subtle">
          Values and ranges are shown exactly as you entered them from the report. FAITH doesn’t interpret lab results — your clinician does.
        </AppText>
        {results.length > 0 ? <Button title="Explain these terms" icon="sparkles-outline" variant="soft" onPress={() => router.push({ pathname: '/ask', params: { q: `What is ${results[0].analyte}?` } })} /> : null}
      </Section>

      {t.notes ? (
        <Section title="Notes">
          <Card>
            <AppText variant="body">{t.notes}</AppText>
          </Card>
        </Section>
      ) : null}

      <Section title="Report & attachments">
        <AttachmentList profileId={profile.id} labTestId={t.id} />
      </Section>

      <View style={{ gap: SPACE.sm }}>
        {t.status === 'scheduled' ? <Button title="Mark as completed" icon="checkmark-done-outline" variant="secondary" onPress={() => void run(() => setLabStatus(db, profile.id, t.id, 'completed'))} /> : null}
        {t.status === 'scheduled' ? <Button title="Cancel test" icon="close-circle-outline" variant="ghost" onPress={() => void run(() => setLabStatus(db, profile.id, t.id, 'cancelled'))} /> : null}
        {t.status !== 'scheduled' ? <Button title="Mark as scheduled again" icon="refresh" variant="secondary" onPress={() => void run(() => setLabStatus(db, profile.id, t.id, 'scheduled'))} /> : null}
        <Button title="Delete lab test" icon="trash-outline" variant="danger" onPress={remove} />
      </View>
    </Screen>
  );
}
