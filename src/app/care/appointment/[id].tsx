import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Alert, View } from 'react-native';

import { AttachmentList } from '@/components/CareItems';
import { deleteAppointment, getAppointment, setAppointmentStatus } from '@/db/repo/care';
import { formatDateTime } from '@/domain/time';
import { deleteDocumentFile } from '@/services/files';
import { useApp, useProfile } from '@/state/AppState';
import { useAction, useQuery } from '@/state/hooks';
import { Button, IconButton } from '@/ui/Button';
import { EmptyState, InlineLoading, Pill } from '@/ui/Feedback';
import { Card, Screen, Section } from '@/ui/Layout';
import { AppText } from '@/ui/Text';
import { SPACE } from '@/ui/theme';

export default function AppointmentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const profile = useProfile();
  const { db, timeZone, locale } = useApp();
  const run = useAction();
  const q = useQuery((d) => getAppointment(d, profile.id, id), [profile.id, id]);

  if (q.data === undefined) return <InlineLoading />;
  if (q.data === null) return <EmptyState icon="alert-circle-outline" title="Appointment not found" message="It may have been deleted." />;
  const a = q.data;
  const setStatus = (s: 'scheduled' | 'completed' | 'cancelled') => run(async () => setAppointmentStatus(db, profile.id, a.id, s));
  const remove = () =>
    Alert.alert('Delete appointment?', 'The appointment and its attachments will be permanently deleted from this phone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          void run(async () => {
            const paths = await deleteAppointment(db, profile.id, a.id);
            paths.forEach(deleteDocumentFile);
            router.back();
          }),
      },
    ]);

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: 'Appointment', headerRight: () => <IconButton icon="create-outline" label="Edit appointment" onPress={() => router.push({ pathname: '/care/appointment/edit', params: { id: a.id } })} /> }} />
      <View style={{ gap: SPACE.xs }}>
        <AppText variant="title">{a.title}</AppText>
        <AppText variant="body" tone="muted">
          {formatDateTime(a.startsAt, timeZone, locale, { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })}
          {a.durationMin ? ` · ${a.durationMin} min` : ''}
        </AppText>
        <View style={{ flexDirection: 'row', gap: SPACE.xs, flexWrap: 'wrap' }}>
          <Pill label={a.status === 'scheduled' ? 'Scheduled' : a.status === 'completed' ? 'Completed' : 'Cancelled'} tone={a.status === 'scheduled' ? 'info' : a.status === 'completed' ? 'success' : 'neutral'} />
          {a.reminderMinutesBefore !== null && a.status === 'scheduled' ? <Pill label={`Reminder ${a.reminderMinutesBefore >= 1440 ? `${a.reminderMinutesBefore / 1440} day` : `${a.reminderMinutesBefore} min`} before`} icon="alarm-outline" /> : null}
        </View>
      </View>
      {a.clinician || a.location ? (
        <Card>
          {a.clinician ? <AppText variant="body">With {a.clinician}</AppText> : null}
          {a.location ? (
            <AppText variant="body" tone="muted">
              {a.location}
            </AppText>
          ) : null}
        </Card>
      ) : null}
      <Section title="Preparation">
        <Card>
          <AppText variant="body" tone={a.preparationNotes ? 'default' : 'muted'}>
            {a.preparationNotes ?? 'No preparation notes. Add what to bring or do beforehand.'}
          </AppText>
        </Card>
      </Section>
      <Section title="Questions to ask">
        <Card style={{ gap: SPACE.md }}>
          <AppText variant="body" tone={a.questions ? 'default' : 'muted'}>
            {a.questions ?? 'Write down questions so you don’t forget them during the visit.'}
          </AppText>
          <Button title="Suggest questions from my records" icon="sparkles-outline" variant="soft" onPress={() => router.push({ pathname: '/ask', params: { q: 'Prepare questions for my next appointment' } })} />
        </Card>
      </Section>
      {a.notes ? (
        <Section title="Notes">
          <Card>
            <AppText variant="body">{a.notes}</AppText>
          </Card>
        </Section>
      ) : null}
      <Section title="Attachments">
        <AttachmentList profileId={profile.id} appointmentId={a.id} />
      </Section>
      <View style={{ gap: SPACE.sm }}>
        {a.status === 'scheduled' ? <Button title="Mark as completed" icon="checkmark-done-outline" variant="secondary" onPress={() => void setStatus('completed')} /> : null}
        {a.status === 'scheduled' ? <Button title="Cancel appointment" icon="close-circle-outline" variant="ghost" onPress={() => void setStatus('cancelled')} /> : null}
        {a.status !== 'scheduled' ? <Button title="Mark as scheduled again" icon="refresh" variant="secondary" onPress={() => void setStatus('scheduled')} /> : null}
        <Button title="Delete appointment" icon="trash-outline" variant="danger" onPress={remove} />
      </View>
    </Screen>
  );
}
