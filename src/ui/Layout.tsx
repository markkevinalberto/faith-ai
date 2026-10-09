import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type RefreshControlProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { HeroGradient } from './Brand';
import type { IconName } from './Button';
import { Illustration, illustrationWidth, type IllustrationName } from './Illustration';
import { AppText } from './Text';
import { useTextSize } from './textSize';
import { RADIUS, SPACE, cardShadow, toneColors, useTheme, type Tone } from './theme';

export interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  refreshControl?: React.ReactElement<RefreshControlProps>;
  contentStyle?: StyleProp<ViewStyle>;
  footer?: ReactNode;
  keyboard?: boolean;
}

/** Page container: safe area, scroll, consistent gutters and max readable width. */
export function Screen({ children, scroll = true, edges = ['top'], refreshControl, contentStyle, footer, keyboard }: ScreenProps) {
  const { c } = useTheme();
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.content, contentStyle]}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
      showsVerticalScrollIndicator={false}>
      <View style={styles.inner}>{children}</View>
    </ScrollView>
  ) : (
    <View style={[styles.content, styles.fill, contentStyle]}>
      <View style={[styles.inner, styles.fill]}>{children}</View>
    </View>
  );
  return (
    <SafeAreaView edges={edges} style={[styles.fill, { backgroundColor: c.bg }]}>
      {keyboard ? (
        <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {body}
          {footer}
        </KeyboardAvoidingView>
      ) : (
        <>
          {body}
          {footer}
        </>
      )}
    </SafeAreaView>
  );
}

export function FormFooter({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  return (
    <SafeAreaView edges={['bottom']} style={{ backgroundColor: c.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }}>
      <View style={[styles.footer]}>{children}</View>
    </SafeAreaView>
  );
}

export function PageHeader({ eyebrow, title, subtitle, right }: { eyebrow?: string; title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      <View style={styles.fill}>
        {eyebrow ? (
          <AppText variant="overline" tone="primary" style={{ marginBottom: 2 }}>
            {eyebrow}
          </AppText>
        ) : null}
        <AppText variant="display" accessibilityRole="header">
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="body" tone="muted" style={{ marginTop: SPACE.xs }}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right ? <View style={{ marginLeft: SPACE.md }}>{right}</View> : null}
    </View>
  );
}

export interface CardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  tone?: 'default' | 'muted' | 'hero' | Tone;
  padded?: boolean;
}

export function Card({ children, style, onPress, accessibilityLabel, accessibilityHint, tone = 'default', padded = true }: CardProps) {
  const { c, dark } = useTheme();
  const bg =
    tone === 'default' ? c.surface : tone === 'muted' ? c.surfaceMuted : tone === 'hero' ? c.hero : toneColors(c, tone as Tone).bg;
  const border = tone === 'default' ? c.border : 'transparent';
  const base: StyleProp<ViewStyle> = [
    styles.card,
    { backgroundColor: bg, borderColor: border },
    tone === 'default' && cardShadow(dark),
    padded && { padding: SPACE.lg },
    style,
  ];
  const content = (
    <>
      {tone === 'hero' ? <HeroGradient /> : null}
      {children}
    </>
  );
  if (!onPress) return <View style={base}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      android_ripple={{ color: c.surfaceSunken }}
      style={({ pressed }) => [base, pressed && Platform.OS !== 'android' && { opacity: 0.9 }]}>
      {content}
    </Pressable>
  );
}

/**
 * A card with FAITH large at its top-left, rising above the card's top edge, so she can be big without
 * making the card tall. `header` sits beside her; `children` (buttons, progress) use the full width
 * below. At the larger text sizes she shrinks a little so the text beside her stays readable.
 */
