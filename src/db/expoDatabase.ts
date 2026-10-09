/**
 * Opens the app database with SQLCipher encryption.
 *
 * Key management: a random 256-bit key is generated on first launch and stored in expo-secure-store
 * (Android Keystore / iOS Keychain, this-device-only). The key is applied as a raw key via
 * PRAGMA key before any other statement. If the key is missing or wrong, opening fails loudly —
 * we never silently create an unencrypted database alongside the encrypted one.
 */
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

import { migrate, type MigrationResult } from './migrate';
import type { SqlDatabase, SqlExecutor, SqlValue } from './sql';

export const DB_NAME = 'carely.db';
const KEY_NAME = 'carely_db_key_v1';

export interface EncryptionStatus {
  /** True when SQLCipher reported a cipher version for this connection. */
  active: boolean;
  cipherVersion: string | null;
  reason?: string;
}

export interface OpenedDatabase {
  db: SqlDatabase;
  encryption: EncryptionStatus;
  migration: MigrationResult;
}

export class DatabaseKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseKeyError';
  }
}

function toHex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

async function getOrCreateKey(): Promise<{ key: string; created: boolean }> {
  const opts: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
  const existing = await SecureStore.getItemAsync(KEY_NAME, opts);
  if (existing && /^[0-9a-f]{64}$/.test(existing)) return { key: existing, created: false };
  const key = toHex(Crypto.getRandomBytes(32));
  await SecureStore.setItemAsync(KEY_NAME, key, opts);
  return { key, created: true };
}

export async function deleteDatabaseKey(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_NAME, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
}

function wrap(raw: SQLite.SQLiteDatabase): SqlExecutor {
  return {
    execAsync: (sql) => raw.execAsync(sql),
    runAsync: async (sql, params: SqlValue[] = []) => {
      const r = await raw.runAsync(sql, params);
      return { changes: r.changes, lastInsertRowId: r.lastInsertRowId };
    },
    getFirstAsync: <T,>(sql: string, params: SqlValue[] = []) => raw.getFirstAsync<T>(sql, params),
    getAllAsync: <T,>(sql: string, params: SqlValue[] = []) => raw.getAllAsync<T>(sql, params),
  };
}

function adapt(raw: SQLite.SQLiteDatabase): SqlDatabase {
  const base = wrap(raw);
  return {
    ...base,
    async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
      let result: T | undefined;
      if (Platform.OS === 'web') {
        await raw.withTransactionAsync(async () => {
          result = await fn(base);
        });
      } else {
        await raw.withExclusiveTransactionAsync(async (txn) => {
          result = await fn(wrap(txn));
        });
      }
      return result as T;
    },
    close: () => raw.closeAsync(),
  };
}

export async function openAppDatabase(): Promise<OpenedDatabase> {
  if (Platform.OS === 'web') {
    // Web preview only (SQLCipher is not available on web). Never used for real data on device.
    const raw = await SQLite.openDatabaseAsync(DB_NAME);
    const db = adapt(raw);
    const migration = await migrate(db);
    return { db, encryption: { active: false, cipherVersion: null, reason: 'Web preview — encryption unavailable' }, migration };
  }

  const { key, created } = await getOrCreateKey();
  const raw = await SQLite.openDatabaseAsync(DB_NAME);
  await raw.execAsync(`PRAGMA key = "x'${key}'";`);
  try {
    // Fails with "file is not a database" when the key does not match.
    await raw.getFirstAsync('SELECT count(*) AS n FROM sqlite_master');
  } catch {
    await raw.closeAsync().catch(() => undefined);
    throw new DatabaseKeyError(
      created
        ? 'An existing database could not be opened with a newly generated key (the original key is missing).'
        : 'The database could not be decrypted with the stored key.',
    );
  }
  const cipher = await raw.getFirstAsync<{ cipher_version?: string }>('PRAGMA cipher_version').catch(() => null);
  await raw.execAsync('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  const db = adapt(raw);
  const migration = await migrate(db);
  const cipherVersion = cipher?.cipher_version ?? null;
  return {
    db,
    encryption: cipherVersion
      ? { active: true, cipherVersion }
      : { active: false, cipherVersion: null, reason: 'SQLCipher not present in this build (expo-sqlite useSQLCipher must be enabled).' },
    migration,
  };
}

/** Permanently deletes the database file and its key. The caller must close the DB first. */
export async function destroyDatabase(): Promise<void> {
  await SQLite.deleteDatabaseAsync(DB_NAME);
  if (Platform.OS !== 'web') await deleteDatabaseKey();
}
