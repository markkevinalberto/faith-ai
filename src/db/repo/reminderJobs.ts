import type { DesiredReminder } from '../../domain/reminders';
import { newId } from '../../lib/id';
import type { SqlExecutor } from '../sql';

export interface ReminderJobRow {
  id: string;
  profileId: string | null;
  jobKey: string;
  kind: string;
  entityId: string | null;
  fireAt: string;
  notificationId: string | null;
  contentHash: string;
  status: 'scheduled' | 'cancelled' | 'failed';
  lastError: string | null;
}

export async function listReminderJobs(db: SqlExecutor): Promise<ReminderJobRow[]> {
  const rows = await db.getAllAsync<Record<string, string | null>>('SELECT * FROM reminder_jobs ORDER BY fire_at');
  return rows.map((r) => ({
    id: r.id as string,
    profileId: r.profile_id,
    jobKey: r.job_key as string,
    kind: r.kind as string,
    entityId: r.entity_id,
    fireAt: r.fire_at as string,
    notificationId: r.notification_id,
    contentHash: r.content_hash as string,
    status: r.status as ReminderJobRow['status'],
    lastError: r.last_error,
  }));
}

export async function recordScheduled(db: SqlExecutor, r: DesiredReminder, notificationId: string, now = new Date().toISOString()): Promise<void> {
  await db.runAsync(
    `INSERT INTO reminder_jobs (id, profile_id, job_key, kind, entity_id, fire_at, notification_id, content_hash, status, last_error, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', NULL, ?, ?)
     ON CONFLICT(job_key) DO UPDATE SET profile_id = excluded.profile_id, kind = excluded.kind, entity_id = excluded.entity_id,
       fire_at = excluded.fire_at, notification_id = excluded.notification_id, content_hash = excluded.content_hash,
       status = 'scheduled', last_error = NULL, updated_at = excluded.updated_at`,
    [newId(), r.profileId, r.jobKey, r.kind, r.entityId, r.fireAt, notificationId, r.contentHash, now, now],
  );
}

export async function recordFailed(db: SqlExecutor, r: DesiredReminder, error: string, now = new Date().toISOString()): Promise<void> {
  await db.runAsync(
    `INSERT INTO reminder_jobs (id, profile_id, job_key, kind, entity_id, fire_at, notification_id, content_hash, status, last_error, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 'failed', ?, ?, ?)
     ON CONFLICT(job_key) DO UPDATE SET status = 'failed', last_error = excluded.last_error, fire_at = excluded.fire_at,
       content_hash = excluded.content_hash, updated_at = excluded.updated_at`,
    [newId(), r.profileId, r.jobKey, r.kind, r.entityId, r.fireAt, r.contentHash, error.slice(0, 200), now, now],
  );
}

/** Removes job rows that are no longer scheduled in the OS (keeps the table a mirror of reality). */
export async function pruneJobs(db: SqlExecutor, keepJobKeys: string[]): Promise<number> {
  const all = await db.getAllAsync<{ job_key: string }>('SELECT job_key FROM reminder_jobs');
  const keep = new Set(keepJobKeys);
  let removed = 0;
  for (const r of all) {
    if (!keep.has(r.job_key)) {
      await db.runAsync('DELETE FROM reminder_jobs WHERE job_key = ?', [r.job_key]);
      removed++;
    }
  }
  return removed;
}
