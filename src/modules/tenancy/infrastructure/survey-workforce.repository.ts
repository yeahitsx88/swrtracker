import type { DbClient, UUID } from '@/shared/types';
import type { TeamActor, TeamPageQuery, TeamProjectContext } from '../application/survey-teams';
import type { WorkforcePerson, WorkforceRepository } from '../application/survey-workforce';
import { SurveyStaffingPgRepository } from './survey-staffing.repository';
/** Current explicit reporting and roster links only. Organizational teams and ticket snapshots never enter this population. */
const population=`WITH RECURSIVE covered AS (
 SELECT n.id FROM aor_assignments aa JOIN aor_nodes n ON n.tenant_id=aa.tenant_id AND n.project_id=aa.project_id AND n.id=aa.aor_node_id
 WHERE aa.tenant_id=$1 AND aa.project_id=$2 AND aa.user_id=$3 AND aa.deactivated_at IS NULL AND n.retired_at IS NULL
 UNION SELECT n.id FROM aor_nodes n JOIN covered parent ON n.parent_id=parent.id WHERE n.tenant_id=$1 AND n.project_id=$2 AND n.retired_at IS NULL
), chiefs AS (
 SELECT rl.party_chief_id FROM survey_reporting_links rl
 JOIN covered n ON n.id=rl.aor_node_id
 JOIN project_memberships pm ON pm.project_id=rl.project_id AND pm.user_id=rl.party_chief_id AND pm.role='PARTY_CHIEF'
 JOIN users u ON u.tenant_id=rl.tenant_id AND u.id=pm.user_id AND u.deactivated_at IS NULL
 JOIN companies c ON c.tenant_id=u.tenant_id AND c.id=u.company_id AND c.type<>'SUBCONTRACTOR'
 WHERE rl.tenant_id=$1 AND rl.project_id=$2 AND rl.superintendent_id=$3 AND rl.deactivated_at IS NULL
), members AS (
 SELECT u.id AS "userId",u.name,u.email,pm.role,
 (SELECT cr.party_chief_id FROM crew_rosters cr JOIN project_memberships cp ON cp.project_id=cr.project_id AND cp.user_id=cr.party_chief_id AND cp.role='PARTY_CHIEF'
 JOIN users cu ON cu.tenant_id=cr.tenant_id AND cu.id=cp.user_id AND cu.deactivated_at IS NULL
 JOIN companies cc ON cc.tenant_id=cu.tenant_id AND cc.id=cu.company_id AND cc.type<>'SUBCONTRACTOR'
 WHERE cr.tenant_id=$1 AND cr.project_id=$2 AND cr.instrument_man_id=u.id AND cr.deactivated_at IS NULL) AS "partyChiefId"
 FROM project_memberships pm JOIN projects p ON p.id=pm.project_id AND p.tenant_id=$1
 JOIN users u ON u.tenant_id=p.tenant_id AND u.id=pm.user_id AND u.deactivated_at IS NULL
 JOIN companies c ON c.tenant_id=u.tenant_id AND c.id=u.company_id AND c.type<>'SUBCONTRACTOR'
 WHERE pm.project_id=$2 AND pm.role IN ('SURVEY_MANAGER','SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN')
 AND EXISTS(SELECT 1 FROM project_memberships ap JOIN users au ON au.id=ap.user_id AND au.tenant_id=$1
 JOIN companies ac ON ac.id=au.company_id AND ac.tenant_id=au.tenant_id AND ac.type<>'SUBCONTRACTOR'
 WHERE ap.project_id=$2 AND ap.user_id=$3 AND ap.role=$4 AND au.deactivated_at IS NULL AND au.session_version=$5)
), population AS (
 SELECT * FROM members m WHERE $4='SURVEY_MANAGER'
 OR ($4='SURVEY_SUPERINTENDENT' AND ((m.role='PARTY_CHIEF' AND m."userId" IN (SELECT party_chief_id FROM chiefs))
 OR (m.role='INSTRUMENT_MAN' AND m."partyChiefId" IN (SELECT party_chief_id FROM chiefs))))
 OR ($4='PARTY_CHIEF' AND m.role='INSTRUMENT_MAN' AND m."partyChiefId"=$3)
)`;
const values=(actor:TeamActor)=>[actor.tenantId,actor.projectId,actor.actorId,actor.actorRole,actor.sessionVersion];
export class SurveyWorkforcePgRepository extends SurveyStaffingPgRepository implements WorkforceRepository {
 async context(db:DbClient,actor:TeamActor):Promise<TeamProjectContext|null>{
 const {rows}=await db.query<TeamProjectContext>(`SELECT p.status,p.crew_build AS "crewBuild" FROM projects p
 JOIN project_memberships pm ON pm.project_id=p.id AND pm.user_id=$3 AND pm.role=$4
 JOIN users u ON u.id=pm.user_id AND u.tenant_id=p.tenant_id AND u.deactivated_at IS NULL AND u.session_version=$5
 JOIN companies c ON c.id=u.company_id AND c.tenant_id=u.tenant_id AND c.type<>'SUBCONTRACTOR'
 WHERE p.tenant_id=$1 AND p.id=$2`,values(actor));return rows[0]??null;
 }
 async lockActor(db:DbClient,actor:TeamActor){
 const {rows}=await db.query(`SELECT pm.user_id FROM project_memberships pm JOIN projects p ON p.id=pm.project_id AND p.tenant_id=$1
 JOIN users u ON u.id=pm.user_id AND u.tenant_id=$1 AND u.deactivated_at IS NULL AND u.session_version=$5
 JOIN companies c ON c.id=u.company_id AND c.tenant_id=u.tenant_id AND c.type<>'SUBCONTRACTOR'
 WHERE pm.project_id=$2 AND pm.user_id=$3 AND pm.role=$4 FOR UPDATE OF pm`,values(actor));return rows.length===1;
 }
 async person(db:DbClient,actor:TeamActor,userId:UUID){
 const {rows}=await db.query<WorkforcePerson>(`${population} SELECT * FROM population WHERE "userId"=$6`,[...values(actor),userId]);return rows[0]??null;
 }
 async personnel(db:DbClient,actor:TeamActor,q:TeamPageQuery){
 const filter=`FROM population WHERE name ILIKE $6 OR email ILIKE $6 OR replace(role,'_',' ') ILIKE $6`;
 const params=[...values(actor),`%${q.search}%`];
 const count=await db.query<{total:number}>(`${population} SELECT COUNT(*)::int AS total ${filter}`,params);
 const {rows}=await db.query<WorkforcePerson>(`${population} SELECT * ${filter} ORDER BY lower(name),"userId" LIMIT $7 OFFSET $8`,[...params,q.limit,q.offset]);
 return {data:rows,total:count.rows[0]!.total,limit:q.limit,offset:q.offset};
 }
 async move(db:DbClient,actor:TeamActor,instrumentManId:UUID,partyChiefId:UUID){await this.addInstrumentMan(db,actor.tenantId,actor.projectId,partyChiefId,instrumentManId);}
 override async record(db:DbClient,actor:TeamActor,payload:Record<string,unknown>):Promise<void>;
 override async record(db:DbClient,tenantId:UUID,projectId:UUID,actorId:UUID,payload:Record<string,unknown>):Promise<void>;
 override async record(db:DbClient,actorOrTenant:TeamActor|UUID,payloadOrProject:Record<string,unknown>|UUID,actorId?:UUID,payload?:Record<string,unknown>){
 if(typeof actorOrTenant==='string')return super.record(db,actorOrTenant,payloadOrProject as UUID,actorId!,payload!);
 return super.record(db,actorOrTenant.tenantId,actorOrTenant.projectId,actorOrTenant.actorId,payloadOrProject as Record<string,unknown>);
 }
}
