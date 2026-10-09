import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { createLabTest, getLabTest, updateLabTest } from '@/db/repo/care';
import type { LabTest } from '@/domain/types';
import { useApp, useProfile } from '@/state/AppState';
import { useAction, useQuery } from '@/state/hooks';
import { Button } from '@/ui/Button';
import { InlineLoading } from '@/ui/Feedback';
import { ChipSelect, DateTimeField, TextField, ToggleRow } from '@/ui/Fields';
import { Card, FormFooter, Screen } from '@/ui/Layout';
import { LAB_REMINDERS, LAB_SUGGESTIONS } from '@/ui/options';
import { SPACE } from '@/ui/theme';

function defaultTime(): Date {
  const d = new Date(Date.now() + 7 * 86_400_000);
  d.setHours(8, 0, 0, 0);
  return d;
}

export default function LabFormLoader() {
  // `report=1` opens the form in "I already have the report" mode (from the Lab tests tab).
  const { id, report } = useLocalSearchParams<{ id?: string; report?: string }>();
  const profile = useProfile();
  const existing = useQuery(async (d) => (id ? getLabTest(d, profile.id, id) : null), [profile.id, id]);
  if (id && existing.data === undefined) return <InlineLoading />;
  return <LabForm key={id ?? 'new'} id={id} initial={existing.data ?? null} startWithReport={!id && report === '1'} />;
}

function LabForm({ id, initial: t, startWithReport }: { id?: string; initial: LabTest | null; startWithReport: boolean }) {
  const profile = useProfile();
  const { db, timeZone, locale } = useApp();
  const run = useAction();
  const [name, setName] = useState(t?.name ?? '');
  // New tests: "I already have the report" skips the booking and goes straight to entering values.
  const [haveReport, setHaveReport] = useState(startWithReport);
  const [scheduled, setScheduled] = useState(t ? !!t.scheduledAt : true);
  const [when, setWhen] = useState(() => (t?.scheduledAt ? new Date(t.scheduledAt) : defaultTime()));
  const [location, setLocation] = useState(t?.location ?? '');
  const [orderedBy, setOrderedBy] = useState(t?.orderedBy ?? '');
  const [fasting, setFasting] = useState(t?.fastingRequired ?? false);
  const [prep, setPrep] = useState(t?.preparationNotes ?? '');
  const [reminder, setReminder] = useState(t ? (t.reminderMinutesBefore ?? -1) : 720);
  const [notes, setNotes] = useState(t?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) {
      setError('Enter the test name, e.g. HbA1c.');
      return;
    }
    setSaving(true);
    const booked = scheduled && !haveReport;
    const input = {
      name,
      orderedBy,
      location,
      scheduledAt: booked ? when.toISOString() : null,
      timezone: booked ? timeZone : null,
      fastingRequired: fasting,
      preparationNotes: prep,
      status: t?.status ?? (haveReport ? ('completed' as const) : ('scheduled' as const)),
      reminderMinutesBefore: booked && reminder >= 0 ? reminder : null,
      notes,
    };
    const created = { id: null as string | null };
    const ok = await run(async () => {
      if (id) await updateLabTest(db, profile.id, id, input);
      else created.id = await createLabTest(db, profile.id, input);
    });
    setSaving(false);
    if (!ok) return;
    if (created.id && haveReport) router.replace({ pathname: '/care/lab/add', params: { labId: created.id } });
    else router.back();
  };

  return (
    <Screen edges={[]} keyboard footer={<FormFooter><Button title={id ? 'Save changes' : haveReport ? 'Next: enter the results' : 'Add lab test'} icon={haveReport ? 'arrow-forward' : 'checkmark'} size="lg" loading={saving} onPress={() => void save()} /></FormFooter>}>
      <Stack.Screen options={{ title: id ? 'Edit lab test' : haveReport ? 'Results from a report' : 'New lab test' }} />
      <TextField label="Test name" value={name} onChangeText={setName} error={error} maxLength={100} />
      {!id ? <ChipSelect options={LAB_SUGGESTIONS.map((s) => ({ value: s, label: s }))} selected={[name]} onToggle={setName} /> : null}
      {!id ? (
        <Card padded={false} style={{ paddingHorizontal: SPACE.lg }}>
          <ToggleRow label="I already have the report" description="Skip the booking. You’ll type the values in on the next screen." value={haveReport} onValueChange={setHaveReport} />
        </Card>
      ) : null}
      {!haveReport ? (
        <Card padded={false} style={{ paddingHorizontal: SPACE.lg }}>
          <ToggleRow label="Date is booked" value={scheduled} onValueChange={setScheduled} />
        </Card>
      ) : null}
      {scheduled && !haveReport ? <DateTimeField label="Date and time" value={when} onChange={setWhen} mode="datetime" locale={locale} /> : null}
      <TextField label="Location (optional)" value={location} onChangeText={setLocation} maxLength={120} />
      <TextField label="Ordered by (optional)" value={orderedBy} onChangeText={setOrderedBy} autoCapitalize="words" maxLength={80} />
      <Card padded={false} style={{ paddingHorizontal: SPACE.lg }}>
        <ToggleRow label="Fasting required" description="Only if your clinic or lab told you so." value={fasting} onValueChange={setFasting} />
      </Card>
      <TextField label="Preparation notes" value={prep} onChangeText={setPrep} multiline placeholder="Copy the instructions from your clinic or lab" maxLength={1000} />
      {scheduled && !haveReport ? <ChipSelect label="Reminder" options={LAB_REMINDERS} selected={[reminder]} onToggle={setReminder} /> : null}
      <TextField label="Notes" value={notes} onChangeText={setNotes} multiline maxLength={1000} />
    </Screen>
  );
}
