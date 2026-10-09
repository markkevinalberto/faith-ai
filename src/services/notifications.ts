/**
 * expo-notifications adapter (local notifications only — no push, no server).
 * Android: two channels, private lock-screen visibility, dose actions (Taken / Snooze / Skip).
 */
import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';

import { notificationIdFor, type DesiredReminder, type ScheduledNotificationInfo } from '../domain/reminders';
import type { Notifier, PermissionState } from './reminderSync';

export const DOSE_CATEGORY = 'dose_reminder';
export const DOSE_ACTIONS = { taken: 'DOSE_TAKEN', snooze: 'DOSE_SNOOZE_10', skip: 'DOSE_SKIP' } as const;
const CHANNEL_DOSES = 'dose-reminders';
const CHANNEL_CARE = 'care-reminders';

let configured = false;

export async function configureNotifications(): Promise<void> {
  if (Platform.OS === 'web' || configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_DOSES, {
      name: 'Medication reminders',
      description: 'Reminders for scheduled doses',
      importance: Notifications.AndroidImportance.HIGH,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      vibrationPattern: [0, 250, 200, 250],
      sound: 'default',
    });
    await Notifications.setNotificationChannelAsync(CHANNEL_CARE, {
      name: 'Appointments, lab tests and refills',
      importance: Notifications.AndroidImportance.DEFAULT,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });
  }
  await Notifications.setNotificationCategoryAsync(DOSE_CATEGORY, [
    { identifier: DOSE_ACTIONS.taken, buttonTitle: 'Taken', options: { opensAppToForeground: true } },
    { identifier: DOSE_ACTIONS.snooze, buttonTitle: 'Snooze 10 min', options: { opensAppToForeground: true } },
    { identifier: DOSE_ACTIONS.skip, buttonTitle: 'Skip', options: { opensAppToForeground: true, isDestructive: true } },
  ]);
}

function toState(status: Notifications.PermissionStatus | string, granted: boolean): PermissionState {
  if (granted) return 'granted';
  return status === 'denied' ? 'denied' : 'undetermined';
}

export async function getNotificationPermission(): Promise<PermissionState> {
  if (Platform.OS === 'web') return 'denied';
  const p = await Notifications.getPermissionsAsync();
  return toState(p.status, p.granted);
}

export async function requestNotificationPermission(): Promise<PermissionState> {
  if (Platform.OS === 'web') return 'denied';
  const p = await Notifications.requestPermissionsAsync();
  return toState(p.status, p.granted);
}

export function openSystemSettings(): void {
  void Linking.openSettings();
}

export const expoNotifier: Notifier = {
  isSupported: () => Platform.OS !== 'web',
  permission: getNotificationPermission,
  async listScheduled(): Promise<ScheduledNotificationInfo[]> {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    return all.map((n) => {
      const data = (n.content.data ?? {}) as Record<string, unknown>;
      return {
        identifier: n.identifier,
        jobKey: typeof data.jobKey === 'string' ? data.jobKey : null,
        contentHash: typeof data.contentHash === 'string' ? data.contentHash : null,
      };
    });
  },
  async schedule(r: DesiredReminder): Promise<string> {
    return Notifications.scheduleNotificationAsync({
      identifier: notificationIdFor(r.jobKey),
      content: {
        title: r.title,
        body: r.body,
        sound: 'default',
        categoryIdentifier: r.categoryId ?? undefined,
        data: { app: 'carely', jobKey: r.jobKey, contentHash: r.contentHash, kind: r.kind, entityId: r.entityId, profileId: r.profileId },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(r.fireAt),
        channelId: r.kind === 'dose' ? CHANNEL_DOSES : CHANNEL_CARE,
      },
    });
  },
  async cancel(identifier: string): Promise<void> {
    await Notifications.cancelScheduledNotificationAsync(identifier);
  },
};

export async function cancelAllNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.dismissAllNotificationsAsync();
}
