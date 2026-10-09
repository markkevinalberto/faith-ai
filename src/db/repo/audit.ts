import { newId } from '../../lib/id';
import type { SqlExecutor } from '../sql';

export type AuditAction = 'create' | 'update' | 'delete' | 'status_change' | 'export' | 'import' | 'seed';

/**
 * Local-only audit trail of changes (who/what/when). `detail` holds structural metadata such as
 * "status: upcoming→taken" — it lives in the encrypted DB and is deleted with the profile.
 */
export async function logAudit(
  db: SqlExecutor,
  entry: { profileId: string | null; action: AuditAction; entityType: string; entityId?: string | null; detail?: string | null; at?: string },
): Promise<void> {
  await db.runAsync(
    'INSERT INTO audit_events (id, profile_id, action, entity_type, entity_id, at, detail) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [newId(), entry.profileId, entry.action, entry.entityType, entry.entityId ?? null, entry.at ?? new Date().toISOString(), entry.detail ?? null],
  );
}

export interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  at: string;
  detail: string | null;
}

export async function listAudit(db: SqlExecutor, profileId: string, limit = 100): Promise<AuditEntry[]> {
  const rows = await db.getAllAsync<{ id: string; action: string; entity_type: string; entity_id: string | null; at: string; detail: string | null }>(
    'SELECT id, action, entity_type, entity_id, at, detail FROM audit_events WHERE profile_id = ? ORDER BY at DESC LIMIT ?',
    [profileId, limit],
  );
  return rows.map((r) => ({ id: r.id, action: r.action, entityType: r.entity_type, entityId: r.entity_id, at: r.at, detail: r.detail }));
}
