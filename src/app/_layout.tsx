import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

import { AppLockProvider } from '@/state/AppLock';
import { AppStateProvider } from '@/state/AppState';
import { ReminderCoordinator } from '@/state/ReminderCoordinator';
import { useTheme } from '@/ui/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const { c, dark } = useTheme();
  const base = dark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: { ...base.colors, primary: c.primary, background: c.bg, card: c.bg, text: c.text, border: c.border, notification: c.danger },
  };
  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <AppStateProvider>
        <AppLockProvider>
          <ReminderCoordinator />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: c.bg },
              headerTintColor: c.text,
              headerShadowVisible: false,
              headerTitleStyle: { fontWeight: '600', fontSize: 18 },
              headerBackButtonDisplayMode: 'minimal',
              contentStyle: { backgroundColor: c.bg },
            }}>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="onboarding/index" options={{ headerShown: false }} />
            <Stack.Screen name="onboarding/profile" options={{ title: 'Profile' }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="vitals/[type]" options={{ title: '' }} />
            <Stack.Screen name="vitals/new" options={{ presentation: 'modal', title: 'Reading' }} />
            <Stack.Screen name="medications/[id]" options={{ title: '' }} />
            <Stack.Screen name="medications/edit" options={{ presentation: 'modal', title: 'Medication' }} />
            <Stack.Screen name="dose/[id]" options={{ presentation: 'modal', title: 'Dose' }} />
            <Stack.Screen name="care/lab/[id]" options={{ title: '' }} />
            <Stack.Screen name="care/lab/edit" options={{ presentation: 'modal', title: 'Lab test' }} />
            <Stack.Screen name="care/lab/result" options={{ presentation: 'modal', title: 'Lab result' }} />
            <Stack.Screen name="care/appointment/[id]" options={{ title: '' }} />
            <Stack.Screen name="care/appointment/edit" options={{ presentation: 'modal', title: 'Appointment' }} />
            <Stack.Screen name="settings/index" options={{ title: 'Settings' }} />
            <Stack.Screen name="settings/profile" options={{ title: 'Profile & conditions' }} />
            <Stack.Screen name="settings/targets" options={{ title: 'Target ranges' }} />
            <Stack.Screen name="settings/model" options={{ title: 'On-device AI' }} />
            <Stack.Screen name="settings/data" options={{ title: 'Your data' }} />
            <Stack.Screen name="settings/about" options={{ title: 'About & disclosures' }} />
          </Stack>
        </AppLockProvider>
      </AppStateProvider>
    </ThemeProvider>
  );
}
