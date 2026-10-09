import { MIGRATIONS, type Migration } from './schema';
import type { SqlDatabase } from './sql';

export interface MigrationResult {
  from: number;
  to: number;
  applied: number[];
}

/**
 * Applies pending migrations in order, each in its own exclusive transaction, then verifies
 * foreign-key integrity. Safe to call on every app start.
 */
export async function migrate(
  db: SqlDatabase,
  migrations: Migration[] = MIGRATIONS,
  now: () => string = () => new Date().toISOString(),
): Promise<MigrationResult> {
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await db.execAsync(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY NOT NULL, name TEXT NOT NULL, applied_at TEXT NOT NULL);',
  );
  const row = await db.getFirstAsync<{ v: number | null }>('SELECT MAX(version) AS v FROM schema_migrations');
  const from = row?.v ?? 0;
  const ordered = [...migrations].sort((a, b) => a.version - b.version);
  const latest = ordered.length ? ordered[ordered.length - 1].version : 0;
  if (from > latest) {
    throw new Error(`Database schema v${from} is newer than this app (v${latest}). Update FAITH to open it.`);
  }
  const applied: number[] = [];
  for (const m of ordered) {
    if (m.version <= from) continue;
    await db.transaction(async (tx) => {
      await tx.execAsync(m.sql);
      await tx.runAsync('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [m.version, m.name, now()]);
    });
    applied.push(m.version);
  }
  const violations = await db.getAllAsync<Record<string, unknown>>('PRAGMA foreign_key_check');
  if (violations.length > 0) {
    throw new Error(`Database integrity check failed (${violations.length} foreign-key violations).`);
  }
  return { from, to: Math.max(from, latest), applied };
}
