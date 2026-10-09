import { migrate } from '@/db/migrate';
import { LATEST_SCHEMA_VERSION, MIGRATIONS } from '@/db/schema';
import { createNodeDatabase } from './helpers/nodeDb';

const EXPECTED_TABLES = [
  'app_settings',
  'appointments',
  'audit_events',
  'conditions',
  'custom_vital_types',
  'documents',
  'lab_results',
  'lab_tests',
  'medication_events',
  'medication_schedules',
  'medications',
  'profiles',
  'reminder_jobs',
  'schema_migrations',
  'target_ranges',
  'vital_readings',
];

describe('migrations', () => {
  it('creates the full schema on a fresh database', async () => {
    const db = createNodeDatabase();
    const res = await migrate(db);
    expect(res).toEqual({ from: 0, to: LATEST_SCHEMA_VERSION, applied: MIGRATIONS.map((m) => m.version) });
    const tables = await db.getAllAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
    expect(tables.map((t) => t.name)).toEqual(EXPECTED_TABLES);
    const fk = await db.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys');
    expect(fk?.foreign_keys).toBe(1);
  });

  it('is idempotent', async () => {
    const db = createNodeDatabase();
    await migrate(db);
    const again = await migrate(db);
    expect(again.applied).toEqual([]);
    expect(again.from).toBe(LATEST_SCHEMA_VERSION);
    const rows = await db.getAllAsync<{ version: number }>('SELECT version FROM schema_migrations');
    expect(rows).toHaveLength(MIGRATIONS.length);
  });

  it('rolls back a failing migration completely', async () => {
    const db = createNodeDatabase();
    await migrate(db);
    const broken = [...MIGRATIONS, { version: 99, name: 'broken', sql: 'CREATE TABLE half_done (x INTEGER); THIS IS NOT SQL;' }];
    await expect(migrate(db, broken)).rejects.toThrow();
    const max = await db.getFirstAsync<{ v: number }>('SELECT MAX(version) AS v FROM schema_migrations');
    expect(max?.v).toBe(LATEST_SCHEMA_VERSION);
    const half = await db.getFirstAsync("SELECT name FROM sqlite_master WHERE name = 'half_done'");
    expect(half).toBeNull();
  });

  it('refuses to open a database from a newer app version', async () => {
    const db = createNodeDatabase();
    await migrate(db);
    await db.runAsync('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [999, 'future', '2030-01-01T00:00:00Z']);
    await expect(migrate(db)).rejects.toThrow(/newer than this app/);
  });

  it('enforces foreign keys and check constraints', async () => {
    const db = createNodeDatabase();
    await migrate(db);
    await expect(
      db.runAsync(
        "INSERT INTO medications (id, profile_id, name, start_date, created_at, updated_at) VALUES ('m1', 'no-such-profile', 'X', '2026-01-01', 'now', 'now')",
      ),
    ).rejects.toThrow(/FOREIGN KEY/);
    await expect(
      db.runAsync(
        "INSERT INTO profiles (id, display_name, locale, timezone, glucose_unit, weight_unit, temperature_unit, created_at, updated_at) VALUES ('p', 'P', 'en', 'UTC', 'mg/dl', 'kg', 'C', 'n', 'n')",
      ),
    ).rejects.toThrow(/CHECK/);
  });
});
