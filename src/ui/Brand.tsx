/** FAITH AI brand: gradient heart mark, wordmark and the hero-card gradient. Vector, so crisp at any size. */
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { AppText } from './Text';
import { useTheme } from './theme';

export const APP_NAME = 'FAITH AI';
export const ASSISTANT_NAME = 'FAITH';
/** What the name stands for. */
export const APP_MEANING = 'Family Assistant for Illness, Treatment & Health';
export const TAGLINE = 'Your health, in your hands. Even offline.';

const MEANING_PARTS: { initial: string; rest: string }[] = [
  { initial: 'F', rest: 'amily ' },
  { initial: 'A', rest: 'ssistant for ' },
  { initial: 'I', rest: 'llness, ' },
  { initial: 'T', rest: 'reatment & ' },
  { initial: 'H', rest: 'ealth' },
];

/** "Family Assistant for Illness, Treatment & Health" with the F-A-I-T-H initials highlighted. */
export function MeaningLine({ center = false }: { center?: boolean }) {
  const { c } = useTheme();
  return (
    <AppText variant="caption" tone="muted" center={center} accessibilityLabel={`FAITH stands for ${APP_MEANING}`}>
      {MEANING_PARTS.map((p) => (
        <AppText key={p.initial} variant="caption" tone="muted">
          <AppText variant="caption" style={{ color: c.primary, fontWeight: '800' }}>
            {p.initial}
          </AppText>
          {p.rest}
        </AppText>
      ))}
    </AppText>
  );
}

const HEART =
  'M12 20.3c-.36 0-.72-.12-1-.36C7.6 17.1 3.4 13.5 3.4 9.1 3.4 6.4 5.5 4.3 8.1 4.3c1.6 0 3 .8 3.9 2.1.9-1.3 2.3-2.1 3.9-2.1 2.6 0 4.7 2.1 4.7 4.8 0 4.4-4.2 8-7.6 10.84-.28.24-.64.36-1 .36z';

export function BrandMark({ size = 48, tile = false }: { size?: number; tile?: boolean }) {
  const { dark } = useTheme();
  const from = dark ? '#7FB2FF' : '#3B82F6';
  const to = dark ? '#B79BFF' : '#7C3AED';
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`${APP_NAME} logo`}
      style={tile ? [styles.tile, { width: size, height: size, borderRadius: size * 0.3, backgroundColor: '#FFFFFF' }] : undefined}>
      <Svg width={tile ? size * 0.72 : size} height={tile ? size * 0.72 : size} viewBox="0 0 24 24">
        <Defs>
          <LinearGradient id="faithHeart" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={from} />
            <Stop offset="1" stopColor={to} />
          </LinearGradient>
        </Defs>
        <Path d={HEART} fill="none" stroke="url(#faithHeart)" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

export function Wordmark({ size = 30, onHero = false }: { size?: number; onHero?: boolean }) {
  const { c } = useTheme();
  return (
    <AppText accessibilityRole="header" style={{ fontSize: size, lineHeight: size * 1.2, fontWeight: '800', letterSpacing: -0.5, color: onHero ? c.heroText : c.text }}>
      FAITH <AppText style={{ fontSize: size, lineHeight: size * 1.2, fontWeight: '800', color: onHero ? c.heroMuted : c.accent }}>AI</AppText>
    </AppText>
  );
}

/** Absolutely-filled brand gradient used behind hero cards. */
export function HeroGradient({ style }: { style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]} importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="faithHero" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={c.heroGradient[0]} />
            <Stop offset="1" stopColor={c.heroGradient[1]} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#faithHero)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center' },
});
