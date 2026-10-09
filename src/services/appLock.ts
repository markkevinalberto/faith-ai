/** Optional app lock using the phone's own biometrics or screen lock (PIN/pattern/password). */
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

export interface LockAvailability {
  available: boolean;
  reason?: string;
}

export async function lockAvailability(): Promise<LockAvailability> {
  if (Platform.OS === 'web') return { available: false, reason: 'App lock needs the Android or iOS app.' };
  const level = await LocalAuthentication.getEnrolledLevelAsync();
  if (level === LocalAuthentication.SecurityLevel.NONE) {
    return { available: false, reason: 'Set up a screen lock (PIN, pattern, password or biometrics) on your phone first.' };
  }
  return { available: true };
}

export async function authenticate(promptMessage: string): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  const r = await LocalAuthentication.authenticateAsync({ promptMessage, cancelLabel: 'Cancel', disableDeviceFallback: false });
  return r.success;
}
