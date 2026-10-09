/**
 * Background coordination (renders nothing):
 *  - keeps dose events + OS reminders in sync after data changes, on foreground and on time-zone change;
 *  - handles notification taps and the Taken / Snooze / Skip actions (only after the app is unlocked).
 */
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, AppState as RNAppState, Platform } from 'react-native';

import { applyDoseAction, syncDoseEvents } from '../db/repo/doseEvents';
import { DOSE_ACTIONS, configureNotifications, expoNotifier } from '../services/notifications';
import { syncReminders } from '../services/reminderSync';
import { useApp } from './AppState';
import { useAppLock } from './AppLock';
import { friendlyError } from './hooks';

export function ReminderCoordinator() {
  const app = useApp();
  const { unlocked } = useAppLock();
  const [foregroundTick, setForegroundTick] = useState(0);
  const latest = useRef(app);
  const latestUnlocked = useRef(unlocked);
  useLayoutEffect(() => {
    latest.current = app;
    latestUnlocked.current = unlocked;
  });
  const pending = useRef<Notifications.NotificationResponse[]>([]);
  const handled = useRef(new Set<string>());

  useEffect(() => {
    void configureNotifications();
    const sub = RNAppState.addEventListener('change', (s) => {
      if (s === 'active') setForegroundTick((t) => t + 1);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const { db, profiles, timeZone, markSynced } = latest.current;
      try {
        for (const p of profiles.filter((x) => x.isDemo || !x.remindersEnabled)) {
          await syncDoseEvents(db, p.id, { now: new Date(), timeZone });
        }
        await syncReminders(db, expoNotifier, { timeZone });
      } catch {
        // Intentionally no details: logs must never contain health data.
        console.warn('FAITH: reminder sync failed');
      } finally {
        markSynced();
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [app.dataVersion, app.timeZone, app.profiles, foregroundTick]);

  const process = async () => {
    while (pending.current.length > 0) {
      const response = pending.current.shift() as Notifications.NotificationResponse;
      const key = `${response.notification.request.identifier}|${response.actionIdentifier}|${response.notification.date}`;
      if (handled.current.has(key)) continue;
      handled.current.add(key);
      const data = (response.notification.request.content.data ?? {}) as { kind?: string; entityId?: string; profileId?: string };
      const { db, profiles, profile, setActiveProfile, notifyChanged } = latest.current;
      if (!data.profileId || !profiles.some((p) => p.id === data.profileId)) continue;
      try {
        if (data.kind === 'dose' && data.entityId && response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) {
          const at = new Date().toISOString();
          if (response.actionIdentifier === DOSE_ACTIONS.taken) await applyDoseAction(db, data.profileId, data.entityId, { type: 'take', at });
          else if (response.actionIdentifier === DOSE_ACTIONS.snooze) await applyDoseAction(db, data.profileId, data.entityId, { type: 'snooze', at, minutes: 10 });
          else if (response.actionIdentifier === DOSE_ACTIONS.skip) await applyDoseAction(db, data.profileId, data.entityId, { type: 'skip', at });
          notifyChanged();
        } else {
          if (profile?.id !== data.profileId) await setActiveProfile(data.profileId);
          if (data.kind === 'dose' && data.entityId) router.push({ pathname: '/dose/[id]', params: { id: data.entityId } });
          else if (data.kind === 'appointment' && data.entityId) router.push({ pathname: '/care/appointment/[id]', params: { id: data.entityId } });
          else if (data.kind === 'lab' && data.entityId) router.push({ pathname: '/care/lab/[id]', params: { id: data.entityId } });
          else if (data.kind === 'refill' && data.entityId) router.push({ pathname: '/medications/[id]', params: { id: data.entityId } });
        }
      } catch (e) {
        Alert.alert("Couldn't record that", friendlyError(e));
      }
      await Notifications.dismissNotificationAsync(response.notification.request.identifier).catch(() => undefined);
    }
    await Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
  };

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      pending.current.push(r);
      if (latestUnlocked.current) void process();
    });
    void Notifications.getLastNotificationResponseAsync().then((r) => {
      if (r) {
        pending.current.push(r);
        if (latestUnlocked.current) void process();
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (unlocked && Platform.OS !== 'web') {
      const t = setTimeout(() => void process(), 300);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [unlocked]);

  return null;
}
