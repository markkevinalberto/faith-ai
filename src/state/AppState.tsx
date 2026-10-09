/**
 * Root app state: encrypted database, profiles (active profile), device time zone/locale, and a
 * data-change counter that screens use to refresh. Shows loading / recovery screens while opening.
 */
import * as SplashScreen from 'expo-splash-screen';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Alert, AppState as RNAppState } from 'react-native';

import { engineStore } from '../ai/inference/engineStore';
import { DatabaseKeyError, destroyDatabase, openAppDatabase, type EncryptionStatus } from '../db/expoDatabase';
import { SETTINGS, getSetting, listProfiles, setSetting } from '../db/repo/profiles';
import type { SqlDatabase } from '../db/sql';
import type { Profile } from '../domain/types';
import { currentLocale, currentTimeZone } from '../services/device';
import { clearExportCache, deleteAllDocuments } from '../services/files';
import { cancelAllNotifications } from '../services/notifications';
import { Button } from '../ui/Button';
import { ErrorView, LoadingView } from '../ui/Feedback';

type Boot =
  | { kind: 'loading' }
  | { kind: 'error'; message: string; keyError: boolean }
  | { kind: 'ready'; db: SqlDatabase; encryption: EncryptionStatus };

export interface AppStateValue {
  db: SqlDatabase;
  encryption: EncryptionStatus;
  profiles: Profile[];
  profile: Profile | null;
  timeZone: string;
  locale: string;
  /** Increments after any data change. */
  dataVersion: number;
  /** Increments after background dose/reminder sync completes. */
  syncTick: number;
  notifyChanged: () => void;
  markSynced: () => void;
  setActiveProfile: (id: string) => Promise<void>;
  refreshProfiles: () => Promise<void>;
  /** Permanently deletes ALL local data (database, key, documents, notifications) and restarts. */
  resetAll: (opts?: { keepModels?: boolean }) => Promise<void>;
}

const Ctx = createContext<AppStateValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [boot, setBoot] = useState<Boot>({ kind: 'loading' });
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const [syncTick, setSyncTick] = useState(0);
  const [timeZone, setTimeZone] = useState(() => currentTimeZone());
  const locale = useMemo(() => currentLocale(), []);

  const loadProfiles = useCallback(async (db: SqlDatabase) => {
    const list = await listProfiles(db);
    const saved = await getSetting(db, SETTINGS.activeProfileId);
    const chosen = list.find((p) => p.id === saved) ?? list.find((p) => !p.isDemo) ?? list[0] ?? null;
    if (chosen && chosen.id !== saved) await setSetting(db, SETTINGS.activeProfileId, chosen.id);
    setProfiles(list);
    setActiveId(chosen?.id ?? null);
  }, []);

  /** Opens the database; state is only updated from the promise callbacks. */
  const bootstrap = useCallback(
    () =>
      openAppDatabase()
        .then(async (opened) => {
          await loadProfiles(opened.db);
          setBoot({ kind: 'ready', db: opened.db, encryption: opened.encryption });
        })
        .catch((e: unknown) => {
          setBoot({ kind: 'error', message: e instanceof Error ? e.message : 'Unknown error', keyError: e instanceof DatabaseKeyError });
        })
        .finally(() => {
          SplashScreen.hideAsync().catch(() => undefined);
        }),
    [loadProfiles],
  );

  const open = useCallback(async () => {
    setBoot({ kind: 'loading' });
    await bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (s) => {
      if (s === 'active') setTimeZone(currentTimeZone());
    });
    return () => sub.remove();
  }, []);

  const wipe = useCallback(async (db: SqlDatabase | null, keepModels: boolean) => {
    await cancelAllNotifications().catch(() => undefined);
    await engineStore.unload().catch(() => undefined);
    if (db) await db.close().catch(() => undefined);
    await destroyDatabase();
    deleteAllDocuments();
    clearExportCache();
    if (!keepModels) {
      const { deleteAllModels } = await import('../ai/inference/modelManager');
      deleteAllModels();
    }
  }, []);

  if (boot.kind === 'loading') return <LoadingView label="Opening your encrypted records…" />;
  if (boot.kind === 'error') {
    return (
      <ErrorView
        title="Couldn't open your records"
        message={
          boot.keyError
            ? `${boot.message} Your data stays encrypted on this phone. If you reinstalled the app or restored a backup, the original key may be gone and the data cannot be recovered.`
            : boot.message
        }
        onRetry={() => void open()}>
        {boot.keyError ? (
          <Button
            title="Erase local data and start over"
            variant="danger"
            icon="trash"
            onPress={() =>
              Alert.alert('Erase all local data?', 'This permanently deletes the encrypted database on this phone. This cannot be undone.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Erase',
                  style: 'destructive',
                  onPress: async () => {
                    await wipe(null, true);
                    await open();
                  },
                },
              ])
            }
          />
        ) : null}
      </ErrorView>
    );
  }

  const db = boot.db;
  const value: AppStateValue = {
    db,
    encryption: boot.encryption,
    profiles,
    profile: profiles.find((p) => p.id === activeId) ?? null,
    timeZone,
    locale,
    dataVersion,
    syncTick,
    notifyChanged: () => setDataVersion((v) => v + 1),
    markSynced: () => setSyncTick((v) => v + 1),
    setActiveProfile: async (id: string) => {
      await setSetting(db, SETTINGS.activeProfileId, id);
      setActiveId(id);
      setDataVersion((v) => v + 1);
    },
    refreshProfiles: async () => {
      await loadProfiles(db);
      setDataVersion((v) => v + 1);
    },
    resetAll: async (opts) => {
      await wipe(db, opts?.keepModels ?? false);
      setProfiles([]);
      setActiveId(null);
      await open();
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppStateValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppStateProvider');
  return v;
}

/** Active profile; screens that require one are only reachable after onboarding. */
export function useProfile(): Profile {
  const { profile } = useApp();
  if (!profile) throw new Error('No active profile');
  return profile;
}
