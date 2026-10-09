import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { DemoBanner, ProfileButton } from '@/components/AppChrome';
import { AppointmentRow, LabRow } from '@/components/CareItems';
import { listAppointments, listLabResults, listLabTests } from '@/db/repo/care';
import { useApp, useProfile } from '@/state/AppState';
import { useQuery } from '@/state/hooks';
import { Button } from '@/ui/Button';
import { EmptyState, InlineLoading } from '@/ui/Feedback';
import { SegmentedControl } from '@/ui/Fields';
import { Card, PageHeader, Screen, Section } from '@/ui/Layout';
import { SPACE } from '@/ui/theme';

export default function CarePlan() {
  const profile = useProfile();
  const { timeZone, locale } = useApp();
  const [tab, setTab] = useState<'appointments' | 'labs'>('appointments');
  const q = useQuery(
    async (d) => {
      const results = await listLabResults(d, profile.id);
      const counts = new Map<string, number>();
      for (const r of results) counts.set(r.labTestId, (counts.get(r.labTestId) ?? 0) + 1);
      return { appts: await listAppointments(d, profile.id), labs: await listLabTests(d, profile.id), counts };
    },
    [profile.id],
  );
  const nowIso = new Date().toISOString();
  const upcomingAppts = q.data?.appts.filter((a) => a.status === 'scheduled' && a.startsAt >= nowIso) ?? [];
  const pastAppts = q.data?.appts.filter((a) => !(a.status === 'scheduled' && a.startsAt >= nowIso)) ?? [];
  const scheduledLabs = q.data?.labs.filter((t) => t.status === 'scheduled') ?? [];
  const doneLabs = q.data?.labs.filter((t) => t.status !== 'scheduled') ?? [];

  const list = (children: React.ReactNode) => (
    <Card padded={false} style={{ paddingHorizontal: SPACE.lg, paddingVertical: SPACE.xs }}>
      {children}
    </Card>
  );

  return (
    <Screen>
      <PageHeader title="Care plan" subtitle="Appointments, lab tests, preparation and results." right={<ProfileButton />} />
      <DemoBanner />
      <SegmentedControl
        options={[
          { value: 'appointments', label: 'Appointments' },
          { value: 'labs', label: 'Lab tests' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {!q.data ? <InlineLoading /> : null}
      {q.data && tab === 'appointments' ? (
        <View style={{ gap: SPACE.lg }}>
          <Button title="Add appointment" icon="add" variant="soft" onPress={() => router.push('/care/appointment/edit')} />
          {upcomingAppts.length === 0 && pastAppts.length === 0 ? (
            <EmptyState icon="calendar-outline" illustration="empty-no-appointments" title="No appointments" message="Add visits with your clinicians. FAITH can remind you and help you prepare questions." />
          ) : null}
          {upcomingAppts.length > 0 ? (
            <Section title="Upcoming">{list(upcomingAppts.map((a) => <AppointmentRow key={a.id} a={a} timeZone={timeZone} locale={locale} />))}</Section>
          ) : null}
          {pastAppts.length > 0 ? <Section title="Past & cancelled">{list(pastAppts.map((a) => <AppointmentRow key={a.id} a={a} timeZone={timeZone} locale={locale} />))}</Section> : null}
        </View>
      ) : null}
      {q.data && tab === 'labs' ? (
        <View style={{ gap: SPACE.lg }}>
          <Button title="Add lab test" icon="add" variant="soft" onPress={() => router.push('/care/lab/edit')} />
          {scheduledLabs.length === 0 && doneLabs.length === 0 ? (
            <EmptyState icon="flask-outline" illustration="empty-no-lab-tests" title="No lab tests" message="Schedule tests with preparation notes, then record results exactly as printed on your report." />
          ) : null}
          {scheduledLabs.length > 0 ? <Section title="Scheduled">{list(scheduledLabs.map((t) => <LabRow key={t.id} t={t} timeZone={timeZone} locale={locale} />))}</Section> : null}
          {doneLabs.length > 0 ? (
            <Section title="Completed & cancelled">{list(doneLabs.map((t) => <LabRow key={t.id} t={t} timeZone={timeZone} locale={locale} resultCount={q.data?.counts.get(t.id)} />))}</Section>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}
