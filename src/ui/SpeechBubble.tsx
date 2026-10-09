/**
 * A speech bubble. FAITH's bubbles are white with a small tail pointing up to her mascot (top-left);
 * the person's answers sit on the right in the brand colour, like a chat.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { RADIUS, SPACE, cardShadow, useTheme } from './theme';

export function SpeechBubble({
  children,
  from = 'faith',
  tail = true,
  style,
}: {
  children: ReactNode;
  /** 'faith' = mascot's bubble (left, white); 'person' = the person's reply (right, brand colour). */
  from?: 'faith' | 'person';
  tail?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { c, dark } = useTheme();
  const faith = from === 'faith';
  const bg = faith ? c.surface : c.primary;
  const border = faith ? c.border : c.primary;
  return (
    <View style={[faith ? styles.left : styles.right, tail && { marginTop: 8 }, style]}>
      <View style={[styles.bubble, { backgroundColor: bg, borderColor: border }, faith && cardShadow(dark), !faith && styles.personBubble]}>{children}</View>
      {tail ? <View style={[styles.tail, faith ? styles.tailLeft : styles.tailRight, { backgroundColor: bg, borderColor: border }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  left: { alignSelf: 'stretch' },
  right: { alignSelf: 'flex-end', maxWidth: '80%' },
  bubble: { borderRadius: RADIUS.xl, borderWidth: StyleSheet.hairlineWidth, padding: SPACE.lg, gap: SPACE.md },
  personBubble: { paddingVertical: SPACE.sm + 2, paddingHorizontal: SPACE.lg },
  // A rotated square whose lower half sits inside the bubble, so only its two upper edges show.
  // zIndex/elevation keep it above the bubble's shadow layer on Android too.
  tail: { position: 'absolute', top: -8, width: 18, height: 18, borderTopWidth: StyleSheet.hairlineWidth, borderLeftWidth: StyleSheet.hairlineWidth, transform: [{ rotate: '45deg' }], zIndex: 1, elevation: 2 },
  tailLeft: { left: 30 },
  tailRight: { right: 22 },
});
