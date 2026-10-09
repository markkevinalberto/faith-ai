import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, type IconName } from './Button';
import { Illustration, type IllustrationName } from './Illustration';
import { AppText } from './Text';
import { RADIUS, SPACE, toneColors, useTheme, type Tone } from './theme';

export function Banner({ tone = 'info', title, message, icon, action }: { tone?: Tone; title?: string; message: string; icon?: IconName; action?: ReactNode }) {
  const { c } = useTheme();
  const { fg, bg } = toneColors(c, tone);
  const defaultIcon: IconName = tone === 'danger' ? 'alert-circle' : tone === 'warning' ? 'warning' : tone === 'success' ? 'checkmark-circle' : tone === 'demo' ? 'flask' : 'information-circle';
  return (
    <View accessibilityRole={tone === 'danger' ? 'alert' : undefined} style={[styles.banner, { backgroundColor: bg }]}>
      <Ionicons name={icon ?? defaultIcon} size={22} color={fg} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, gap: 2 }}>
        {title ? (
          <AppText variant="bodyStrong" style={{ color: fg }}>
            {title}
          </AppText>
        ) : null}
        <AppText variant="caption" style={{ color: tone === 'neutral' ? c.textMuted : c.text }}>
          {message}
        </AppText>
        {action ? <View style={{ marginTop: SPACE.sm, alignItems: 'flex-start' }}>{action}</View> : null}
      </View>
    </View>
  );
}

export function Pill({ label, tone = 'neutral', icon }: { label: string; tone?: Tone; icon?: IconName }) {
  const { c } = useTheme();
  const { fg, bg } = toneColors(c, tone);
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      {icon ? <Ionicons name={icon} size={15} color={fg} /> : null}
      <AppText variant="label" style={{ color: fg, fontSize: 14, lineHeight: 19 }} numberOfLines={3}>
        {label}
      </AppText>
    </View>
  );
}

export function EmptyState({
  icon,
  illustration,
  title,
  message,
  action,
}: {
  icon: IconName;
  illustration?: IllustrationName;
  title: string;
  message: string;
  action?: { label: string; onPress: () => void; icon?: IconName };
}) {
  const { c } = useTheme();
  return (
    // With a picture, FAITH rises out of the top of the box (the wrapper leaves room above it).
    <View style={[styles.empty, { borderColor: c.border, backgroundColor: c.surface }, illustration && { marginTop: EMPTY_RISE, paddingTop: 0 }]}>
      {illustration ? (
        <Illustration name={illustration} height={170} style={{ marginTop: -EMPTY_RISE, marginBottom: SPACE.xs }} />
      ) : (
        <View style={[styles.emptyIcon, { backgroundColor: c.primarySoft }]}>
          <Ionicons name={icon} size={26} color={c.primary} />
        </View>
      )}
      <AppText variant="heading" center>
        {title}
      </AppText>
      <AppText variant="body" tone="muted" center>
        {message}
      </AppText>
      {action ? <Button title={action.label} icon={action.icon ?? 'add'} onPress={action.onPress} style={{ marginTop: SPACE.sm }} /> : null}
    </View>
  );
}

export function LoadingView({ label = 'Loading…' }: { label?: string }) {
  const { c } = useTheme();
  return (
    <SafeAreaView style={[styles.center, { backgroundColor: c.bg }]}>
      <ActivityIndicator size="large" color={c.primary} />
      <AppText variant="body" tone="muted" style={{ marginTop: SPACE.md }}>
        {label}
      </AppText>
    </SafeAreaView>
  );
}

export function InlineLoading({ label }: { label?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ paddingVertical: SPACE.xl, alignItems: 'center', gap: SPACE.sm }}>
      <ActivityIndicator color={c.primary} />
      {label ? (
        <AppText variant="caption" tone="subtle">
          {label}
        </AppText>
      ) : null}
    </View>
  );
}

export function ErrorView({ title, message, onRetry, children }: { title: string; message: string; onRetry?: () => void; children?: ReactNode }) {
  const { c } = useTheme();
  return (
    <SafeAreaView style={[styles.center, { backgroundColor: c.bg, padding: SPACE.xxl }]}>
      <Ionicons name="alert-circle" size={40} color={c.danger} />
      <AppText variant="title" center style={{ marginTop: SPACE.md }}>
        {title}
      </AppText>
      <AppText variant="body" tone="muted" center style={{ marginTop: SPACE.sm }}>
        {message}
      </AppText>
      <View style={{ marginTop: SPACE.xl, gap: SPACE.sm, alignSelf: 'stretch' }}>
        {onRetry ? <Button title="Try again" icon="refresh" onPress={onRetry} /> : null}
        {children}
      </View>
    </SafeAreaView>
  );
}

/** How far an empty-state picture reaches above its box. */
const EMPTY_RISE = 56;

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', gap: SPACE.md, padding: SPACE.md, borderRadius: RADIUS.md },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: SPACE.sm + 2, paddingVertical: 4, borderRadius: RADIUS.pill, alignSelf: 'flex-start', maxWidth: '100%' },
  empty: { alignItems: 'center', gap: SPACE.sm, padding: SPACE.xxl, borderRadius: RADIUS.lg, borderWidth: StyleSheet.hairlineWidth, borderStyle: 'dashed' },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: SPACE.xs },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
