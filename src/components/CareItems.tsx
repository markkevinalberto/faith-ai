import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { addDocument, deleteDocument, listDocuments } from '@/db/repo/care';
import type { Appointment, LabTest } from '@/domain/types';
import { deleteDocumentFile, openDocument, pickAndStoreDocument } from '@/services/files';
import { useApp } from '@/state/AppState';
import { friendlyError, useAction, useQuery } from '@/state/hooks';
import { Button, IconButton } from '@/ui/Button';
import { showAlert } from '@/ui/dialog';
import { Pill } from '@/ui/Feedback';
import { AppText } from '@/ui/Text';
import { RADIUS, SPACE, useTheme } from '@/ui/theme';

export function DateBadge({ iso, timeZone, locale, muted }: { iso: string; timeZone: string; locale: string; muted?: boolean }) {
  const { c } = useTheme();
  const d = new Date(iso);
  const month = new Intl.DateTimeFormat(locale, { month: 'short', timeZone }).format(d);
  const day = new Intl.DateTimeFormat(locale, { day: 'numeric', timeZone }).format(d);
  return (
    <View style={[styles.badge, { backgroundColor: muted ? c.surfaceMuted : c.primarySoft }]} importantForAccessibility="no-hide-descendants">
      <AppText variant="overline" tone={muted ? 'subtle' : 'primary'}>
        {month}
      </AppText>
      <AppText variant="metricSmall" tone={muted ? 'muted' : 'primary'} style={{ lineHeight: 26 }}>
        {day}
      </AppText>
    </View>
  );
}

function when(iso: string, timeZone: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone }).format(new Date(iso));
}

export function AppointmentRow({ a, timeZone, locale }: { a: Appointment; timeZone: string; locale: string }) {
  const { c } = useTheme();
  const past = a.status !== 'scheduled';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${a.title}, ${new Date(a.startsAt).toLocaleString(locale)}${a.status !== 'scheduled' ? `, ${a.status}` : ''}`}
      onPress={() => router.push({ pathname: '/care/appointment/[id]', params: { id: a.id } })}
      android_ripple={{ color: c.surfaceSunken }}
      style={styles.row}>
      <DateBadge iso={a.startsAt} timeZone={timeZone} locale={locale} muted={past} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bodyStrong" numberOfLines={2} style={a.status === 'cancelled' ? { textDecorationLine: 'line-through' } : undefined}>
          {a.title}
        </AppText>
        <AppText variant="caption" tone="muted">
          {when(a.startsAt, timeZone, locale)}
          {a.clinician ? ` · ${a.clinician}` : ''}
        </AppText>
        {a.status !== 'scheduled' ? <Pill label={a.status === 'completed' ? 'Completed' : 'Cancelled'} tone={a.status === 'completed' ? 'success' : 'neutral'} /> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={c.textSubtle} />
    </Pressable>
  );
}

export function LabRow({ t, timeZone, locale, resultCount }: { t: LabTest; timeZone: string; locale: string; resultCount?: number }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Lab test ${t.name}, ${t.status}`}
      onPress={() => router.push({ pathname: '/care/lab/[id]', params: { id: t.id } })}
      android_ripple={{ color: c.surfaceSunken }}
      style={styles.row}>
      {t.scheduledAt ? (
        <DateBadge iso={t.scheduledAt} timeZone={timeZone} locale={locale} muted={t.status !== 'scheduled'} />
      ) : (
        <View style={[styles.badge, { backgroundColor: c.surfaceMuted }]}>
          <Ionicons name="flask-outline" size={22} color={c.textSubtle} />
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bodyStrong" numberOfLines={2}>
          {t.name}
        </AppText>
        <AppText variant="caption" tone="muted">
          {t.status === 'scheduled' ? (t.scheduledAt ? when(t.scheduledAt, timeZone, locale) : 'Not scheduled yet') : t.status === 'completed' ? `Completed${resultCount ? ` · ${resultCount} result${resultCount === 1 ? '' : 's'}` : ''}` : 'Cancelled'}
        </AppText>
        {t.status === 'scheduled' && t.fastingRequired ? <Pill label="Fasting noted" tone="warning" icon="restaurant-outline" /> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={c.textSubtle} />
    </Pressable>
  );
}

/** Attachments stored in private app storage; opening uses the system share sheet (explicit user action). */
export function AttachmentList({ profileId, labTestId, appointmentId }: { profileId: string; labTestId?: string; appointmentId?: string }) {
  const { db } = useApp();
  const run = useAction();
  const docs = useQuery((d) => listDocuments(d, profileId, { labTestId, appointmentId }), [profileId, labTestId, appointmentId]);
  const add = () =>
    run(async () => {
      const stored = await pickAndStoreDocument(profileId);
      if (!stored) return;
      try {
        await addDocument(db, profileId, { ...stored, labTestId: labTestId ?? null, appointmentId: appointmentId ?? null });
      } catch (e) {
        deleteDocumentFile(stored.relativePath);
        throw e;
      }
    }, { errorTitle: "Couldn't attach file" });
  const remove = (id: string, title: string) =>
    showAlert('Delete attachment?', `“${title}” will be permanently deleted from this phone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          void run(async () => {
            const path = await deleteDocument(db, profileId, id);
            deleteDocumentFile(path);
          }),
      },
    ]);
  return (
    <View style={{ gap: SPACE.xs }}>
      {(docs.data ?? []).map((d) => (
        <View key={d.id} style={styles.row}>
          <Ionicons name={d.mimeType === 'application/pdf' ? 'document-text-outline' : 'image-outline'} size={22} color="#5A6C65" />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${d.title}`}
            style={{ flex: 1, minHeight: 48, justifyContent: 'center' }}
            onPress={() => openDocument(d.relativePath, d.mimeType).catch((e) => showAlert("Couldn't open file", friendlyError(e)))}>
            <AppText variant="bodyStrong" numberOfLines={1}>
              {d.title}
            </AppText>
            <AppText variant="caption" tone="subtle">
              {d.sizeBytes ? `${Math.max(1, Math.round(d.sizeBytes / 1024))} KB · ` : ''}Stored privately on this phone
            </AppText>
          </Pressable>
          <IconButton icon="trash-outline" label={`Delete ${d.title}`} tone="danger" onPress={() => remove(d.id, d.title)} />
        </View>
      ))}
      {Platform.OS === 'web' ? (
        <AppText variant="caption" tone="subtle">
          Attachments are available in the Android and iOS app.
        </AppText>
      ) : (
        <Button title="Attach report or photo" icon="attach" variant="secondary" onPress={() => void add()} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { width: 56, height: 60, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: 64, paddingVertical: SPACE.xs },
});
