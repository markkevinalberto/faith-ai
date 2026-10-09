import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { TextSizePicker } from '@/components/TextSizePicker';
import { SETTINGS, setSetting } from '@/db/repo/profiles';
import { seedDemoProfile } from '@/services/demoSeed';
import { useApp } from '@/state/AppState';
import { friendlyError } from '@/state/hooks';
import { BrandMark, MeaningLine, TAGLINE, Wordmark } from '@/ui/Brand';
import { Button } from '@/ui/Button';
import { showAlert } from '@/ui/dialog';
import { Illustration, type IllustrationName } from '@/ui/Illustration';
import { Card, Screen } from '@/ui/Layout';
import { AppText } from '@/ui/Text';
import { RADIUS, SPACE, useTheme } from '@/ui/theme';

const POINTS: { art: IllustrationName; title: string; body: string }[] = [
  { art: 'mascot-offline', title: 'Works offline', body: 'Your records stay on this phone. No account, no cloud.' },
  { art: 'feature-shield', title: 'Encrypted', body: 'Stored in an encrypted database with keys kept in secure storage.' },
  { art: 'feature-ai-globe', title: 'On-device AI', body: 'Ask about your readings, medicines and lab results — answered on your phone.' },
  { art: 'feature-bell', title: 'Reminders that respect you', body: 'Dose, refill, lab and appointment reminders. You decide what is recorded.' },
];

export default function Welcome() {
  const { c } = useTheme();
  const { db, timeZone, locale, refreshProfiles } = useApp();
  const compact = useWindowDimensions().width < 400;
  const [agreed, setAgreed] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const tryDemo = async () => {
    setSeeding(true);
    try {
      const p = await seedDemoProfile(db, { now: new Date(), timeZone, locale });
      await setSetting(db, SETTINGS.activeProfileId, p.id);
      await refreshProfiles();
      router.replace('/home');
    } catch (e) {
      showAlert("Couldn't create sample data", friendlyError(e));
    } finally {
      setSeeding(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={[styles.hero, { backgroundColor: c.primarySoft }]}>
        <Illustration name="mascot-hero" height={compact ? 168 : 210} label="FAITH, a friendly nurse character, waving hello" />
        <View style={styles.heroText}>
          <BrandMark size={compact ? 34 : 40} />
          <Wordmark size={compact ? 25 : 30} />
          <MeaningLine />
          <AppText variant="body" tone="muted">
            {TAGLINE}
          </AppText>
        </View>
      </View>
      <AppText variant="body" tone="muted">
        A private companion for living with diabetes, high blood pressure and other long-term conditions.
      </AppText>

      {/* First thing a new user can change: older readers can make everything bigger before reading on. */}
      <Card tone="muted">
        <TextSizePicker hint={false} />
      </Card>

      <View style={{ gap: SPACE.md }}>
        {POINTS.map((p) => (
          <View key={p.title} style={styles.point}>
            <Illustration name={p.art} height={48} />
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong">{p.title}</AppText>
              <AppText variant="caption" tone="muted">
                {p.body}
              </AppText>
            </View>
          </View>
        ))}
      </View>

      <Card tone="muted">
        <AppText variant="bodyStrong">Before you start</AppText>
        <AppText variant="caption" tone="muted" style={{ marginTop: SPACE.xs }}>
          FAITH helps you organise your health information and learn about it. It is not a medical device, cannot diagnose, and never changes your
          treatment. Always follow your clinician’s advice. In an emergency, call your local emergency number.
        </AppText>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: agreed }}
          accessibilityLabel="I understand FAITH is an organiser and educational tool, not medical advice or an emergency service"
          onPress={() => setAgreed(!agreed)}
          style={styles.agree}>
          <Ionicons name={agreed ? 'checkbox' : 'square-outline'} size={26} color={agreed ? c.primary : c.textSubtle} />
          <AppText variant="body" style={{ flex: 1 }}>
            I understand FAITH is an organiser and educational tool, not medical advice or an emergency service.
          </AppText>
        </Pressable>
      </Card>

      <View style={{ gap: SPACE.sm }}>
        <Button title="Set up my profile" icon="person-add-outline" size="lg" disabled={!agreed} onPress={() => router.push('/onboarding/profile')} />
        <Button title="Explore with sample data" icon="flask-outline" variant="secondary" size="lg" disabled={!agreed} loading={seeding} onPress={() => void tryDemo()} />
        <AppText variant="caption" tone="subtle" center>
          Sample data describes a fictional person and is clearly labelled. You can remove it any time in Settings.
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: RADIUS.xl, padding: SPACE.lg, marginTop: SPACE.md, flexDirection: 'row', alignItems: 'center', gap: SPACE.md, overflow: 'hidden' },
  heroText: { flex: 1, gap: SPACE.sm },
  point: { flexDirection: 'row', gap: SPACE.md, alignItems: 'center' },
  agree: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, marginTop: SPACE.md, minHeight: 48 },
});
