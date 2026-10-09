import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { createAppointment, getAppointment, updateAppointment } from '@/db/repo/care';
import type { Appointment } from '@/domain/types';
import { useApp, useProfile } from '@/state/AppState';
import { useAction, useQuery } from '@/state/hooks';
import { Button } from '@/ui/Button';
import { InlineLoading } from '@/ui/Feedback';
import { ChipSelect, DateTimeField, TextField } from '@/ui/Fields';
import { FormFooter, Screen } from '@/ui/Layout';
import { APPOINTMENT_REMINDERS } from '@/ui/options';

function defaultStart(): Date {
  const d = new Date(Date.now() + 7 * 86_400_000);
  d.setHours(10, 0, 0, 0);
  return d;
}

export default function AppointmentFormLoader() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const profile = useProfile();
  const existing = useQuery(async (d) => (id ? getAppointment(d, profile.id, id) : null), [profile.id, id]);
  if (id && existing.data === undefined) return <InlineLoading />;
  return <AppointmentForm key={id ?? 'new'} id={id} initial={existing.data ?? null} />;
}

function AppointmentForm({ id, initial: a }: { id?: string; initial: Appointment | null }) {
  const profile = useProfile();
  const { db, timeZone, locale } = useApp();
  const run = useAction();
  const [title, setTitle] = useState(a?.title ?? '');
  const [clinician, setClinician] = useState(a?.clinician ?? '');
  const [location, setLocation] = useState(a?.location ?? '');
  const [startsAt, setStartsAt] = useState(() => (a ? new Date(a.startsAt) : defaultStart()));
  const [duration, setDuration] = useState<number | null>(a ? a.durationMin : 30);
  const [reminder, setReminder] = useState(a ? (a.reminderMinutesBefore ?? -1) : 120);
  const [prep, setPrep] = useState(a?.preparationNotes ?? '');
  const [questions, setQuestions] = useState(a?.questions ?? '');
  const [notes, setNotes] = useState(a?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim()) {
      setError('Give the appointment a short title, e.g. “Diabetes review”.');
      return;
    }
    setSaving(true);
    const input = {
      title,
      clinician,
      location,
      startsAt: startsAt.toISOString(),
      timezone: timeZone,
      durationMin: duration,
      status: a?.status ?? 'scheduled',
      reminderMinutesBefore: reminder < 0 ? null : reminder,
      preparationNotes: prep,
      questions,
      notes,
    };
    const ok = await run(async () => {
      if (id) await updateAppointment(db, profile.id, id, input);
      else await createAppointment(db, profile.id, input);
    });
    setSaving(false);
    if (ok) router.back();
  };

  return (
    <Screen edges={[]} keyboard footer={<FormFooter><Button title={id ? 'Save changes' : 'Add appointment'} icon="checkmark" size="lg" loading={saving} onPress={() => void save()} /></FormFooter>}>
      <Stack.Screen options={{ title: id ? 'Edit appointment' : 'New appointment' }} />
      <TextField label="Title" value={title} onChangeText={setTitle} error={error} placeholder="e.g. Diabetes review" autoCapitalize="sentences" maxLength={100} />
      <DateTimeField label="Date and time" value={startsAt} onChange={setStartsAt} mode="datetime" locale={locale} />
      <ChipSelect
        label="Duration"
        options={[15, 30, 45, 60].map((m) => ({ value: m, label: `${m} min` }))}
        selected={duration ? [duration] : []}
        onToggle={(v) => setDuration(duration === v ? null : v)}
      />
      <TextField label="Clinician (optional)" value={clinician} onChangeText={setClinician} autoCapitalize="words" maxLength={80} />
      <TextField label="Location (optional)" value={location} onChangeText={setLocation} maxLength={120} />
      <ChipSelect label="Reminder" options={APPOINTMENT_REMINDERS} selected={[reminder]} onToggle={setReminder} helper="Reminders are scheduled on this phone." />
      <TextField label="Preparation notes" value={prep} onChangeText={setPrep} multiline placeholder="e.g. Bring glucose meter and medication list" maxLength={1000} />
      <TextField label="Questions to ask" value={questions} onChangeText={setQuestions} multiline maxLength={1000} />
      <TextField label="Notes" value={notes} onChangeText={setNotes} multiline maxLength={1000} />
    </Screen>
  );
}
