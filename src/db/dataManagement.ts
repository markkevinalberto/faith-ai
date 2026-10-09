/**
 * Export and permanent deletion of a profile's health data.
 * File-system work (writing the export, deleting attachments) is done by services/files.ts using
 * the paths returned here, so this module stays testable against plain SQLite.
 */
import { formatBloodPressure } from '../domain/units';
import type { Profile, VitalReading } from '../domain/types';
import { listAudit } from './repo/audit';
import { listAppointments, listDocuments, listLabResults, listLabTests } from './repo/care';
import { listMedications } from './repo/medications';
import { getProfile, listConditions, listTargets } from './repo/profiles';
import { listCustomTypes, listReadings } from './repo/vitals';
import { mapDoseEvent } from './rows';
import { LATEST_SCHEMA_VERSION, PROFILE_SCOPED_TABLES } from './schema';
import { NotFoundError, type SqlDatabase, type SqlExecutor } from './sql';

export const EXPORT_FORMAT = 'carely-export';
export const EXPORT_FORMAT_VERSION = 1;

export async function exportProfileData(db: SqlExecutor, profileId: string, now = new Date().toISOString()) {
  const profile = await getProfile(db, profileId);
  if (!profile) throw new NotFoundError('Profile');
  const events = (
    await db.getAllAsync<Record<string, unknown>>('SELECT * FROM medication_events WHERE profile_id = ? ORDER BY scheduled_for', [profileId])
  ).map(mapDoseEvent);
  return {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    schemaVersion: LATEST_SCHEMA_VERSION,
    exportedAt: now,
    notice:
      'This file contains personal health information in plain text. Store it securely and share it only with people you trust.',
    profile,
    conditions: await listConditions(db, profileId),
    clinicianTargets: await listTargets(db, profileId),
    medications: await listMedications(db, profileId),
    doseEvents: events,
    customVitalTypes: await listCustomTypes(db, profileId),
    readings: await listReadings(db, profileId, { order: 'asc', limit: 1_000_000 }),
    labTests: await listLabTests(db, profileId),
    labResults: await listLabResults(db, profileId),
    appointments: await listAppointments(db, profileId),
    documents: (await listDocuments(db, profileId)).map((d) => ({ ...d, note: 'File contents are not included in this export.' })),
    auditTrail: await listAudit(db, profileId, 10_000),
  };
}

export type ProfileExport = Awaited<ReturnType<typeof exportProfileData>>;

function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  // Neutralise spreadsheet formula injection and quote when needed.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function readingsToCsv(readings: VitalReading[], profile: Pick<Profile, 'displayName'>): string {
  const header = ['measured_at_utc', 'timezone', 'utc_offset_min', 'type', 'value_as_entered', 'unit', 'value_canonical', 'systolic', 'diastolic', 'pulse', 'display', 'context', 'source', 'notes'];
  const lines = [header.join(',')];
  for (const r of readings) {
    const display = r.type === 'blood_pressure' && r.systolic !== null && r.diastolic !== null ? formatBloodPressure(r.systolic, r.diastolic) : `${r.value ?? ''} ${r.unit}`;
    lines.push(
      [r.measuredAt, r.timezone, r.utcOffsetMin, r.type, r.value, r.unit, r.valueCanonical, r.systolic, r.diastolic, r.pulse, display.trim(), r.context, r.source, r.notes]
        .map(csvCell)
        .join(','),
    );
  }
  void profile;
  return lines.join('\n') + '\n';
}

export interface DeletionResult {
  documentPaths: string[];
  remainingRows: number;
}

/**
 * Permanently deletes a profile and every row that belongs to it (via ON DELETE CASCADE), then
 * verifies nothing remains. Returns document paths so the caller can delete the files.
 */
export async function deleteProfileData(db: SqlDatabase, profileId: string): Promise<DeletionResult> {
  return db.transaction(async (tx) => {
    const docs = await tx.getAllAsync<{ relative_path: string }>('SELECT relative_path FROM documents WHERE profile_id = ?', [profileId]);
    const res = await tx.runAsync('DELETE FROM profiles WHERE id = ?', [profileId]);
    if (res.changes === 0) throw new NotFoundError('Profile');
    const remainingRows = await countProfileRows(tx, profileId);
    if (remainingRows !== 0) throw new Error(`Deletion incomplete: ${remainingRows} rows remain`);
    const active = await tx.getFirstAsync<{ value: string }>("SELECT value FROM app_settings WHERE key = 'active_profile_id'");
    if (active?.value === profileId) await tx.runAsync("DELETE FROM app_settings WHERE key = 'active_profile_id'");
    return { documentPaths: docs.map((d) => d.relative_path), remainingRows };
  });
}

export async function countProfileRows(db: SqlExecutor, profileId: string): Promise<number> {
  let total = 0;
  for (const table of PROFILE_SCOPED_TABLES) {
    const r = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE profile_id = ?`, [profileId]);
    total += r?.n ?? 0;
  }
  const p = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM profiles WHERE id = ?', [profileId]);
  return total + (p?.n ?? 0);
}
