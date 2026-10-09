import { tzOffsetMinutes } from '../../domain/time';
import type { CustomVitalType, ReadingSource, VitalReading, VitalType } from '../../domain/types';
import { newId } from '../../lib/id';
import { mapCustomType, mapReading, optText } from '../rows';
import { NotFoundError, type SqlDatabase, type SqlExecutor, type SqlValue } from '../sql';
import { logAudit } from './audit';

export interface ReadingInput {
  type: VitalType;
  customTypeId?: string | null;
  /** Value as entered (not used for blood pressure). */
  value?: number | null;
  /** Unit as entered, e.g. "mmol/L", "lb", "mmHg". */
  unit: string;
  /** Value in canonical units (mg/dL, kg, °C, bpm, %, custom unit). */
  valueCanonical?: number | null;
  systolic?: number | null;
  diastolic?: number | null;
  pulse?: number | null;
  measuredAt: string;
  timezone: string;
  context?: string | null;
  source?: ReadingSource;
  notes?: string | null;
}

function readingParams(input: ReadingInput): SqlValue[] {
  return [
    input.type,
    input.customTypeId ?? null,
    input.type === 'blood_pressure' ? null : (input.value ?? null),
    input.unit,
    input.type === 'blood_pressure' ? null : (input.valueCanonical ?? input.value ?? null),
    input.systolic ?? null,
    input.diastolic ?? null,
    input.pulse ?? null,
    input.measuredAt,
    input.timezone,
    tzOffsetMinutes(Date.parse(input.measuredAt), input.timezone),
    optText(input.context),
    input.source ?? 'manual',
    optText(input.notes),
  ];
}

/** Inserts a reading using an existing executor (for bulk inserts inside one transaction). */
export async function insertReading(tx: SqlExecutor, profileId: string, input: ReadingInput, now = new Date().toISOString()): Promise<string> {
  const id = newId();
  await tx.runAsync(
    `INSERT INTO vital_readings (id, profile_id, type, custom_type_id, value, unit, value_canonical, systolic, diastolic, pulse,
      measured_at, timezone, utc_offset_min, context, source, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, profileId, ...readingParams(input), now, now],
  );
  return id;
}

export async function addReading(db: SqlDatabase, profileId: string, input: ReadingInput, now = new Date().toISOString()): Promise<string> {
  return db.transaction(async (tx) => {
    const id = await insertReading(tx, profileId, input, now);
    await logAudit(tx, { profileId, action: 'create', entityType: 'vital_reading', entityId: id, detail: input.type, at: now });
    return id;
  });
}

export async function updateReading(db: SqlDatabase, profileId: string, id: string, input: ReadingInput, now = new Date().toISOString()): Promise<void> {
  await db.transaction(async (tx) => {
    const res = await tx.runAsync(
      `UPDATE vital_readings SET type = ?, custom_type_id = ?, value = ?, unit = ?, value_canonical = ?, systolic = ?, diastolic = ?, pulse = ?,
        measured_at = ?, timezone = ?, utc_offset_min = ?, context = ?, source = ?, notes = ?, updated_at = ? WHERE id = ? AND profile_id = ?`,
      [...readingParams(input), now, id, profileId],
    );
    if (res.changes === 0) throw new NotFoundError('Reading');
    await logAudit(tx, { profileId, action: 'update', entityType: 'vital_reading', entityId: id, at: now });
  });
}

export async function deleteReading(db: SqlDatabase, profileId: string, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const res = await tx.runAsync('DELETE FROM vital_readings WHERE id = ? AND profile_id = ?', [id, profileId]);
    if (res.changes === 0) throw new NotFoundError('Reading');
    await logAudit(tx, { profileId, action: 'delete', entityType: 'vital_reading', entityId: id });
  });
}

export async function getReading(db: SqlExecutor, profileId: string, id: string): Promise<VitalReading | null> {
  const r = await db.getFirstAsync<Record<string, unknown>>('SELECT * FROM vital_readings WHERE id = ? AND profile_id = ?', [id, profileId]);
  return r ? mapReading(r) : null;
}

export interface ReadingQuery {
  type?: VitalType;
  customTypeId?: string;
  fromIso?: string;
  toIso?: string;
  limit?: number;
  order?: 'asc' | 'desc';
}

export async function listReadings(db: SqlExecutor, profileId: string, q: ReadingQuery = {}): Promise<VitalReading[]> {
  const where: string[] = ['profile_id = ?'];
  const params: SqlValue[] = [profileId];
  if (q.type) {
    where.push('type = ?');
    params.push(q.type);
  }
  if (q.customTypeId) {
    where.push('custom_type_id = ?');
    params.push(q.customTypeId);
  }
  if (q.fromIso) {
    where.push('measured_at >= ?');
    params.push(q.fromIso);
  }
  if (q.toIso) {
    where.push('measured_at < ?');
    params.push(q.toIso);
  }
  const order = q.order === 'asc' ? 'ASC' : 'DESC';
  params.push(q.limit ?? 5000);
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM vital_readings WHERE ${where.join(' AND ')} ORDER BY measured_at ${order} LIMIT ?`,
    params,
  );
  return rows.map(mapReading);
}

/** Most recent reading of each built-in type (and each custom type). */
export async function latestReadings(db: SqlExecutor, profileId: string): Promise<VitalReading[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT r.* FROM vital_readings r
      JOIN (SELECT type, COALESCE(custom_type_id, '') AS ct, MAX(measured_at) AS m FROM vital_readings WHERE profile_id = ? GROUP BY type, COALESCE(custom_type_id, '')) x
        ON x.type = r.type AND x.ct = COALESCE(r.custom_type_id, '') AND x.m = r.measured_at
     WHERE r.profile_id = ?
     ORDER BY r.measured_at DESC`,
    [profileId, profileId],
  );
  // Ties on measured_at could return two rows of the same type; keep the first.
  const seen = new Set<string>();
  return rows.map(mapReading).filter((r) => {
    const k = `${r.type}|${r.customTypeId ?? ''}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/* ---------- custom vital types ---------- */

export async function addCustomType(db: SqlDatabase, profileId: string, name: string, unit: string, decimals = 1): Promise<string> {
  const id = newId();
  const now = new Date().toISOString();
  await db.runAsync(
    'INSERT INTO custom_vital_types (id, profile_id, name, unit, decimals, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, profileId, name.trim(), unit.trim(), decimals, now, now],
  );
  return id;
}

export async function listCustomTypes(db: SqlExecutor, profileId: string): Promise<CustomVitalType[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>('SELECT * FROM custom_vital_types WHERE profile_id = ? ORDER BY name COLLATE NOCASE', [profileId]);
  return rows.map(mapCustomType);
}

export async function deleteCustomType(db: SqlDatabase, profileId: string, id: string): Promise<void> {
  const res = await db.runAsync('DELETE FROM custom_vital_types WHERE id = ? AND profile_id = ?', [id, profileId]);
  if (res.changes === 0) throw new NotFoundError('Measurement type');
}
