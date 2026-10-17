import {assertRecommissioningMutation} from '@/lib/recommissioning-gate';
import { ConflictError, ForbiddenError, NotFoundError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';

/** Hold current identity, company, membership and lifecycle evidence until commit/replay. */
export async function lockDraftActor(db: DbClient, scope: {
  tenantId: UUID; projectId: UUID; actorId: UUID; sessionVersion: number;
}, role: 'REQUESTER' | 'PROJECT_ADMIN', mutation = true, completionPath?: string): Promise<{ companyId: UUID }> {
  const { rows } = await db.query<{ company_id: UUID; status: string }>(
    `SELECT u.company_id, p.status FROM project_memberships pm
     JOIN projects p ON p.id = pm.project_id AND p.tenant_id = $1
     JOIN users u ON u.id = pm.user_id AND u.tenant_id = p.tenant_id
     JOIN companies c ON c.id = u.company_id AND c.tenant_id = u.tenant_id
     WHERE pm.project_id = $2 AND pm.user_id = $3 AND pm.access_disabled_at IS NULL
       AND (($4='REQUESTER' AND pm.role='REQUESTER') OR
         ($4='PROJECT_ADMIN' AND c.type IN ('GC','OWNER_REP') AND EXISTS(
           SELECT 1 FROM project_admin_grants g WHERE g.tenant_id=p.tenant_id
             AND g.project_id=pm.project_id AND g.user_id=pm.user_id AND g.revoked_at IS NULL)))
       AND u.deactivated_at IS NULL AND u.session_version = $5
       AND (c.type <> 'SUBCONTRACTOR' OR pm.role = 'REQUESTER')
     FOR SHARE OF pm, p, u, c`,
    [scope.tenantId, scope.projectId, scope.actorId, role, scope.sessionVersion]);
  if (!rows[0]) throw new ForbiddenError('Current project authority is required');
  if (mutation && rows[0].status === 'ARCHIVED') throw new ConflictError('Archived projects are read-only');
  if(mutation)await assertRecommissioningMutation(db,scope.tenantId,scope.projectId,completionPath);
  return { companyId: rows[0].company_id };
}

/** Resource authorization precedes replay and remains locked against delete/restore races. */
export async function lockRequesterTicket(db: DbClient, scope: {
  tenantId: UUID; projectId: UUID; ticketId: UUID; actorId: UUID;
}): Promise<void> {
  const { rows } = await db.query<{ requester_id: UUID }>(
    `SELECT requester_id FROM tickets WHERE tenant_id = $1 AND project_id = $2 AND id = $3
     AND draft_deleted_at IS NULL FOR UPDATE`, [scope.tenantId, scope.projectId, scope.ticketId]);
  if (!rows[0]) throw new NotFoundError('SWR not found');
  if (rows[0].requester_id !== scope.actorId) throw new ForbiddenError('Only the original requester may change this SWR');
}
