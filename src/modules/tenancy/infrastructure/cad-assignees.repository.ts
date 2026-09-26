import type { DbClient, UUID } from '@/shared/types';
import type { CadAssigneesPort, CadAssigneeQuery } from '../application/cad-assignees';

export class CadAssigneesRepository implements CadAssigneesPort {
  async list(db: DbClient, params: CadAssigneeQuery): Promise<Array<{ id: UUID; name: string }>> {
    return (await db.query<{ id: UUID; name: string }>(
      `SELECT u.id,u.name FROM users u
       JOIN companies c ON c.id=u.company_id AND c.tenant_id=u.tenant_id
       WHERE u.tenant_id=$1 AND u.deactivated_at IS NULL
         AND (c.type<>'SUBCONTRACTOR' OR c.id=$3)
         AND STRPOS(LOWER(u.name),LOWER($4))>0
         AND EXISTS (SELECT 1 FROM project_memberships pm
           JOIN projects p ON p.id=pm.project_id AND p.tenant_id=$1 AND p.status='ACTIVE'
           WHERE pm.user_id=u.id AND pm.project_id=$2 AND pm.role IN ('CAD_TECHNICIAN','CAD_LEAD'))
       ORDER BY u.name,u.id LIMIT $5 OFFSET $6`,
      [params.tenantId, params.projectId, params.ticketCompanyId, params.search, params.limit, params.offset],
    )).rows;
  }
}
