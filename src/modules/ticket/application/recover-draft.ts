import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors';
import { appendAuditEvent } from '@/modules/audit/application';
import type { DbClient, UUID } from '@/shared/types';

export async function recoverDraft(db: DbClient, scope: {
  tenantId: UUID; projectId: UUID; ticketId: UUID; actorId: UUID;
  expectedVersion: number; reason: string;
}): Promise<void> {
  const reason = scope.reason.trim();
  if (reason.length < 10) throw new ValidationError('Give a recovery reason of at least 10 characters');
  const { rows } = await db.query<{ requester_id: UUID; status: string; row_version: number;
    draft_deleted_at: Date | null; recoverable: boolean }>(
    `SELECT requester_id, status, row_version, draft_deleted_at,
       draft_deleted_at >= NOW() - INTERVAL '30 days' AS recoverable
     FROM tickets WHERE tenant_id = $1 AND project_id = $2 AND id = $3 FOR UPDATE`,
    [scope.tenantId, scope.projectId, scope.ticketId]);
  const draft = rows[0];
  if (!draft || draft.status !== 'DRAFT' || !draft.draft_deleted_at) throw new NotFoundError('Deleted draft not found');
  if (!draft.recoverable) throw new ConflictError('The 30-day recovery window has ended. The record and files are retained.');
  if (draft.row_version !== scope.expectedVersion) throw new ConflictError('Draft changed. Reload before restoring.', 'WORKFLOW_STALE_STATE');
  const owner = await db.query(
    `SELECT u.id FROM users u JOIN project_memberships pm ON pm.user_id = u.id
     WHERE u.tenant_id = $1 AND u.id = $2 AND pm.project_id = $3
       AND (u.deactivated_at IS NULL AND pm.access_disabled_at IS NULL) AND pm.role = 'REQUESTER' FOR SHARE OF u, pm`,
    [scope.tenantId, draft.requester_id, scope.projectId]);
  if (!owner.rows[0]) throw new ConflictError('Restore requester access before recovering their draft');
  await db.query(`UPDATE tickets SET draft_deleted_at = NULL, draft_deleted_reason = NULL,
    updated_at = NOW(), row_version = row_version + 1 WHERE tenant_id = $1 AND project_id = $2 AND id = $3`,
    [scope.tenantId, scope.projectId, scope.ticketId]);
  await appendAuditEvent(db, { tenantId: scope.tenantId, ticketId: scope.ticketId, actorId: scope.actorId,
    eventType: 'ticket.draft_recovered', payload: { reason, requesterId: draft.requester_id,
      deletedAt: draft.draft_deleted_at } });
}
