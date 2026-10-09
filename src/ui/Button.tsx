import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from './Text';
import { MIN_TOUCH, RADIUS, SPACE, toneColors, useTheme, type Tone } from './theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export interface ButtonProps {
  title: string;
  onPress: () => void;
  /** `onHero`: outlined white button for use on the purple hero gradient. */
  variant?: 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger' | 'onHero';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  size?: 'md' | 'lg' | 'sm';
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  testID?: string;
}

export function Button({ title, onPress, variant = 'primary', icon, loading, disabled, size = 'md', fullWidth, style, accessibilityHint, testID }: ButtonProps) {
  const { c } = useTheme();
  const inactive = disabled || loading;
  const palette = {
    primary: { bg: c.primary, pressed: c.primaryPressed, fg: c.onPrimary, border: c.primary },
    secondary: { bg: c.surface, pressed: c.surfaceMuted, fg: c.primary, border: c.borderStrong },
    soft: { bg: c.primarySoft, pressed: c.surfaceSunken, fg: c.primary, border: c.primarySoft },
    ghost: { bg: 'transparent', pressed: c.surfaceMuted, fg: c.primary, border: 'transparent' },
    danger: { bg: c.dangerSoft, pressed: c.surfaceSunken, fg: c.danger, border: c.dangerSoft },
    onHero: { bg: 'rgba(255,255,255,0.12)', pressed: 'rgba(255,255,255,0.24)', fg: c.heroText, border: 'rgba(255,255,255,0.7)' },
  }[variant];
  // Small buttons stay 44 tall: the browser ignores hitSlop, and older hands need the full target.
  const height = size === 'lg' ? 56 : size === 'sm' ? 44 : MIN_TOUCH;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      hitSlop={size === 'sm' ? 4 : 0}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: height,
          backgroundColor: pressed ? palette.pressed : palette.bg,
          borderColor: palette.border,
          opacity: inactive ? 0.55 : 1,
          paddingHorizontal: size === 'sm' ? SPACE.md : SPACE.xl,
        },
        fullWidth && { alignSelf: 'stretch' },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Ionicons name={icon} size={size === 'sm' ? 18 : 20} color={palette.fg} /> : null}
          {/* Wrap rather than cut off: a truncated label hides what the button does. */}
          <AppText variant={size === 'sm' ? 'label' : 'bodyStrong'} style={{ color: palette.fg, textAlign: 'center', flexShrink: 1 }} numberOfLines={2}>
            {title}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

export interface IconButtonProps {
  icon: IconName;
  label: string;
  onPress: () => void;
  tone?: Tone;
  size?: number;
  filled?: boolean;
  disabled?: boolean;
}

export function IconButton({ icon, label, onPress, tone = 'neutral', size = 22, filled, disabled }: IconButtonProps) {
  const { c } = useTheme();
  const { fg, bg } = toneColors(c, tone);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.icon,
        { backgroundColor: filled ? bg : pressed ? c.surfaceMuted : 'transparent', opacity: disabled ? 0.4 : 1 },
      ]}>
      <Ionicons name={icon} size={size} color={tone === 'neutral' ? c.text : fg} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  icon: { width: MIN_TOUCH, height: MIN_TOUCH, borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center' },
});
