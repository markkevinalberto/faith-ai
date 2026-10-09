import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import type { DoseEventWithMedication } from '@/db/repo/doseEvents';
import { DOSE_STATUS_LABEL, EARLY_TAKE_WINDOW_MINUTES, effectiveStatus } from '@/domain/doseStatus';
import { formatLocalTime } from '@/domain/time';
import type { DoseStatus } from '@/domain/types';
import { Button, type IconName } from '@/ui/Button';
import { Pill } from '@/ui/Feedback';
import { AppText } from '@/ui/Text';
import { RADIUS, SPACE, useTheme, type Tone } from '@/ui/theme';

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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${time}, ${title}, ${DOSE_STATUS_LABEL[status]}`}
      accessibilityHint="Opens dose details"
      onPress={() => router.push({ pathname: '/dose/[id]', params: { id: event.id } })}
      android_ripple={{ color: c.surfaceSunken }}
      style={styles.row}>
      <View style={[styles.time, { backgroundColor: c.surfaceMuted }]}>
        <AppText variant="label">{time}</AppText>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {title}
        </AppText>
        <Pill label={status === 'snoozed' && event.snoozedUntil ? `Snoozed until ${new Date(event.snoozedUntil).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}` : DOSE_STATUS_LABEL[status]} tone={STATUS_TONE[status]} icon={STATUS_ICON[status]} />
      </View>
      {onTake && canTakeNow(event, now) ? <Button title="Taken" size="sm" variant="soft" icon="checkmark" onPress={onTake} accessibilityHint={`Records ${title} as taken now`} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: 64, paddingVertical: SPACE.sm },
  time: { minWidth: 72, paddingVertical: SPACE.sm, paddingHorizontal: SPACE.sm, borderRadius: RADIUS.sm, alignItems: 'center' },
});
