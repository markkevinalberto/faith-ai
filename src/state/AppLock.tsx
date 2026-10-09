/**
 * Optional app lock. When enabled, the app requires device authentication on launch and after
 * 30 seconds in the background, and covers its content while in the app switcher.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState as RNAppState, StyleSheet, View } from 'react-native';

import { SETTINGS, getSetting, setSetting } from '../db/repo/profiles';
import { authenticate, lockAvailability } from '../services/appLock';
import { BrandMark, HeroGradient } from '../ui/Brand';
import { Button } from '../ui/Button';
import { AppText } from '../ui/Text';
import { SPACE, useTheme } from '../ui/theme';
import { useApp } from './AppState';

const RELOCK_AFTER_MS = 30_000;

interface LockValue {
  enabled: boolean;
  unlocked: boolean;
  setEnabled: (v: boolean) => Promise<{ ok: boolean; reason?: string }>;
}

const LockCtx = createContext<LockValue>({ enabled: false, unlocked: true, setEnabled: async () => ({ ok: false }) });

export function AppLockProvider({ children }: { children: ReactNode }) {
  const { db } = useApp();
  const { c } = useTheme();
  const [enabled, setEnabledState] = useState<boolean | null>(null);
  const [locked, setLocked] = useState(true);
  const [covered, setCovered] = useState(false);
  const backgroundedAt = useRef<number | null>(null);
  const prompting = useRef(false);

  useEffect(() => {
    void getSetting(db, SETTINGS.appLockEnabled).then((v) => {
      const on = v === '1';
      setEnabledState(on);
      if (!on) setLocked(false);
    });
  }, [db]);

  const unlock = useCallback(async () => {
    if (prompting.current) return;
    prompting.current = true;
    try {
      if (await authenticate('Unlock FAITH')) setLocked(false);
    } finally {
      prompting.current = false;
    }
  }, []);

  useEffect(() => {
    if (enabled && locked && RNAppState.currentState === 'active') void unlock();
  }, [enabled, locked, unlock]);

  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (s) => {
      if (!enabled) return;
      if (s === 'background' || s === 'inactive') {
        if (!prompting.current) {
          setCovered(true);
          backgroundedAt.current ??= Date.now();
        }
      } else if (s === 'active') {
        setCovered(false);
        if (backgroundedAt.current && Date.now() - backgroundedAt.current > RELOCK_AFTER_MS) setLocked(true);
        backgroundedAt.current = null;
      }
    });
    return () => sub.remove();
  }, [enabled]);

  const setEnabled = async (v: boolean) => {
    if (v) {
      const avail = await lockAvailability();
      if (!avail.available) return { ok: false, reason: avail.reason };
    }
    prompting.current = true;
    const ok = await authenticate(v ? 'Confirm to turn on app lock' : 'Confirm to turn off app lock').finally(() => {
      prompting.current = false;
    });
    if (!ok) return { ok: false, reason: 'Authentication was cancelled.' };
    await setSetting(db, SETTINGS.appLockEnabled, v ? '1' : '0');
    setEnabledState(v);
    setLocked(false);
    return { ok: true };
  };

  if (enabled === null) return null;
  const showCover = enabled && (locked || covered);
  return (
    <LockCtx.Provider value={{ enabled, unlocked: !enabled || !locked, setEnabled }}>
      {children}
      {showCover ? (
        <View style={[StyleSheet.absoluteFill, styles.cover, { backgroundColor: c.hero }]} accessibilityViewIsModal>
          <HeroGradient />
          <BrandMark size={76} tile />
          <View style={[styles.badge, { backgroundColor: 'rgba(255,255,255,0.16)' }]}>
            <Ionicons name="lock-closed" size={18} color={c.heroText} />
          </View>
          <AppText variant="title" tone="hero" center>
            FAITH is locked
          </AppText>
          <AppText variant="body" tone="heroMuted" center>
            Your health records are protected with your phone’s screen lock.
          </AppText>
          {locked ? <Button title="Unlock" icon="finger-print" onPress={() => void unlock()} variant="secondary" style={{ marginTop: SPACE.lg, minWidth: 200 }} /> : null}
        </View>
      ) : null}
    </LockCtx.Provider>
  );
}

export function useAppLock(): LockValue {
  return useContext(LockCtx);
}

const styles = StyleSheet.create({
  cover: { alignItems: 'center', justifyContent: 'center', padding: SPACE.xxxl, gap: SPACE.md, zIndex: 100 },
  badge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginTop: -SPACE.xl, marginLeft: 56, marginBottom: SPACE.sm },
});
