import { randomUUID } from 'node:crypto';
import {ConflictError,ForbiddenError,NotFoundError} from '@/shared/errors';
import {SurveyTeamsPgRepository} from './survey-teams.repository';
import type { DbClient, UUID } from '@/shared/types';
import type { TeamActor, TeamPageQuery, TeamProjectContext } from '../application/survey-teams';
import type { WorkforcePerson, WorkforcePage, WorkforceRepository, WorkforceMove } from '../application/survey-workforce';
import { SurveyStaffingPgRepository, snapshotCte } from './survey-staffing.repository';
/** Named teams establish Superintendent responsibility. Legacy unteamed people retain explicit reporting until organized. */
const population=`covered AS (
 SELECT n.id FROM aor_assignments aa JOIN aor_nodes n ON n.tenant_id=aa.tenant_id AND n.project_id=aa.project_id AND n.id=aa.aor_node_id
 WHERE aa.tenant_id=$1 AND aa.project_id=$2 AND aa.user_id=$3 AND aa.deactivated_at IS NULL AND n.retired_at IS NULL
 UNION SELECT n.id FROM aor_nodes n JOIN covered parent ON n.parent_id=parent.id WHERE n.tenant_id=$1 AND n.project_id=$2 AND n.retired_at IS NULL
), supervised_teams AS (
 SELECT t.id FROM survey_teams t
 JOIN users lead ON lead.tenant_id=t.tenant_id AND lead.id=t.lead_user_id AND lead.deactivated_at IS NULL
 JOIN companies lc ON lc.tenant_id=t.tenant_id AND lc.id=lead.company_id AND lc.type<>'SUBCONTRACTOR'
 JOIN project_memberships lp ON lp.project_id=t.project_id AND lp.user_id=lead.id AND lp.access_disabled_at IS NULL
 WHERE t.tenant_id=$1 AND t.project_id=$2 AND t.deactivated_at IS NULL AND
 ((t.lead_user_id=$3 AND lp.role='SURVEY_SUPERINTENDENT') OR
 (lp.role='PARTY_CHIEF' AND EXISTS(SELECT 1 FROM survey_reporting_links rl JOIN covered ca ON ca.id=rl.aor_node_id WHERE rl.tenant_id=$1 AND rl.project_id=$2 AND rl.party_chief_id=t.lead_user_id AND rl.superintendent_id=$3 AND rl.deactivated_at IS NULL)
 AND EXISTS(SELECT 1 FROM survey_team_areas ta WHERE ta.tenant_id=$1 AND ta.project_id=$2 AND ta.team_id=t.id AND ta.deactivated_at IS NULL)
 AND NOT EXISTS(SELECT 1 FROM survey_team_areas ta WHERE ta.tenant_id=$1 AND ta.project_id=$2 AND ta.team_id=t.id AND ta.deactivated_at IS NULL AND ta.area_id NOT IN(SELECT id FROM covered))))
), led_members AS (
 SELECT m.user_id FROM survey_team_members m JOIN supervised_teams t ON t.id=m.team_id
 WHERE m.tenant_id=$1 AND m.project_id=$2 AND m.deactivated_at IS NULL
), named_members AS (
 SELECT m.user_id FROM survey_team_members m JOIN survey_teams t
 ON t.tenant_id=m.tenant_id AND t.project_id=m.project_id AND t.id=m.team_id AND t.deactivated_at IS NULL
 WHERE m.tenant_id=$1 AND m.project_id=$2 AND m.deactivated_at IS NULL
), chiefs AS (
 SELECT rl.party_chief_id FROM survey_reporting_links rl
 JOIN covered n ON n.id=rl.aor_node_id
 JOIN project_memberships pm ON pm.project_id=rl.project_id AND pm.user_id=rl.party_chief_id AND pm.role='PARTY_CHIEF'
 JOIN users u ON u.tenant_id=rl.tenant_id AND u.id=pm.user_id AND (u.deactivated_at IS NULL AND pm.access_disabled_at IS NULL)
 JOIN companies c ON c.tenant_id=u.tenant_id AND c.id=u.company_id AND c.type<>'SUBCONTRACTOR'
 WHERE rl.tenant_id=$1 AND rl.project_id=$2 AND rl.superintendent_id=$3 AND rl.deactivated_at IS NULL
), members AS (
 SELECT u.id AS "userId",u.name,u.email,pm.role,
 (SELECT cr.party_chief_id FROM crew_rosters cr JOIN project_memberships cp ON cp.project_id=cr.project_id AND cp.user_id=cr.party_chief_id AND cp.role='PARTY_CHIEF'
 JOIN users cu ON cu.tenant_id=cr.tenant_id AND cu.id=cp.user_id AND (cu.deactivated_at IS NULL AND cp.access_disabled_at IS NULL)
 JOIN companies cc ON cc.tenant_id=cu.tenant_id AND cc.id=cu.company_id AND cc.type<>'SUBCONTRACTOR'
 WHERE cr.tenant_id=$1 AND cr.project_id=$2 AND cr.instrument_man_id=u.id AND cr.deactivated_at IS NULL) AS "partyChiefId"
 FROM project_memberships pm JOIN projects p ON p.id=pm.project_id AND p.tenant_id=$1
 JOIN users u ON u.tenant_id=p.tenant_id AND u.id=pm.user_id AND (u.deactivated_at IS NULL AND pm.access_disabled_at IS NULL)
 JOIN companies c ON c.tenant_id=u.tenant_id AND c.id=u.company_id AND c.type<>'SUBCONTRACTOR'
 WHERE pm.project_id=$2 AND pm.role IN ('SURVEY_MANAGER','SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN')
 AND EXISTS(SELECT 1 FROM project_memberships ap JOIN users au ON au.id=ap.user_id AND au.tenant_id=$1
 JOIN companies ac ON ac.id=au.company_id AND ac.tenant_id=au.tenant_id AND ac.type<>'SUBCONTRACTOR'
 WHERE ap.project_id=$2 AND ap.user_id=$3 AND ap.role=$4 AND (au.deactivated_at IS NULL AND ap.access_disabled_at IS NULL) AND au.session_version=$5)
), population AS (
 SELECT * FROM members m WHERE $4='SURVEY_MANAGER'
 OR ($4='SURVEY_SUPERINTENDENT' AND m.role IN ('PARTY_CHIEF','INSTRUMENT_MAN') AND
 (m."userId" IN (SELECT user_id FROM led_members) OR
 (m."userId" NOT IN (SELECT user_id FROM named_members) AND
 ((m.role='PARTY_CHIEF' AND m."userId" IN (SELECT party_chief_id FROM chiefs))
 OR (m.role='INSTRUMENT_MAN' AND m."partyChiefId" IN (SELECT party_chief_id FROM chiefs))))))
 OR ($4='PARTY_CHIEF' AND m.role='INSTRUMENT_MAN' AND m."partyChiefId"=$3)
)`;
// Reviewed workforce intent includes named membership/coverage and current obligations,
// in addition to the existing staffing checksum. No destination is inferred.
const workforceSnapshotCte=`${snapshotCte}, workforce_snapshot AS (
 SELECT md5(jsonb_build_object('staffing',snapshot.token,
 'teams',COALESCE((SELECT jsonb_agg(jsonb_build_array(id,lead_user_id,row_version,deactivated_at) ORDER BY id) FROM survey_teams WHERE tenant_id=$1 AND project_id=$2),'[]'::jsonb),
 'membership',COALESCE((SELECT jsonb_agg(jsonb_build_array(team_id,user_id,deactivated_at) ORDER BY team_id,user_id) FROM survey_team_members WHERE tenant_id=$1 AND project_id=$2),'[]'::jsonb),
 'coverage',COALESCE((SELECT jsonb_agg(jsonb_build_array(team_id,area_id,deactivated_at) ORDER BY team_id,area_id) FROM survey_team_areas WHERE tenant_id=$1 AND project_id=$2),'[]'::jsonb),
 'work',COALESCE((SELECT jsonb_agg(jsonb_build_array(id,status,aor_node_id,assigned_instrument_man_id,field_validation_reviewer_id) ORDER BY id) FROM tickets WHERE tenant_id=$1 AND project_id=$2 AND status NOT IN('DRAFT','REJECTED','COMPLETED','REQUESTER_CANCELED','FIELD_CANCELED','SURVEY_CANCELED')),'[]'::jsonb)
 )::text) AS token FROM snapshot
)`;
const values=(actor:TeamActor)=>[actor.tenantId,actor.projectId,actor.actorId,actor.actorRole,actor.sessionVersion];
export class SurveyWorkforcePgRepository extends SurveyStaffingPgRepository implements WorkforceRepository {
 override async snapshot(db:DbClient,tenantId:UUID,projectId:UUID){
 const {rows}=await db.query<{token:string}>(`WITH ${workforceSnapshotCte} SELECT token FROM workforce_snapshot`,[tenantId,projectId]);return rows[0]?.token??null;
 }
 // Serialize project/staffing writes while allowing Area replacement inserts'
 // project foreign-key checks. FOR UPDATE would invert project/grant lock order.
 override async lockProject(db:DbClient,tenantId:UUID,projectId:UUID){
 const {rows}=await db.query<NonNullable<Awaited<ReturnType<SurveyStaffingPgRepository['lockProject']>>>>(
 `SELECT status,crew_build AS "crewBuild" FROM projects WHERE tenant_id=$1 AND id=$2 FOR NO KEY UPDATE`,[tenantId,projectId]);
 return rows[0]??null;
 }
 async context(db:DbClient,actor:TeamActor):Promise<TeamProjectContext|null>{
 const {rows}=await db.query<TeamProjectContext>(`SELECT p.status,p.crew_build AS "crewBuild" FROM projects p
 JOIN project_memberships pm ON pm.project_id=p.id AND pm.user_id=$3 AND pm.role=$4
 JOIN users u ON u.id=pm.user_id AND u.tenant_id=p.tenant_id AND (u.deactivated_at IS NULL AND pm.access_disabled_at IS NULL) AND u.session_version=$5
 JOIN companies c ON c.id=u.company_id AND c.tenant_id=u.tenant_id AND c.type<>'SUBCONTRACTOR'
 WHERE p.tenant_id=$1 AND p.id=$2`,values(actor));return rows[0]??null;
 }
 async lockActor(db:DbClient,actor:TeamActor){
 const {rows}=await db.query(`SELECT pm.user_id FROM project_memberships pm JOIN projects p ON p.id=pm.project_id AND p.tenant_id=$1
 JOIN users u ON u.id=pm.user_id AND u.tenant_id=$1 AND (u.deactivated_at IS NULL AND pm.access_disabled_at IS NULL) AND u.session_version=$5
 JOIN companies c ON c.id=u.company_id AND c.tenant_id=u.tenant_id AND c.type<>'SUBCONTRACTOR'
 WHERE pm.project_id=$2 AND pm.user_id=$3 AND pm.role=$4 FOR UPDATE OF pm`,values(actor));return rows.length===1;
 }
 // Generic Area writers do not take the staffing project lock. Hold the rows
 // that establish this pool until the transfer, audit and retry ledger commit.
 async lockTransferScope(db:DbClient,actor:TeamActor,instrumentManId:UUID){
 await db.query(`SELECT id FROM aor_nodes WHERE tenant_id=$1 AND project_id=$2 ORDER BY id FOR SHARE`,[actor.tenantId,actor.projectId]);
 await db.query(`SELECT id FROM aor_assignments WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3 AND deactivated_at IS NULL ORDER BY id FOR SHARE`,[actor.tenantId,actor.projectId,actor.actorId]);
 await db.query(`SELECT id FROM survey_reporting_links WHERE tenant_id=$1 AND project_id=$2 AND superintendent_id=$3 AND deactivated_at IS NULL ORDER BY id FOR SHARE`,[actor.tenantId,actor.projectId,actor.actorId]);
 await db.query(`SELECT id FROM crew_rosters WHERE tenant_id=$1 AND project_id=$2 AND instrument_man_id=$3 AND deactivated_at IS NULL FOR UPDATE`,[actor.tenantId,actor.projectId,instrumentManId]);
 }
 async supervisedTeam(db:DbClient,actor:TeamActor,teamId:UUID){
 const {rows}=await db.query(`WITH RECURSIVE ${population} SELECT id FROM supervised_teams WHERE id=$6 AND EXISTS(SELECT 1 FROM members WHERE "userId"=$3 AND role='SURVEY_SUPERINTENDENT')`,[...values(actor),teamId]);return rows.length===1;
 }
 async destinations(db:DbClient,actor:TeamActor,q:TeamPageQuery){
 const {rows}=await db.query<{ids:UUID[];total:number}>(`WITH RECURSIVE ${population}, matching AS (SELECT t.id,t.name FROM supervised_teams s JOIN survey_teams t ON t.id=s.id AND t.tenant_id=$1 AND t.project_id=$2 WHERE $4='SURVEY_SUPERINTENDENT' AND EXISTS(SELECT 1 FROM members WHERE "userId"=$3 AND role='SURVEY_SUPERINTENDENT') AND t.name ILIKE $6) SELECT (SELECT COUNT(*)::int FROM matching) AS total, COALESCE((SELECT jsonb_agg(id ORDER BY lower(name),id) FROM (SELECT id,name FROM matching ORDER BY lower(name),id LIMIT $7 OFFSET $8) page),'[]'::jsonb) AS ids`,[...values(actor),`%${q.search}%`,q.limit,q.offset]);
 const repo=new SurveyTeamsPgRepository(),data=[];
 for(const id of rows[0]!.ids){const team=await repo.team(db,actor.tenantId,actor.projectId,id);if(team)data.push(team);}
 return {data,total:rows[0]!.total,limit:q.limit,offset:q.offset};
 }
 async assertTransferScope(db:DbClient,actor:TeamActor,input:WorkforceMove):Promise<boolean>{
 const teams=new SurveyTeamsPgRepository(),destination=await teams.team(db,actor.tenantId,actor.projectId,input.destinationTeamId);
 if(!destination)throw new NotFoundError('Current explicit destination named team not found');
 if(!await this.supervisedTeam(db,actor,destination.id))throw new ForbiddenError('Choose an existing destination team in your current supervised structure');
 if(!destination.members.some(p=>p.userId===input.partyChiefId&&p.active&&p.role==='PARTY_CHIEF'))throw new ConflictError('The destination Chief must already belong to the explicitly selected team');
 const sourceId=(await db.query<{id:UUID}>(`SELECT t.id FROM survey_team_members m JOIN survey_teams t ON t.tenant_id=m.tenant_id AND t.project_id=m.project_id AND t.id=m.team_id AND t.deactivated_at IS NULL WHERE m.tenant_id=$1 AND m.project_id=$2 AND m.user_id=$3 AND m.deactivated_at IS NULL`,[actor.tenantId,actor.projectId,input.instrumentManId])).rows[0]?.id;
 const source=sourceId?await teams.team(db,actor.tenantId,actor.projectId,sourceId):null;
 if(source&&!await this.supervisedTeam(db,actor,source.id))throw new ForbiddenError('The current named team is outside your supervised team authority');
 if(source&&source.id!==destination.id&&source.lead.userId===input.instrumentManId)throw new ConflictError('Resolve the source team lead vacancy before moving this person');
 for(const team of [source,destination])if(team){
  if(!team.members.some(p=>p.userId===team.lead.userId&&p.active))throw new ConflictError('Resolve the named-team lead vacancy before this transfer');
  if(!team.areas?.length)throw new ConflictError('Resolve missing named-team Area coverage before this transfer');
  for(const area of team.areas)if(!await this.activeArea(db,actor.tenantId,actor.projectId,area.id))throw new ConflictError('Resolve retired or incompatible named-team Area coverage before this transfer');
  const eligible=await teams.members(db,actor.tenantId,actor.projectId,team.members.map(p=>p.userId));
  if(eligible.length!==team.members.length||eligible.some(p=>!['SURVEY_MANAGER','SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN'].includes(p.role)))throw new ConflictError('Resolve ineligible current named-team members before this transfer');
 }
 const instrument=await this.person(db,actor,input.instrumentManId);
 if(instrument?.partyChiefId){
  const oldChief=await this.person(db,actor,instrument.partyChiefId);
  if(!oldChief||source&&!source.members.some(p=>p.userId===oldChief.userId&&p.active&&p.role==='PARTY_CHIEF'))throw new ForbiddenError('The current crew is outside your supervised structure; ask your Survey Manager to reconcile it first');
 }
 if(source&&source.id!==destination.id&&await teams.delegationObligations(db,actor,source.id,null))throw new ConflictError('Resolve source-team delegated work through Survey Operations before removing this member','TEAM_DELEGATION_OBLIGATIONS');
 const work=(await db.query<{id:UUID;areaId:UUID|null}>(`SELECT id,aor_node_id AS "areaId" FROM tickets WHERE tenant_id=$1 AND project_id=$2 AND (assigned_instrument_man_id=$3 OR field_validation_reviewer_id=$3) AND status NOT IN('DRAFT','REJECTED','COMPLETED','REQUESTER_CANCELED','FIELD_CANCELED','SURVEY_CANCELED') ORDER BY id FOR SHARE`,[actor.tenantId,actor.projectId,input.instrumentManId])).rows;
 for(const request of work){
  if(!request.areaId)throw new ConflictError('Resolve active work with missing Area before transferring this person');
  const covered=await db.query(`WITH RECURSIVE ancestors AS (SELECT id,parent_id FROM aor_nodes WHERE tenant_id=$1 AND project_id=$2 AND id=$3 AND retired_at IS NULL UNION ALL SELECT n.id,n.parent_id FROM aor_nodes n JOIN ancestors a ON a.parent_id=n.id WHERE n.tenant_id=$1 AND n.project_id=$2 AND n.retired_at IS NULL) SELECT ta.area_id FROM survey_team_areas ta JOIN ancestors a ON a.id=ta.area_id WHERE ta.tenant_id=$1 AND ta.project_id=$2 AND ta.team_id=$4 AND ta.deactivated_at IS NULL`,[actor.tenantId,actor.projectId,request.areaId,destination.id]);
  if(!covered.rows.length)throw new ConflictError('The explicitly selected destination team must already cover every Area required by current active obligations. Ask your Survey Manager to resolve coverage first.','TRANSFER_AREA_COVERAGE');
 }
 return source?.id===destination.id;
 }
 async person(db:DbClient,actor:TeamActor,userId:UUID){
 const {rows}=await db.query<WorkforcePerson>(`WITH RECURSIVE ${population} SELECT * FROM population WHERE "userId"=$6`,[...values(actor),userId]);return rows[0]??null;
 }
 async personnel(db:DbClient,actor:TeamActor,q:TeamPageQuery):Promise<WorkforcePage>{
 // The displayed rows, total and token come from one PostgreSQL statement snapshot.
 const {rows}=await db.query<{page:WorkforcePage}>(`WITH RECURSIVE ${workforceSnapshotCte}, ${population}, matching AS (
 SELECT * FROM population WHERE name ILIKE $6 OR email ILIKE $6 OR replace(role,'_',' ') ILIKE $6
 ) SELECT jsonb_build_object(
 'data',COALESCE((SELECT jsonb_agg(m ORDER BY lower(m.name),m."userId") FROM
 (SELECT * FROM matching ORDER BY lower(name),"userId" LIMIT $7 OFFSET $8) m),'[]'::jsonb),
 'total',(SELECT COUNT(*) FROM matching),'limit',$7::int,'offset',$8::int,
 'snapshotToken',workforce_snapshot.token) AS page FROM workforce_snapshot`,[...values(actor),`%${q.search}%`,q.limit,q.offset]);
 return rows[0]!.page;
 }
 async move(db:DbClient,actor:TeamActor,instrumentManId:UUID,partyChiefId:UUID,destinationTeamId:UUID){
 const repo=new SurveyTeamsPgRepository(),destination=await repo.team(db,actor.tenantId,actor.projectId,destinationTeamId);
 if(!destination)throw new NotFoundError('Destination team changed');
 const sourceId=(await db.query<{team_id:UUID}>(`SELECT team_id FROM survey_team_members WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3 AND deactivated_at IS NULL`,[actor.tenantId,actor.projectId,instrumentManId])).rows[0]?.team_id;
 if(sourceId!==destination.id){
  const source=sourceId?await repo.team(db,actor.tenantId,actor.projectId,sourceId):null;
  if(source){await db.query(`UPDATE survey_team_members SET deactivated_at=NOW() WHERE tenant_id=$1 AND project_id=$2 AND team_id=$3 AND user_id=$4 AND deactivated_at IS NULL`,[actor.tenantId,actor.projectId,source.id,instrumentManId]);}
  await db.query(`INSERT INTO survey_team_members(tenant_id,project_id,team_id,user_id) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,project_id,team_id,user_id) DO UPDATE SET assigned_at=NOW(),deactivated_at=NULL`,[actor.tenantId,actor.projectId,destination.id,instrumentManId]);
  for(const team of [source,destination])if(team){
   const updated=await db.query<{row_version:number}>(`UPDATE survey_teams SET row_version=row_version+1,updated_at=NOW() WHERE tenant_id=$1 AND project_id=$2 AND id=$3 AND row_version=$4 AND deactivated_at IS NULL RETURNING row_version`,[actor.tenantId,actor.projectId,team.id,team.rowVersion]);
   if(!updated.rows[0])throw new ConflictError('The reviewed team changed','STALE_TEAM');
   await repo.recordTeamEvent(db,actor,'survey.team_updated',{teamId:team.id,name:team.name,rowVersion:updated.rows[0].row_version,areaId:team.areaId,areaIds:team.areas?.map(a=>a.id)??[team.areaId],leadUserId:team.lead.userId,memberIds:team.id===source?.id?team.members.filter(p=>p.userId!==instrumentManId).map(p=>p.userId):[...team.members.map(p=>p.userId),instrumentManId],previous:team,transferInstrumentManId:instrumentManId,destinationTeamId,historicalTicketAssignmentsUnchanged:true});
  }
 }
 await this.addInstrumentMan(db,actor.tenantId,actor.projectId,partyChiefId,instrumentManId);
 }
 override async record(db:DbClient,actor:TeamActor,payload:Record<string,unknown>):Promise<void>;
 override async record(db:DbClient,tenantId:UUID,projectId:UUID,actorId:UUID,payload:Record<string,unknown>):Promise<void>;
 override async record(db:DbClient,actorOrTenant:TeamActor|UUID,payloadOrProject:Record<string,unknown>|UUID,actorId?:UUID,payload?:Record<string,unknown>){
 if(typeof actorOrTenant==='string')return super.record(db,actorOrTenant,payloadOrProject as UUID,actorId!,payload!);
 await super.record(db,actorOrTenant.tenantId,actorOrTenant.projectId,actorOrTenant.actorId,payloadOrProject as Record<string,unknown>);
 if(actorOrTenant.actorRole==='SURVEY_SUPERINTENDENT'){
 const change=payloadOrProject as Record<string,unknown>;
 await db.query(`INSERT INTO survey_notifications(tenant_id,project_id,recipient_id,actor_id,event_key,title,message)
 SELECT $1,$2,pm.user_id,$3,$4,'Team roster updated',u.name || ' assigned ' || $5 || ' to ' || $6 || '.'
 FROM project_memberships pm JOIN users recipient ON recipient.id=pm.user_id AND recipient.tenant_id=$1
 JOIN users u ON u.id=$3 AND u.tenant_id=$1
 WHERE pm.project_id=$2 AND pm.role='SURVEY_MANAGER' AND pm.access_disabled_at IS NULL AND recipient.deactivated_at IS NULL
 ON CONFLICT(tenant_id,recipient_id,event_key) DO NOTHING`,[actorOrTenant.tenantId,actorOrTenant.projectId,actorOrTenant.actorId,
 randomUUID(),String(change.instrumentManName??'an Instrument Man'),String(change.partyChiefName??'a Party Chief')]);
 }
 }
}
