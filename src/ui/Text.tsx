import { Text, type TextProps } from 'react-native';

import { TYPE, useTheme, type Palette, type TypeVariant } from './theme';

export type TextTone = 'default' | 'muted' | 'subtle' | 'primary' | 'danger' | 'warning' | 'success' | 'info' | 'demo' | 'onPrimary' | 'hero' | 'heroMuted';

function toneColor(c: Palette, tone: TextTone): string {
  switch (tone) {
    case 'muted':
      return c.textMuted;
    case 'subtle':
      return c.textSubtle;
    case 'primary':
      return c.primary;
    case 'danger':
      return c.danger;
    case 'warning':
      return c.warning;
    case 'success':
      return c.success;
    case 'info':
      return c.info;
    case 'demo':
      return c.demo;
    case 'onPrimary':
      return c.onPrimary;
    case 'hero':
      return c.heroText;
    case 'heroMuted':
      return c.heroMuted;
    default:
      return c.text;
  }
}

export interface AppTextProps extends TextProps {
  variant?: TypeVariant;
  tone?: TextTone;
  center?: boolean;
}

export function AppText({ variant = 'body', tone = 'default', center, style, ...rest }: AppTextProps) {
  const { c } = useTheme();
  return (
    <Text
      maxFontSizeMultiplier={1.8}
      {...rest}
      style={[TYPE[variant], { color: toneColor(c, tone) }, center && { textAlign: 'center' }, style]}
    />
  );
}
