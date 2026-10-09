/**
 * SqlDatabase implementation on Node's built-in SQLite (node:sqlite, Node >= 22.13), so the exact
 * SQL used on device runs in integration tests against a real SQLite engine.
 */
import { migrate } from '@/db/migrate';
import type { SqlDatabase, SqlExecutor, SqlValue } from '@/db/sql';

interface StatementSync {
  run(...params: SqlValue[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  get(...params: SqlValue[]): unknown;
  all(...params: SqlValue[]): unknown[];
}
interface DatabaseSyncInstance {
  exec(sql: string): void;
  prepare(sql: string): StatementSync;
  close(): void;
}
type DatabaseSyncCtor = new (path: string) => DatabaseSyncInstance;

function loadSqlite(): DatabaseSyncCtor {
  // getBuiltinModule bypasses Jest's module registry, which does not know about node:sqlite.
  const proc = process as unknown as { getBuiltinModule(id: string): { DatabaseSync: DatabaseSyncCtor } };
  return proc.getBuiltinModule('node:sqlite').DatabaseSync;
}

function plain<T>(row: unknown): T {
  // node:sqlite returns null-prototype objects; copy for friendlier equality assertions.
  return (row ? { ...(row as object) } : null) as T;
}

export function createNodeDatabase(path = ':memory:'): SqlDatabase {
  const DatabaseSync = loadSqlite();
  const raw = new DatabaseSync(path);
  raw.exec('PRAGMA foreign_keys = ON;');
  let inTx = false;

  const exec: SqlExecutor = {
    async execAsync(sql) {
      raw.exec(sql);
    },
    async runAsync(sql, params = []) {
      const r = raw.prepare(sql).run(...params);
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    async getFirstAsync<T>(sql: string, params: SqlValue[] = []) {
      const r = raw.prepare(sql).get(...params);
      return (r === undefined ? null : plain<T>(r)) as T | null;
    },
    async getAllAsync<T>(sql: string, params: SqlValue[] = []) {
      return raw.prepare(sql).all(...params).map((r) => plain<T>(r));
    },
  };

  return {
    ...exec,
    async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
      if (inTx) throw new Error('Nested transactions are not supported');
      inTx = true;
      raw.exec('BEGIN IMMEDIATE');
      try {
        const result = await fn(exec);
        raw.exec('COMMIT');
        return result;
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      } finally {
        inTx = false;
      }
    },
    async close() {
      raw.close();
    },
  };
}

export async function createMigratedDatabase(): Promise<SqlDatabase> {
  const db = createNodeDatabase();
  await migrate(db);
  return db;
}
