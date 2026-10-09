import Ionicons from '@expo/vector-icons/Ionicons';
import { Linking, StyleSheet, View } from 'react-native';

import { getSource } from '../ai/knowledge/sources';
import type { EscalationResult } from '../domain/escalation';
import { Button } from './Button';
import { AppText } from './Text';
import { RADIUS, SPACE, useTheme } from './theme';

/** Prominent safety card. Never reassures; always points to professional or emergency help. */
export function EscalationCard({ result, emergencyNumber }: { result: EscalationResult; emergencyNumber: string | null }) {
  const { c } = useTheme();
  const severe = result.level === 'emergency' || result.level === 'urgent';
  const fg = severe ? c.danger : c.warning;
  const bg = severe ? c.dangerSoft : c.warningSoft;
  const sources = result.sourceIds.map((id) => getSource(id)?.publisher.split('(')[0].trim()).filter(Boolean);
  return (
    <View accessibilityRole="alert" style={[styles.card, { backgroundColor: bg, borderColor: fg }]}>
      <View style={styles.head}>
        <Ionicons name={severe ? 'alert-circle' : 'warning'} size={26} color={fg} />
        <AppText variant="heading" style={{ color: fg, flex: 1 }}>
          {result.title}
        </AppText>
      </View>
      <AppText variant="body">{result.message}</AppText>
      <View style={{ gap: SPACE.xs }}>
        {result.actions.map((a, i) => (
          <View key={i} style={styles.step}>
            <AppText variant="bodyStrong" style={{ color: fg, width: 20 }}>
              {i + 1}.
            </AppText>
            <AppText variant="body" style={{ flex: 1 }}>
              {a}
            </AppText>
          </View>
        ))}
      </View>
      {severe && emergencyNumber ? (
        <Button
          title={`Call ${emergencyNumber}`}
          icon="call"
          variant="primary"
          onPress={() => void Linking.openURL(`tel:${emergencyNumber.replace(/[^0-9+]/g, '')}`)}
          accessibilityHint="Opens your phone dialer"
        />
      ) : null}
      <AppText variant="caption" tone="subtle">
        Draft safety guidance — pending clinical review. Based on: {sources.join('; ') || 'international guidelines'}. FAITH cannot assess you; when in doubt, seek care.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: RADIUS.lg, borderWidth: 1.5, padding: SPACE.lg, gap: SPACE.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  step: { flexDirection: 'row', gap: SPACE.xs },
});
