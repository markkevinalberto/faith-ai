/** Laboratory tests, results, appointments and attached documents. */
import type { Appointment, AppointmentStatus, DocumentRecord, LabResult, LabStatus, LabTest } from '../../domain/types';
import { newId } from '../../lib/id';
import { mapAppointment, mapDocument, mapLabResult, mapLabTest, optText } from '../rows';
import { NotFoundError, toBit, type SqlDatabase, type SqlExecutor } from '../sql';
import { logAudit } from './audit';

/* ---------- lab tests ---------- */

export interface LabTestInput {
  name: string;
  orderedBy?: string | null;
  location?: string | null;
  scheduledAt?: string | null;
  timezone?: string | null;
  fastingRequired?: boolean;
  preparationNotes?: string | null;
  status?: LabStatus;
  reminderMinutesBefore?: number | null;
  notes?: string | null;
}

export async function createLabTest(db: SqlDatabase, profileId: string, input: LabTestInput, now = new Date().toISOString()): Promise<string> {
  const id = newId();
  await db.transaction(async (tx) => {
    await tx.runAsync(
      `INSERT INTO lab_tests (id, profile_id, name, ordered_by, location, scheduled_at, timezone, fasting_required, preparation_notes, status,
        completed_at, reminder_minutes_before, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        profileId,
        input.name.trim(),
        optText(input.orderedBy),
        optText(input.location),
        input.scheduledAt ?? null,
        input.timezone ?? null,
        toBit(input.fastingRequired ?? false),
        optText(input.preparationNotes),
        input.status ?? 'scheduled',
        input.status === 'completed' ? now : null,
        input.reminderMinutesBefore ?? null,
        optText(input.notes),
        now,
        now,
      ],
    );
    await logAudit(tx, { profileId, action: 'create', entityType: 'lab_test', entityId: id, at: now });
  });
  return id;
}

export async function updateLabTest(db: SqlDatabase, profileId: string, id: string, input: LabTestInput, now = new Date().toISOString()): Promise<void> {
  await db.transaction(async (tx) => {
    const res = await tx.runAsync(
      `UPDATE lab_tests SET name = ?, ordered_by = ?, location = ?, scheduled_at = ?, timezone = ?, fasting_required = ?, preparation_notes = ?,
        status = ?, completed_at = CASE WHEN ? = 'completed' THEN COALESCE(completed_at, ?) ELSE NULL END,
        reminder_minutes_before = ?, notes = ?, updated_at = ? WHERE id = ? AND profile_id = ?`,
      [
        input.name.trim(),
        optText(input.orderedBy),
        optText(input.location),
        input.scheduledAt ?? null,
        input.timezone ?? null,
        toBit(input.fastingRequired ?? false),
        optText(input.preparationNotes),
        input.status ?? 'scheduled',
        input.status ?? 'scheduled',
        now,
        input.reminderMinutesBefore ?? null,
        optText(input.notes),
        now,
        id,
        profileId,
      ],
    );
    if (res.changes === 0) throw new NotFoundError('Lab test');
    await logAudit(tx, { profileId, action: 'update', entityType: 'lab_test', entityId: id, at: now });
  });
}

export async function setLabStatus(db: SqlDatabase, profileId: string, id: string, status: LabStatus, now = new Date().toISOString()): Promise<void> {
  await db.transaction(async (tx) => {
    const res = await tx.runAsync(
      "UPDATE lab_tests SET status = ?, completed_at = CASE WHEN ? = 'completed' THEN ? ELSE NULL END, updated_at = ? WHERE id = ? AND profile_id = ?",
      [status, status, now, now, id, profileId],
    );
    if (res.changes === 0) throw new NotFoundError('Lab test');
    await logAudit(tx, { profileId, action: 'status_change', entityType: 'lab_test', entityId: id, detail: `status: ${status}`, at: now });
  });
}

export async function deleteLabTest(db: SqlDatabase, profileId: string, id: string): Promise<string[]> {
  return db.transaction(async (tx) => {
    const docs = await tx.getAllAsync<{ relative_path: string }>('SELECT relative_path FROM documents WHERE lab_test_id = ? AND profile_id = ?', [id, profileId]);
    const res = await tx.runAsync('DELETE FROM lab_tests WHERE id = ? AND profile_id = ?', [id, profileId]);
    if (res.changes === 0) throw new NotFoundError('Lab test');
    await logAudit(tx, { profileId, action: 'delete', entityType: 'lab_test', entityId: id });
    return docs.map((d) => d.relative_path);
  });
}

export async function getLabTest(db: SqlExecutor, profileId: string, id: string): Promise<LabTest | null> {
  const r = await db.getFirstAsync<Record<string, unknown>>('SELECT * FROM lab_tests WHERE id = ? AND profile_id = ?', [id, profileId]);
  return r ? mapLabTest(r) : null;
}

export async function listLabTests(db: SqlExecutor, profileId: string): Promise<LabTest[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM lab_tests WHERE profile_id = ?
      ORDER BY CASE status WHEN 'scheduled' THEN 0 WHEN 'completed' THEN 1 ELSE 2 END,
               CASE WHEN status = 'scheduled' THEN scheduled_at END ASC,
               COALESCE(completed_at, scheduled_at, created_at) DESC`,
    [profileId],
  );
  return rows.map(mapLabTest);
}

/* ---------- lab results ---------- */

export interface LabResultInput {
  analyte: string;
  valueNum?: number | null;
  valueText?: string | null;
  unit?: string | null;
  referenceLow?: number | null;
  referenceHigh?: number | null;
  referenceText?: string | null;
  labFlag?: string | null;
  resultDate: string;
  notes?: string | null;
}

export async function addLabResult(db: SqlDatabase, profileId: string, labTestId: string, input: LabResultInput, now = new Date().toISOString()): Promise<string> {
  const id = newId();
  await db.transaction(async (tx) => {
    await tx.runAsync(
      `INSERT INTO lab_results (id, profile_id, lab_test_id, analyte, value_num, value_text, unit, reference_low, reference_high, reference_text,
        lab_flag, result_date, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        profileId,
        labTestId,
        input.analyte.trim(),
        input.valueNum ?? null,
        optText(input.valueText),
        optText(input.unit),
        input.referenceLow ?? null,
        input.referenceHigh ?? null,
        optText(input.referenceText),
        optText(input.labFlag),
        input.resultDate,
        optText(input.notes),
        now,
        now,
      ],
    );
    await logAudit(tx, { profileId, action: 'create', entityType: 'lab_result', entityId: id, at: now });
  });
  return id;
}

/** Adds a line to a lab result's notes (e.g. an answer to FAITH's follow-up question), keeping what was there. */
export async function appendLabResultNote(db: SqlDatabase, profileId: string, id: string, line: string, now = new Date().toISOString()): Promise<void> {
  await db.transaction(async (tx) => {
    const res = await tx.runAsync(
      `UPDATE lab_results SET notes = CASE WHEN notes IS NULL OR trim(notes) = '' THEN ? ELSE notes || char(10) || ? END, updated_at = ? WHERE id = ? AND profile_id = ?`,
      [line, line, now, id, profileId],
    );
    if (res.changes === 0) throw new NotFoundError('Lab result');
    await logAudit(tx, { profileId, action: 'update', entityType: 'lab_result', entityId: id, detail: 'check-in answer', at: now });
  });
}

export async function deleteLabResult(db: SqlDatabase, profileId: string, id: string): Promise<void> {
  const res = await db.runAsync('DELETE FROM lab_results WHERE id = ? AND profile_id = ?', [id, profileId]);
  if (res.changes === 0) throw new NotFoundError('Lab result');
}

export async function listLabResults(db: SqlExecutor, profileId: string, labTestId?: string): Promise<LabResult[]> {
  const rows = labTestId
    ? await db.getAllAsync<Record<string, unknown>>('SELECT * FROM lab_results WHERE profile_id = ? AND lab_test_id = ? ORDER BY analyte', [profileId, labTestId])
    : await db.getAllAsync<Record<string, unknown>>('SELECT * FROM lab_results WHERE profile_id = ? ORDER BY result_date DESC, analyte', [profileId]);
  return rows.map(mapLabResult);
}

/* ---------- appointments ---------- */

export interface AppointmentInput {
  title: string;
  clinician?: string | null;
  location?: string | null;
  startsAt: string;
  timezone: string;
  durationMin?: number | null;
  status?: AppointmentStatus;
  reminderMinutesBefore?: number | null;
  preparationNotes?: string | null;
  questions?: string | null;
  notes?: string | null;
}

export async function createAppointment(db: SqlDatabase, profileId: string, input: AppointmentInput, now = new Date().toISOString()): Promise<string> {
  const id = newId();
  await db.transaction(async (tx) => {
    await tx.runAsync(
      `INSERT INTO appointments (id, profile_id, title, clinician, location, starts_at, timezone, duration_min, status, reminder_minutes_before,
        preparation_notes, questions, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        profileId,
        input.title.trim(),
        optText(input.clinician),
        optText(input.location),
        input.startsAt,
        input.timezone,
        input.durationMin ?? null,
        input.status ?? 'scheduled',
        input.reminderMinutesBefore ?? null,
        optText(input.preparationNotes),
        optText(input.questions),
        optText(input.notes),
        now,
        now,
      ],
    );
    await logAudit(tx, { profileId, action: 'create', entityType: 'appointment', entityId: id, at: now });
  });
  return id;
}

export async function updateAppointment(db: SqlDatabase, profileId: string, id: string, input: AppointmentInput, now = new Date().toISOString()): Promise<void> {
  await db.transaction(async (tx) => {
    const res = await tx.runAsync(
      `UPDATE appointments SET title = ?, clinician = ?, location = ?, starts_at = ?, timezone = ?, duration_min = ?, status = ?,
        reminder_minutes_before = ?, preparation_notes = ?, questions = ?, notes = ?, updated_at = ? WHERE id = ? AND profile_id = ?`,
      [
        input.title.trim(),
        optText(input.clinician),
        optText(input.location),
        input.startsAt,
        input.timezone,
        input.durationMin ?? null,
        input.status ?? 'scheduled',
        input.reminderMinutesBefore ?? null,
        optText(input.preparationNotes),
        optText(input.questions),
        optText(input.notes),
        now,
        id,
        profileId,
      ],
    );
    if (res.changes === 0) throw new NotFoundError('Appointment');
    await logAudit(tx, { profileId, action: 'update', entityType: 'appointment', entityId: id, at: now });
  });
}

export async function setAppointmentStatus(db: SqlDatabase, profileId: string, id: string, status: AppointmentStatus, now = new Date().toISOString()): Promise<void> {
  await db.transaction(async (tx) => {
    const res = await tx.runAsync('UPDATE appointments SET status = ?, updated_at = ? WHERE id = ? AND profile_id = ?', [status, now, id, profileId]);
    if (res.changes === 0) throw new NotFoundError('Appointment');
    await logAudit(tx, { profileId, action: 'status_change', entityType: 'appointment', entityId: id, detail: `status: ${status}`, at: now });
  });
}

export async function deleteAppointment(db: SqlDatabase, profileId: string, id: string): Promise<string[]> {
  return db.transaction(async (tx) => {
    const docs = await tx.getAllAsync<{ relative_path: string }>('SELECT relative_path FROM documents WHERE appointment_id = ? AND profile_id = ?', [id, profileId]);
    const res = await tx.runAsync('DELETE FROM appointments WHERE id = ? AND profile_id = ?', [id, profileId]);
    if (res.changes === 0) throw new NotFoundError('Appointment');
    await logAudit(tx, { profileId, action: 'delete', entityType: 'appointment', entityId: id });
    return docs.map((d) => d.relative_path);
  });
}

export async function getAppointment(db: SqlExecutor, profileId: string, id: string): Promise<Appointment | null> {
  const r = await db.getFirstAsync<Record<string, unknown>>('SELECT * FROM appointments WHERE id = ? AND profile_id = ?', [id, profileId]);
  return r ? mapAppointment(r) : null;
}

export async function listAppointments(db: SqlExecutor, profileId: string): Promise<Appointment[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    "SELECT * FROM appointments WHERE profile_id = ? ORDER BY CASE status WHEN 'scheduled' THEN 0 ELSE 1 END, CASE WHEN status = 'scheduled' THEN starts_at END ASC, starts_at DESC",
    [profileId],
  );
  return rows.map(mapAppointment);
}

export async function listUpcomingAppointments(db: SqlExecutor, profileId: string, nowIso: string, limit = 5): Promise<Appointment[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    "SELECT * FROM appointments WHERE profile_id = ? AND status = 'scheduled' AND starts_at >= ? ORDER BY starts_at LIMIT ?",
    [profileId, nowIso, limit],
  );
  return rows.map(mapAppointment);
}

