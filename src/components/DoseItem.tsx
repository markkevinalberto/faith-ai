import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import type { DoseEventWithMedication } from '@/db/repo/doseEvents';
import { DOSE_STATUS_LABEL, EARLY_TAKE_WINDOW_MINUTES, effectiveStatus } from '@/domain/doseStatus';
import { formatLocalTime } from '@/domain/time';
import type { DoseStatus } from '@/domain/types';
import { Button, type IconName } from '@/ui/Button';
import { Pill } from '@/ui/Feedback';
import { AppText } from '@/ui/Text';
import { SPACE, useTheme, type Tone } from '@/ui/theme';

export const STATUS_TONE: Record<DoseStatus, Tone> = {
  upcoming: 'info',
  taken: 'success',
  skipped: 'neutral',
  snoozed: 'warning',
  unconfirmed: 'warning',
};

export const STATUS_ICON: Record<DoseStatus, IconName> = {
  upcoming: 'time-outline',
  taken: 'checkmark-circle',
  skipped: 'remove-circle-outline',
  snoozed: 'alarm-outline',
  unconfirmed: 'help-circle-outline',
};

export function canTakeNow(e: DoseEventWithMedication, now: Date): boolean {
  const s = effectiveStatus(e, now);
  return (s === 'upcoming' || s === 'snoozed' || s === 'unconfirmed') && now.getTime() >= Date.parse(e.scheduledFor) - EARLY_TAKE_WINDOW_MINUTES * 60_000;
}

export function DoseItem({ event, now, locale, onTake }: { event: DoseEventWithMedication; now: Date; locale: string; onTake?: () => void }) {
  const { c } = useTheme();
  const status = effectiveStatus(event, now);
  const title = `${event.medicationName}${event.strength ? ` ${event.strength}` : ''}`;
  const time = formatLocalTime(event.localTime, locale);
  // The row and the "Taken" button are siblings, not nested: a button inside a button is invalid on
  // the web and hides the inner action from screen readers.
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${time}, ${title}, ${DOSE_STATUS_LABEL[status]}`}
        accessibilityHint="Opens dose details"
        onPress={() => router.push({ pathname: '/dose/[id]', params: { id: event.id } })}
        android_ripple={{ color: c.surfaceSunken }}
        style={({ pressed }) => [styles.main, pressed && Platform.OS !== 'android' && { opacity: 0.85 }]}>
        {/* Time sits above the name (not in a side box) so the name keeps the full width at large text sizes. */}
        <View style={{ flex: 1, gap: 4 }}>
          <View style={styles.time}>
            <Ionicons name="time-outline" size={16} color={c.textMuted} />
            <AppText variant="label" tone="muted">
              {time}
            </AppText>
          </View>
          <AppText variant="bodyStrong" numberOfLines={2}>
            {title}
          </AppText>
          <Pill label={status === 'snoozed' && event.snoozedUntil ? `Snoozed until ${new Date(event.snoozedUntil).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}` : DOSE_STATUS_LABEL[status]} tone={STATUS_TONE[status]} icon={STATUS_ICON[status]} />
        </View>
      </Pressable>
      {onTake && canTakeNow(event, now) ? <Button title="Taken" size="sm" variant="soft" icon="checkmark" onPress={onTake} accessibilityHint={`Records ${title} as taken now`} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, minHeight: 68 },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: 68, paddingVertical: SPACE.sm },
  time: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
