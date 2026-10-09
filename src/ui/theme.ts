/**
 * FAITH AI design tokens. Soft lavender surfaces with an indigo-to-blue brand gradient, matching the
 * mascot artwork. Sized for older readers: body text 17, nothing essential below 14. Text colours
 * meet WCAG AA (≥4.5:1) on their intended surfaces, including both ends of the hero gradient;
 * field and button outlines meet 3:1; interactive targets are at least 44–48dp.
 */
import { useMemo } from 'react';
import { Platform, StyleSheet, useColorScheme, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { useTextSize } from './textSize';

export interface Palette {
  bg: string;
  surface: string;
  surfaceMuted: string;
  surfaceSunken: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  primary: string;
  primaryPressed: string;
  primarySoft: string;
  onPrimary: string;
  accent: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  info: string;
  infoSoft: string;
  demo: string;
  demoSoft: string;
  chartLine: string;
  chartSecondary: string;
  chartBand: string;
  chartGrid: string;
  hero: string;
  /** Two-stop gradient used behind hero cards and the brand mark. */
  heroGradient: [string, string];
  heroText: string;
  heroMuted: string;
}

export const LIGHT: Palette = {
  bg: '#F6F5FF',
  surface: '#FFFFFF',
  surfaceMuted: '#EFEDFC',
  surfaceSunken: '#E6E3FA',
  border: '#E1DEF5',
  borderStrong: '#8781B8',
  text: '#1B1F3B',
  textMuted: '#454A6B',
  textSubtle: '#5C6080',
  primary: '#5B4FE0',
  primaryPressed: '#4A3FC4',
  primarySoft: '#ECEAFF',
  onPrimary: '#FFFFFF',
  accent: '#3B82F6',
  success: '#1D7A49',
  successSoft: '#E3F5EA',
  warning: '#8A5300',
  warningSoft: '#FFF1D6',
  danger: '#C0262D',
  dangerSoft: '#FDE8EA',
  info: '#1D4ED8',
  infoSoft: '#E6EEFD',
  demo: '#A8326E',
  demoSoft: '#FCE7F1',
  chartLine: '#5B4FE0',
  chartSecondary: '#3B9EF6',
  chartBand: 'rgba(91,79,224,0.10)',
  chartGrid: '#E8E6F7',
  hero: '#4B40D0',
  heroGradient: ['#5145D6', '#3157D4'],
  heroText: '#FFFFFF',
  heroMuted: '#ECEBFF',
};

export const DARK: Palette = {
  bg: '#0F1022',
  surface: '#181A33',
  surfaceMuted: '#202344',
  surfaceSunken: '#131530',
  border: '#2A2D52',
  borderStrong: '#6A6EA6',
  text: '#ECEBFF',
  textMuted: '#B9B8DA',
  textSubtle: '#9E9DC4',
  primary: '#A39BFF',
  primaryPressed: '#8B82F5',
  primarySoft: '#2A2760',
  onPrimary: '#130F3A',
  accent: '#7FB2FF',
  success: '#6BD39A',
  successSoft: '#14332A',
  warning: '#F2B54B',
  warningSoft: '#3A2C10',
  danger: '#FF8A8F',
  dangerSoft: '#3D1A20',
  info: '#8DB6F5',
  infoSoft: '#18283F',
  demo: '#F59AC3',
  demoSoft: '#3A1C2C',
  chartLine: '#A39BFF',
  chartSecondary: '#7FB2FF',
  chartBand: 'rgba(163,155,255,0.14)',
  chartGrid: '#25284A',
  hero: '#3B348F',
  heroGradient: ['#4239B8', '#2A52AD'],
  heroText: '#F4F3FF',
  heroMuted: '#DCDAFB',
};

export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 44 } as const;
export const RADIUS = { sm: 10, md: 14, lg: 20, xl: 26, pill: 999 } as const;
export const MIN_TOUCH = 48;

const tabular: TextStyle['fontVariant'] = ['tabular-nums'];

/**
 * Type scale at the "Standard" text size. Sentence case throughout: all-caps and wide tracking are
 * harder to read for older eyes, so the eyebrow style (overline) is bold rather than uppercase.
 */
export const TYPE = {
  display: { fontSize: 30, lineHeight: 38, fontWeight: '700', letterSpacing: -0.5 },
  title: { fontSize: 23, lineHeight: 30, fontWeight: '700', letterSpacing: -0.3 },
  heading: { fontSize: 19, lineHeight: 26, fontWeight: '600', letterSpacing: -0.1 },
  body: { fontSize: 17, lineHeight: 26, fontWeight: '400' },
  bodyStrong: { fontSize: 17, lineHeight: 26, fontWeight: '600' },
  label: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  caption: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  overline: { fontSize: 14, lineHeight: 20, fontWeight: '700', letterSpacing: 0.2 },
  metric: { fontSize: 34, lineHeight: 42, fontWeight: '700', letterSpacing: -0.8, fontVariant: tabular },
  metricSmall: { fontSize: 24, lineHeight: 30, fontWeight: '700', letterSpacing: -0.3, fontVariant: tabular },
} satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof TYPE;
export type TypeScale = typeof TYPE;

const round = (n: number) => Math.round(n * 2) / 2;

/** Multiplies font sizes and line heights; everything else (weight, tracking) is unchanged. */
export function scaleType(scale: number): TypeScale {
  if (scale === 1) return TYPE;
  const out = {} as Record<TypeVariant, TextStyle>;
  for (const key of Object.keys(TYPE) as TypeVariant[]) {
    const t: TextStyle = TYPE[key];
    out[key] = { ...t, fontSize: round((t.fontSize ?? 16) * scale), lineHeight: round((t.lineHeight ?? 24) * scale) };
  }
  return out as TypeScale;
}

/** The type scale at the user's chosen text size (Settings → Text size). */
export function useType(): TypeScale {
  const { scale } = useTextSize();
  return useMemo(() => scaleType(scale), [scale]);
}

/** Scales an explicit fontSize/lineHeight passed in a style override, or returns null if there is none. */
export function scaleTextOverride(style: StyleProp<TextStyle>, scale: number): TextStyle | null {
  if (scale === 1 || !style) return null;
  const flat = StyleSheet.flatten(style);
  if (!flat || (flat.fontSize === undefined && flat.lineHeight === undefined)) return null;
  return {
    ...(flat.fontSize !== undefined ? { fontSize: round(flat.fontSize * scale) } : null),
    ...(flat.lineHeight !== undefined ? { lineHeight: round(flat.lineHeight * scale) } : null),
  };
}

export function useTheme(): { c: Palette; dark: boolean } {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  return { c: dark ? DARK : LIGHT, dark };
}

export function cardShadow(dark: boolean): ViewStyle {
  if (dark) return {};
  return Platform.select<ViewStyle>({
    android: { elevation: 1.5 },
    ios: { shadowColor: '#3B2FA0', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
    default: { shadowColor: '#3B2FA0', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  }) as ViewStyle;
}

export type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'demo' | 'neutral';

export function toneColors(c: Palette, tone: Tone): { fg: string; bg: string } {
  switch (tone) {
    case 'primary':
      return { fg: c.primary, bg: c.primarySoft };
    case 'success':
      return { fg: c.success, bg: c.successSoft };
    case 'warning':
      return { fg: c.warning, bg: c.warningSoft };
    case 'danger':
      return { fg: c.danger, bg: c.dangerSoft };
    case 'info':
      return { fg: c.info, bg: c.infoSoft };
    case 'demo':
      return { fg: c.demo, bg: c.demoSoft };
    default:
      return { fg: c.textMuted, bg: c.surfaceMuted };
  }
}
