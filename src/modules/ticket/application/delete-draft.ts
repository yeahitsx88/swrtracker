import { ConflictError, ForbiddenError, NotFoundError } from '@/shared/errors';
import { appendAuditEvent } from '@/modules/audit/application';
import type { DbClient, UUID } from '@/shared/types';

export async function deleteDraft(db: DbClient, scope: {
  tenantId: UUID; projectId: UUID; ticketId: UUID; actorId: UUID; expectedVersion: number;
}): Promise<void> {
  const { rows } = await db.query<{ requester_id: UUID; status: string; row_version: number; draft_deleted_at: Date | null }>(
    `SELECT requester_id, status, row_version, draft_deleted_at FROM tickets
     WHERE tenant_id = $1 AND project_id = $2 AND id = $3 FOR UPDATE`,
    [scope.tenantId, scope.projectId, scope.ticketId]);
  const draft = rows[0];
  if (!draft || draft.draft_deleted_at) throw new NotFoundError('Draft not found');
  if (draft.requester_id !== scope.actorId) throw new ForbiddenError('You may only delete your own draft');
  if (draft.status !== 'DRAFT') throw new ConflictError('Only an unsubmitted draft may be deleted');
  if (draft.row_version !== scope.expectedVersion) throw new ConflictError('Draft changed. Reload before deleting.', 'WORKFLOW_STALE_STATE');
  await db.query(`UPDATE tickets SET draft_deleted_at = NOW(), draft_deleted_reason = 'REQUESTER_DELETED',
    updated_at = NOW(), row_version = row_version + 1 WHERE tenant_id = $1 AND project_id = $2 AND id = $3`,
    [scope.tenantId, scope.projectId, scope.ticketId]);
  await appendAuditEvent(db, { tenantId: scope.tenantId, ticketId: scope.ticketId, actorId: scope.actorId,
    eventType: 'ticket.draft_deleted', payload: { reason: 'REQUESTER_DELETED' } });
}
