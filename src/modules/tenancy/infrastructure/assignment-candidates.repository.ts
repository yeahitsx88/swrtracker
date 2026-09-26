import type { DbClient, UUID } from '@/shared/types';
import type { AssignmentCandidatesPort, CandidateQuery } from '../application/assignment-candidates';

export class AssignmentCandidatesRepository implements AssignmentCandidatesPort {
  async list(db: DbClient, params: CandidateQuery): Promise<Array<{ id: UUID; name: string }>> {
    const { rows } = await db.query<{ id: UUID; name: string }>(`WITH RECURSIVE ancestors AS (
      SELECT id,parent_id FROM aor_nodes WHERE tenant_id=$1 AND project_id=$2 AND id=$4
      UNION
      SELECT n.id,n.parent_id FROM aor_nodes n JOIN ancestors a ON a.parent_id=n.id
        WHERE n.tenant_id=$1 AND n.project_id=$2
    ) SELECT u.id,u.name FROM users u
      JOIN project_memberships pm ON pm.user_id=u.id AND pm.project_id=$2 AND pm.role=$3
      JOIN projects p ON p.id=pm.project_id AND p.tenant_id=u.tenant_id AND p.status='ACTIVE'
      WHERE u.tenant_id=$1 AND u.deactivated_at IS NULL
        AND STRPOS(LOWER(u.name),LOWER($5))>0
        AND ($4::uuid IS NULL OR EXISTS (SELECT 1 FROM aor_assignments aa
          JOIN ancestors a ON a.id=aa.aor_node_id WHERE aa.tenant_id=$1 AND aa.project_id=$2
            AND aa.user_id=u.id AND aa.deactivated_at IS NULL))
        AND ($8::uuid IS NULL OR EXISTS (SELECT 1 FROM crew_rosters cr
          WHERE cr.tenant_id=$1 AND cr.project_id=$2 AND cr.party_chief_id=$8
            AND cr.instrument_man_id=u.id AND cr.deactivated_at IS NULL))
      ORDER BY u.name,u.id LIMIT $6 OFFSET $7`,
      [params.tenantId, params.projectId, params.role, params.aorNodeId,
        params.search, params.limit, params.offset, params.crewChiefId ?? null]);
    return rows;
  }
}
