import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '@/state/AppState';
import type { IconName } from '@/ui/Button';
import { useTheme } from '@/ui/theme';

const TABS: { name: string; title: string; icon: IconName; iconActive: IconName }[] = [
  { name: 'home', title: 'Home', icon: 'home-outline', iconActive: 'home' },
  { name: 'vitals', title: 'Vitals', icon: 'pulse-outline', iconActive: 'pulse' },
  { name: 'medications', title: 'Medicines', icon: 'medkit-outline', iconActive: 'medkit' },
  { name: 'care', title: 'Care plan', icon: 'calendar-outline', iconActive: 'calendar' },
  { name: 'ask', title: 'Ask FAITH', icon: 'sparkles-outline', iconActive: 'sparkles' },
];

export default function TabsLayout() {
  const { profile } = useApp();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  if (!profile) return <Redirect href="/onboarding" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.textSubtle,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border, height: 68 + insets.bottom, paddingTop: 6, paddingBottom: Math.max(insets.bottom, 8) },
        // Fixed size (not scaled with the text-size setting) so five labels still fit a 360 px phone.
        tabBarLabelStyle: { fontSize: 13, fontWeight: '600' },
        tabBarAllowFontScaling: false,
        sceneStyle: { backgroundColor: c.bg },
      }}>
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarAccessibilityLabel: t.title,
            tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? t.iconActive : t.icon} size={24} color={color} />,
          }}
        />
      ))}
    </Tabs>
  );
}
