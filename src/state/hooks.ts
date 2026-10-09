import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type DependencyList } from 'react';
import { Alert } from 'react-native';

import { DoseActionError } from '../db/repo/doseEvents';
import { NotFoundError, type SqlDatabase } from '../db/sql';
import { useApp } from './AppState';

export interface QueryState<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
  reload: () => void;
}

/**
 * Runs a read against the local database. Re-runs when `deps` change, after any data change,
 * after background sync, and whenever the screen regains focus (so time-based statuses stay fresh).
 */
export function useQuery<T>(fn: (db: SqlDatabase) => Promise<T>, deps: DependencyList): QueryState<T> {
  const { db, dataVersion, syncTick } = useApp();
  const fnRef = useRef(fn);
  useLayoutEffect(() => {
    fnRef.current = fn;
  });
  const [focusTick, setFocusTick] = useState(0);
  const [manual, setManual] = useState(0);
  // Identifies the current request; `loading` is derived instead of being set inside the effect.
  const requestKey = [dataVersion, syncTick, focusTick, manual, ...deps].map(String).join('|');
  const [result, setResult] = useState<{ key: string | null; data: T | undefined; error: Error | null }>({ key: null, data: undefined, error: null });

  useFocusEffect(
    useCallback(() => {
      setFocusTick((t) => t + 1);
    }, []),
  );

  useEffect(() => {
    let cancelled = false;
    fnRef
      .current(db)
      .then((data) => {
        if (!cancelled) setResult({ key: requestKey, data, error: null });
      })
      .catch((e: unknown) => {
        if (!cancelled) setResult((s) => ({ key: requestKey, data: s.data, error: e instanceof Error ? e : new Error(String(e)) }));
      });
    return () => {
      cancelled = true;
    };
  }, [db, requestKey]);

  // Previous data stays visible while a refresh is in flight.
  return { data: result.data, loading: result.key !== requestKey, error: result.error, reload: () => setManual((m) => m + 1) };
}

/** User-facing message for an error. Never includes record contents. */
export function friendlyError(e: unknown): string {
  if (e instanceof DoseActionError) return e.message;
  if (e instanceof NotFoundError) return 'This item no longer exists. It may have been deleted.';
  const msg = e instanceof Error ? e.message : String(e);
  if (/constraint|CHECK|FOREIGN KEY|NOT NULL/i.test(msg)) return 'Some details were not valid. Please check the form and try again.';
  return msg.length < 200 ? msg : 'Something went wrong. Please try again.';
}

/** Wraps a mutation: reports errors in a dialog and refreshes data on success. */
export function useAction() {
  const { notifyChanged } = useApp();
  return async (fn: () => Promise<void>, opts: { errorTitle?: string } = {}): Promise<boolean> => {
    try {
      await fn();
      notifyChanged();
      return true;
    } catch (e) {
      Alert.alert(opts.errorTitle ?? "Couldn't save", friendlyError(e));
      return false;
    }
  };
}

/** Current time, refreshed every `intervalMs` (for countdowns and "due now" states). */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
