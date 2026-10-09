import { Text, type TextProps } from 'react-native';

import { MAX_TOTAL_TEXT_SCALE, useTextSize } from './textSize';
import { scaleTextOverride, useTheme, useType, type Palette, type TypeVariant } from './theme';

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

/**
 * Text in the app's type scale, sized by the user's text-size choice. An explicit fontSize in `style`
 * is scaled too, so every size grows together. The phone's own font scale still applies on top, up
 * to a combined 1.8×.
 */
export function AppText({ variant = 'body', tone = 'default', center, style, ...rest }: AppTextProps) {
  const { c } = useTheme();
  const type = useType();
  const { scale } = useTextSize();
  return (
    <Text
      maxFontSizeMultiplier={MAX_TOTAL_TEXT_SCALE / scale}
      {...rest}
      style={[type[variant], { color: toneColor(c, tone) }, center && { textAlign: 'center' }, style, scaleTextOverride(style, scale)]}
    />
  );
}
