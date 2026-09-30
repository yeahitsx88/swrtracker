import type { DbClient, UUID } from '@/shared/types';
import type { LinkedCrewArea, SuperintendentCrewRepository } from '../application/read-superintendent-crews';

export class SuperintendentCrewsPgRepository implements SuperintendentCrewRepository {
  async linkedCrewAreas(db: DbClient, tenantId: UUID, projectId: UUID, superintendentId: UUID, authorizedAreaIds: UUID[]): Promise<LinkedCrewArea[]> {
    const { rows } = await db.query<LinkedCrewArea>(
      `WITH RECURSIVE linked_nodes AS (
         SELECT rl.party_chief_id,n.id AS area_id FROM survey_reporting_links rl
         JOIN aor_nodes n ON n.tenant_id=rl.tenant_id AND n.project_id=rl.project_id AND n.id=rl.aor_node_id AND n.retired_at IS NULL
         JOIN project_memberships pc ON pc.project_id=rl.project_id AND pc.user_id=rl.party_chief_id AND pc.role='PARTY_CHIEF'
         JOIN users cu ON cu.tenant_id=rl.tenant_id AND cu.id=pc.user_id AND cu.deactivated_at IS NULL
         JOIN companies cc ON cc.tenant_id=cu.tenant_id AND cc.id=cu.company_id AND cc.type<>'SUBCONTRACTOR'
         JOIN project_memberships sp ON sp.project_id=rl.project_id AND sp.user_id=rl.superintendent_id AND sp.role='SURVEY_SUPERINTENDENT'
         JOIN users su ON su.tenant_id=rl.tenant_id AND su.id=sp.user_id AND su.deactivated_at IS NULL
         JOIN companies sc ON sc.tenant_id=su.tenant_id AND sc.id=su.company_id AND sc.type<>'SUBCONTRACTOR'
         WHERE rl.tenant_id=$1 AND rl.project_id=$2 AND rl.superintendent_id=$3 AND rl.deactivated_at IS NULL
         UNION
         SELECT parent.party_chief_id,child.id FROM linked_nodes parent
         JOIN aor_nodes child ON child.parent_id=parent.area_id AND child.tenant_id=$1 AND child.project_id=$2
       ) SELECT DISTINCT party_chief_id AS "partyChiefId",area_id AS "areaId" FROM linked_nodes
         WHERE area_id=ANY($4::uuid[]) ORDER BY party_chief_id,area_id`,
      [tenantId,projectId,superintendentId,authorizedAreaIds]);
    return rows;
  }
}