export function MascotCard({
  art,
  height = 150,
  rise = 44,
  tone,
  onPress,
  accessibilityLabel,
  header,
  children,
  style,
}: {
  art: IllustrationName;
  height?: number;
  /** How far she reaches above the card's top edge. */
  rise?: number;
  tone?: CardProps['tone'];
  onPress?: () => void;
  accessibilityLabel?: string;
  header: ReactNode;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { scale } = useTextSize();
  const h = Math.round(height * (scale > 1 ? 0.85 : 1));
  const w = illustrationWidth(art, h);
  return (
    <View style={[{ paddingTop: rise }, style]}>
      <Card tone={tone} onPress={onPress} accessibilityLabel={accessibilityLabel} style={{ overflow: 'visible', gap: SPACE.md }}>
        {/* The card's padding is SPACE.lg and she stands SPACE.sm from its edge. */}
        <View style={{ paddingLeft: w, minHeight: h - rise - SPACE.lg, justifyContent: 'center', gap: SPACE.xs }}>{header}</View>
        {children}
      </Card>
      {/* Drawn after the card (and raised on Android) so she sits in front of its edge. */}
      <View pointerEvents="none" style={styles.mascot}>
        <Illustration name={art} height={h} />
      </View>
    </View>
  );
}

export function Section({
  title,
  action,
  children,
  hint,
}: {
  title: string;
  action?: { label: string; onPress: () => void; icon?: IconName };
  children: ReactNode;
  hint?: string;
}) {
  const { c } = useTheme();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <AppText variant="heading" accessibilityRole="header" style={styles.fill}>
          {title}
        </AppText>
        {action ? (
          // Shaped like a button, not bare coloured text, so it is recognisable as something to tap.
          <Pressable
            accessibilityRole="button"
            onPress={action.onPress}
            hitSlop={4}
            style={({ pressed }) => [styles.sectionAction, { backgroundColor: pressed ? c.surfaceSunken : c.primarySoft }]}>
            {action.icon ? <Ionicons name={action.icon} size={18} color={c.primary} /> : null}
            <AppText variant="label" tone="primary">
              {action.label}
            </AppText>
          </Pressable>
        ) : null}
      </View>
      {hint ? (
        <AppText variant="caption" tone="subtle" style={{ marginTop: -SPACE.xs, marginBottom: SPACE.sm }}>
          {hint}
        </AppText>
      ) : null}
      <View style={{ gap: SPACE.md }}>{children}</View>
    </View>
  );
}

export interface ListRowProps {
  icon?: IconName;
  iconTone?: Tone;
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  right?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  chevron?: boolean;
}

export function ListRow({ icon, iconTone = 'primary', title, subtitle, meta, right, onPress, accessibilityLabel, chevron = !!onPress }: ListRowProps) {
  const { c } = useTheme();
  const { fg, bg } = toneColors(c, iconTone);
  const content = (
    <View style={styles.row}>
      {icon ? (
        <View style={[styles.rowIcon, { backgroundColor: bg }]}>
          <Ionicons name={icon} size={20} color={fg} />
        </View>
      ) : null}
      <View style={styles.fill}>
        <AppText variant="bodyStrong" numberOfLines={3}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" tone="muted">
            {subtitle}
          </AppText>
        ) : null}
        {meta ? (
          <AppText variant="caption" tone="subtle">
            {meta}
          </AppText>
        ) : null}
      </View>
      {right}
      {chevron ? <Ionicons name="chevron-forward" size={18} color={c.textSubtle} /> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [title, subtitle, meta].filter(Boolean).join(', ')}
      onPress={onPress}
      android_ripple={{ color: c.surfaceSunken }}
      style={({ pressed }) => [{ borderRadius: RADIUS.md }, pressed && Platform.OS !== 'android' && { backgroundColor: c.surfaceMuted }]}>
      {content}
    </Pressable>
  );
}

export function Divider() {
  const { c } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border, marginVertical: SPACE.xs }} />;
}

export function Stat({ label, value, unit, caption, tone = 'default' }: { label: string; value: string; unit?: string; caption?: string | null; tone?: 'default' | 'hero' }) {
  const hero = tone === 'hero';
  return (
    <View accessible accessibilityLabel={`${label}: ${value}${unit ? ` ${unit}` : ''}${caption ? `. ${caption}` : ''}`}>
      <AppText variant="overline" tone={hero ? 'heroMuted' : 'subtle'}>
        {label}
      </AppText>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 2 }}>
        <AppText variant="metricSmall" tone={hero ? 'hero' : 'default'}>
          {value}
        </AppText>
        {unit ? (
          <AppText variant="caption" tone={hero ? 'heroMuted' : 'muted'}>
            {unit}
          </AppText>
        ) : null}
      </View>
      {caption ? (
        <AppText variant="caption" tone={hero ? 'heroMuted' : 'subtle'} numberOfLines={3}>
          {caption}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: SPACE.lg, paddingBottom: SPACE.huge, paddingTop: SPACE.sm },
  inner: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: SPACE.lg },
  footer: { paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md, gap: SPACE.sm, width: '100%', maxWidth: 720, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'flex-end', paddingTop: SPACE.md, paddingBottom: SPACE.xs },
  card: { borderRadius: RADIUS.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  mascot: { position: 'absolute', left: SPACE.sm, top: 0, zIndex: 2, elevation: 4 },
  section: { gap: SPACE.sm, marginTop: SPACE.xs },
  sectionHead: { flexDirection: 'row', alignItems: 'center', minHeight: 32, gap: SPACE.sm },
  sectionAction: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: SPACE.md, borderRadius: RADIUS.pill },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: 56, paddingVertical: SPACE.sm },
  rowIcon: { width: 40, height: 40, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
});
