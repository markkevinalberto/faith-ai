import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { useApp } from '@/state/AppState';
import { Button } from '@/ui/Button';
import { Banner } from '@/ui/Feedback';
import { AppText } from '@/ui/Text';
import { useTheme } from '@/ui/theme';

export function initials(name: string): string {
  const parts = name.replace(/\(.*?\)/g, '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '•';
}

export function ProfileButton() {
  const { profile } = useApp();
  const { c } = useTheme();
  if (!profile) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Settings and profiles. Current profile: ${profile.displayName}`}
      onPress={() => router.push('/settings')}
      hitSlop={6}
      style={[styles.avatar, { backgroundColor: profile.isDemo ? c.demoSoft : c.primarySoft, borderColor: profile.isDemo ? c.demo : c.primary }]}>
      <AppText variant="label" style={{ color: profile.isDemo ? c.demo : c.primary }}>
        {initials(profile.displayName)}
      </AppText>
    </Pressable>
  );
}

export function DemoBanner() {
  const { profile } = useApp();
  if (!profile?.isDemo) return null;
  return (
    <Banner
      tone="demo"
      title="Sample data"
      message="You are viewing a fictional demo person. Nothing here is real health information, and no reminders are scheduled for it."
      action={<Button title="Switch profile" size="sm" variant="secondary" onPress={() => router.push('/settings')} />}
    />
  );
}

export function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 5) return 'Good evening';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

const styles = StyleSheet.create({
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
});
