import type {
  ClinicianTarget,
  Condition,
  ConditionCategory,
  GlucoseUnit,
  Profile,
  TargetMetric,
  TemperatureUnit,
  WeightUnit,
} from '../../domain/types';
import { newId } from '../../lib/id';
import { mapCondition, mapProfile, mapTarget, optText } from '../rows';
import { NotFoundError, toBit, type SqlDatabase, type SqlExecutor } from '../sql';
import { logAudit } from './audit';

export interface ProfileInput {
  displayName: string;
  dateOfBirth?: string | null;
  sex?: Profile['sex'];
  locale: string;
  timezone: string;
  glucoseUnit: GlucoseUnit;
  weightUnit: WeightUnit;
  temperatureUnit: TemperatureUnit;
  emergencyNumber?: string | null;
  isDemo?: boolean;
  reminderPrivacy?: boolean;
  remindersEnabled?: boolean;
}

export async function createProfile(db: SqlDatabase, input: ProfileInput, now = new Date().toISOString()): Promise<Profile> {
  const id = newId();
  await db.transaction(async (tx) => {
    await tx.runAsync(
      `INSERT INTO profiles (id, display_name, date_of_birth, sex, locale, timezone, glucose_unit, weight_unit, temperature_unit,
        emergency_number, is_demo, reminder_privacy, reminders_enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.displayName.trim(),
        optText(input.dateOfBirth),
        input.sex ?? null,
        input.locale,
        input.timezone,
        input.glucoseUnit,
        input.weightUnit,
        input.temperatureUnit,
        optText(input.emergencyNumber),
        toBit(input.isDemo ?? false),
        toBit(input.reminderPrivacy ?? true),
        toBit(input.remindersEnabled ?? true),
        now,
        now,
      ],
    );
    await logAudit(tx, { profileId: id, action: 'create', entityType: 'profile', entityId: id, at: now });
  });
  return (await getProfile(db, id)) as Profile;
}

export async function updateProfile(db: SqlDatabase, id: string, input: ProfileInput, now = new Date().toISOString()): Promise<Profile> {
  await db.transaction(async (tx) => {
    const res = await tx.runAsync(
      `UPDATE profiles SET display_name = ?, date_of_birth = ?, sex = ?, locale = ?, timezone = ?, glucose_unit = ?, weight_unit = ?,
        temperature_unit = ?, emergency_number = ?, reminder_privacy = ?, reminders_enabled = ?, updated_at = ? WHERE id = ?`,
      [
        input.displayName.trim(),
        optText(input.dateOfBirth),
        input.sex ?? null,
        input.locale,
        input.timezone,
        input.glucoseUnit,
        input.weightUnit,
        input.temperatureUnit,
        optText(input.emergencyNumber),
        toBit(input.reminderPrivacy ?? true),
        toBit(input.remindersEnabled ?? true),
        now,
        id,
      ],
    );
    if (res.changes === 0) throw new NotFoundError('Profile');
    await logAudit(tx, { profileId: id, action: 'update', entityType: 'profile', entityId: id, at: now });
  });
  return (await getProfile(db, id)) as Profile;
}

export async function getProfile(db: SqlExecutor, id: string): Promise<Profile | null> {
  const r = await db.getFirstAsync<Record<string, unknown>>('SELECT * FROM profiles WHERE id = ?', [id]);
  return r ? mapProfile(r) : null;
}

export async function listProfiles(db: SqlExecutor): Promise<Profile[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>('SELECT * FROM profiles ORDER BY is_demo ASC, created_at ASC');
  return rows.map(mapProfile);
}

/* ---------- conditions ---------- */

export interface ConditionInput {
  name: string;
  category: ConditionCategory;
  diagnosedOn?: string | null;
  notes?: string | null;
  status?: 'active' | 'resolved';
}

export async function addCondition(db: SqlDatabase, profileId: string, input: ConditionInput, now = new Date().toISOString()): Promise<string> {
  const id = newId();
  await db.transaction(async (tx) => {
    await tx.runAsync(
      'INSERT INTO conditions (id, profile_id, name, category, diagnosed_on, notes, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, profileId, input.name.trim(), input.category, optText(input.diagnosedOn), optText(input.notes), input.status ?? 'active', now, now],
    );
    await logAudit(tx, { profileId, action: 'create', entityType: 'condition', entityId: id, at: now });
  });
  return id;
}

export async function deleteCondition(db: SqlDatabase, profileId: string, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const res = await tx.runAsync('DELETE FROM conditions WHERE id = ? AND profile_id = ?', [id, profileId]);
    if (res.changes === 0) throw new NotFoundError('Condition');
    await logAudit(tx, { profileId, action: 'delete', entityType: 'condition', entityId: id });
  });
}

export async function listConditions(db: SqlExecutor, profileId: string): Promise<Condition[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    "SELECT * FROM conditions WHERE profile_id = ? ORDER BY status = 'resolved', created_at",
    [profileId],
  );
  return rows.map(mapCondition);
}

/* ---------- clinician targets ---------- */

export interface TargetInput {
  metric: TargetMetric;
  low: number | null;
  high: number | null;
  unit: string;
  setBy: string;
  setOn?: string | null;
  notes?: string | null;
}

export async function upsertTarget(db: SqlDatabase, profileId: string, input: TargetInput, now = new Date().toISOString()): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.runAsync(
      `INSERT INTO target_ranges (id, profile_id, metric, low, high, unit, set_by, set_on, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(profile_id, metric) DO UPDATE SET low = excluded.low, high = excluded.high, unit = excluded.unit,
         set_by = excluded.set_by, set_on = excluded.set_on, notes = excluded.notes, updated_at = excluded.updated_at`,
      [newId(), profileId, input.metric, input.low, input.high, input.unit, input.setBy.trim(), optText(input.setOn), optText(input.notes), now, now],
    );
    await logAudit(tx, { profileId, action: 'update', entityType: 'target_range', entityId: input.metric, at: now });
  });
}

export async function deleteTarget(db: SqlDatabase, profileId: string, metric: TargetMetric): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.runAsync('DELETE FROM target_ranges WHERE profile_id = ? AND metric = ?', [profileId, metric]);
    await logAudit(tx, { profileId, action: 'delete', entityType: 'target_range', entityId: metric });
  });
}

export async function listTargets(db: SqlExecutor, profileId: string): Promise<ClinicianTarget[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>('SELECT * FROM target_ranges WHERE profile_id = ? ORDER BY metric', [profileId]);
  return rows.map(mapTarget);
}

/* ---------- app settings (non-health key/value) ---------- */

export const SETTINGS = {
  activeProfileId: 'active_profile_id',
  appLockEnabled: 'app_lock_enabled',
  onboardingComplete: 'onboarding_complete',
  activeModelId: 'active_model_id',
  lastTimeZone: 'last_time_zone',
  notificationsAsked: 'notifications_asked',
} as const;

export async function getSetting(db: SqlExecutor, key: string): Promise<string | null> {
  const r = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', [key]);
  return r?.value ?? null;
}

export async function setSetting(db: SqlExecutor, key: string, value: string | null): Promise<void> {
  if (value === null) {
    await db.runAsync('DELETE FROM app_settings WHERE key = ?', [key]);
    return;
  }
  await db.runAsync(
    'INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
    [key, value, new Date().toISOString()],
  );
}
