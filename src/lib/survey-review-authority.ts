import { ForbiddenError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';

/** Resolve and lock the explicit review grant inside the caller's mutation transaction. */
export async function requireSurveyReviewAuthority(
  db: DbClient,
  scope: { tenantId: UUID; projectId: UUID; aorNodeId: UUID | null },
  actor: { actorId: UUID; actorRole: ProjectRole },
): Promise<Record<string, unknown>> {
  if (actor.actorRole === 'SURVEY_MANAGER') return { kind: 'PROJECT_ROLE', role: 'SURVEY_MANAGER' };
  if (actor.actorRole !== 'SURVEY_SUPERINTENDENT') {
    throw new ForbiddenError('Survey review requires the Survey Manager or an explicitly authorized Area Superintendent');
  }
  if (!scope.aorNodeId) throw new ForbiddenError('An incomplete draft has no delegated Area review authority');
  const { rows } = await db.query<{
    id: UUID; aor_node_id: UUID; granted_by: UUID; granted_at: Date;
  }>(
    `WITH RECURSIVE ancestors AS (
       SELECT id, parent_id FROM aor_nodes
       WHERE tenant_id = $1 AND project_id = $2 AND id = $3
       UNION
       SELECT n.id, n.parent_id FROM aor_nodes n
       JOIN ancestors a ON a.parent_id = n.id
       WHERE n.tenant_id = $1 AND n.project_id = $2
     )
     SELECT g.id, g.aor_node_id, g.granted_by, g.granted_at
     FROM project_responsibility_grants g
     JOIN users u ON u.id = g.user_id AND u.tenant_id = g.tenant_id
     JOIN project_memberships pm ON pm.user_id = g.user_id AND pm.project_id = g.project_id
     JOIN companies c ON c.id = u.company_id AND c.tenant_id = u.tenant_id
     WHERE g.tenant_id = $1 AND g.project_id = $2 AND g.user_id = $4
       AND g.responsibility = 'SURVEY_REVIEWER' AND g.revoked_at IS NULL
       AND g.aor_node_id IN (SELECT id FROM ancestors)
       AND u.deactivated_at IS NULL AND pm.role = 'SURVEY_SUPERINTENDENT'
       AND c.type <> 'SUBCONTRACTOR'
     ORDER BY g.granted_at, g.id LIMIT 1
     FOR SHARE OF g, u, pm, c`,
    [scope.tenantId, scope.projectId, scope.aorNodeId, actor.actorId],
  );
  const grant = rows[0];
  if (!grant) throw new ForbiddenError('No active Survey Reviewer grant covers this Area');
  return {
    kind: 'AREA_GRANT', grantId: grant.id, aorNodeId: grant.aor_node_id,
    ticketAorNodeId: scope.aorNodeId, grantedBy: grant.granted_by, grantedAt: grant.granted_at,
  };
}
