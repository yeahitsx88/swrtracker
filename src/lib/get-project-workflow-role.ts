import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import { getProjectRole } from './get-project-role';

/** Acting Survey Manager authority is scoped to active project workflow only. */
export async function getProjectWorkflowRole(db: DbClient, tenantId: UUID,
  projectId: UUID, userId: UUID): Promise<ProjectRole> {
  const realRole = await getProjectRole(db, tenantId, projectId, userId);
  if (realRole === 'SURVEY_MANAGER') return realRole;
  const { rows } = await db.query<{ eligible: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM acting_grants ag
       JOIN projects p ON p.id=ag.project_id AND p.tenant_id=ag.tenant_id
       JOIN users u ON u.id=ag.user_id AND u.tenant_id=ag.tenant_id
       JOIN project_memberships pm ON pm.project_id=ag.project_id
         AND pm.user_id=ag.user_id
         AND pm.role IN ('SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN')
       WHERE ag.tenant_id=$1 AND ag.project_id=$2 AND ag.user_id=$3
         AND ag.role='SURVEY_MANAGER' AND ag.revoked_at IS NULL
         AND p.status='ACTIVE' AND u.deactivated_at IS NULL
         AND ag.scope->>'projectId'=ag.project_id::text
         AND ag.scope->'actions' ? 'manage_workflow'
     ) AS eligible`, [tenantId, projectId, userId]);
  return rows[0]?.eligible ? 'SURVEY_MANAGER' : realRole;
}
