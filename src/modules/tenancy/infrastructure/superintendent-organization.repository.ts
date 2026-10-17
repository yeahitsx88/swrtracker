import type {DbClient,UUID} from '@/shared/types';
import type {TeamActor} from '../application/survey-teams';
import type {OrganizationPerson,SurveyOrganization} from '../application/read-survey-organization';
import type {SuperintendentOrganizationRepository} from '../application/read-superintendent-organization';
import {SurveyWorkforcePgRepository} from './survey-workforce.repository';
/** Read only the actor's identity and their explicit links to the already authorized workforce. */
export class SuperintendentOrganizationPgRepository extends SurveyWorkforcePgRepository implements SuperintendentOrganizationRepository {
  async ownIdentity(db:DbClient,actor:TeamActor):Promise<OrganizationPerson|null>{
    const {rows}=await db.query<OrganizationPerson>(`SELECT u.id AS "userId",u.name,pm.role,true AS active
      FROM users u JOIN companies c ON c.id=u.company_id AND c.tenant_id=u.tenant_id
      JOIN project_memberships pm ON pm.user_id=u.id JOIN projects p ON p.id=pm.project_id AND p.tenant_id=u.tenant_id
      WHERE u.tenant_id=$1 AND p.id=$2 AND u.id=$3 AND pm.role='SURVEY_SUPERINTENDENT'
      AND c.type<>'SUBCONTRACTOR' AND u.deactivated_at IS NULL AND pm.access_disabled_at IS NULL AND u.session_version=$4`,[actor.tenantId,actor.projectId,actor.actorId,actor.sessionVersion]);
    return rows[0]??null;
  }
  async ownReporting(db:DbClient,actor:TeamActor,chiefIds:UUID[]):Promise<Array<Pick<SurveyOrganization['staffing'][number],'partyChiefId'|'reporting'>>>{
    const self=await this.ownIdentity(db,actor);if(!self)return [];
    const {rows}=await db.query<{partyChiefId:UUID;id:UUID;areaId:UUID;areaName:string;retired:boolean}>(`SELECT rl.party_chief_id AS "partyChiefId",rl.id,n.id AS "areaId",n.name AS "areaName",n.retired_at IS NOT NULL AS retired
      FROM survey_reporting_links rl JOIN aor_nodes n ON n.tenant_id=rl.tenant_id AND n.project_id=rl.project_id AND n.id=rl.aor_node_id
      WHERE rl.tenant_id=$1 AND rl.project_id=$2 AND rl.superintendent_id=$3 AND rl.deactivated_at IS NULL AND rl.party_chief_id=ANY($4::uuid[])`,[actor.tenantId,actor.projectId,actor.actorId,chiefIds]);
    return rows.map(p=>({partyChiefId:p.partyChiefId,reporting:{id:p.id,superintendent:self,area:{id:p.areaId,name:p.areaName,retired:p.retired}}}));
  }
}