/* ---------- documents ---------- */

export interface DocumentInput {
  title: string;
  relativePath: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  labTestId?: string | null;
  appointmentId?: string | null;
}

export async function addDocument(db: SqlDatabase, profileId: string, input: DocumentInput, now = new Date().toISOString()): Promise<string> {
  const id = newId();
  await db.transaction(async (tx) => {
    await tx.runAsync(
      'INSERT INTO documents (id, profile_id, lab_test_id, appointment_id, title, relative_path, mime_type, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, profileId, input.labTestId ?? null, input.appointmentId ?? null, input.title.trim() || 'Document', input.relativePath, input.mimeType ?? null, input.sizeBytes ?? null, now],
    );
    await logAudit(tx, { profileId, action: 'create', entityType: 'document', entityId: id, at: now });
  });
  return id;
}

export async function deleteDocument(db: SqlDatabase, profileId: string, id: string): Promise<string> {
  return db.transaction(async (tx) => {
    const doc = await tx.getFirstAsync<{ relative_path: string }>('SELECT relative_path FROM documents WHERE id = ? AND profile_id = ?', [id, profileId]);
    if (!doc) throw new NotFoundError('Document');
    await tx.runAsync('DELETE FROM documents WHERE id = ? AND profile_id = ?', [id, profileId]);
    await logAudit(tx, { profileId, action: 'delete', entityType: 'document', entityId: id });
    return doc.relative_path;
  });
}

export async function listDocuments(db: SqlExecutor, profileId: string, filter: { labTestId?: string; appointmentId?: string } = {}): Promise<DocumentRecord[]> {
  if (filter.labTestId) {
    return (await db.getAllAsync<Record<string, unknown>>('SELECT * FROM documents WHERE profile_id = ? AND lab_test_id = ? ORDER BY created_at DESC', [profileId, filter.labTestId])).map(mapDocument);
  }
  if (filter.appointmentId) {
    return (
      await db.getAllAsync<Record<string, unknown>>('SELECT * FROM documents WHERE profile_id = ? AND appointment_id = ? ORDER BY created_at DESC', [profileId, filter.appointmentId])
    ).map(mapDocument);
  }
  return (await db.getAllAsync<Record<string, unknown>>('SELECT * FROM documents WHERE profile_id = ? ORDER BY created_at DESC', [profileId])).map(mapDocument);
}
