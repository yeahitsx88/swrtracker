import type { DbClient, UUID } from '@/shared/types';
import type { HelpFlag } from '../application/help-flags';
import type { HelpPickupPort } from '../application/help-pickup-options';

export class HelpPickupRepository implements HelpPickupPort {
  async list(db: DbClient, flag: HelpFlag, actorId: UUID, search: string, limit: number, offset: number) {
    return (await db.query<{ id: UUID; name: string }>(
      `SELECT t.id,t.ticket_number AS name FROM tickets t
       JOIN projects p ON p.id=t.project_id AND p.tenant_id=t.tenant_id AND p.status='ACTIVE'
       JOIN users u ON u.id=$5 AND u.tenant_id=t.tenant_id AND u.deactivated_at IS NULL
       JOIN companies c ON c.id=u.company_id AND c.tenant_id=t.tenant_id
       WHERE t.tenant_id=$1 AND t.project_id=$2 AND t.id=ANY($3::uuid[])
         AND t.assigned_party_chief_id=$4 AND t.draft_deleted_at IS NULL
         AND t.status IN ('ASSIGNED','IN_PROGRESS','PENDING_PC_APPROVAL','DELAYED')
         AND t.ticket_number IS NOT NULL
         AND (c.type<>'SUBCONTRACTOR' OR c.id=t.company_id)
         AND STRPOS(LOWER(t.ticket_number),LOWER($6))>0
         AND EXISTS (SELECT 1 FROM project_memberships pm WHERE pm.project_id=t.project_id
           AND pm.user_id=u.id AND pm.role='PARTY_CHIEF')
       ORDER BY t.created_at,t.id LIMIT $7 OFFSET $8`,
      [flag.tenantId,flag.projectId,flag.affectedTicketIds,flag.raisedBy,actorId,search,limit,offset],
    )).rows;
  }
}
