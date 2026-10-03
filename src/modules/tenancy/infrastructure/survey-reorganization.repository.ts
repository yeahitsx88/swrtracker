import {createHash} from 'node:crypto';
import {ConflictError,NotFoundError} from '@/shared/errors';
import type {DbClient,UUID} from '@/shared/types';
import {authorizeStaffingMutation,type StaffingActor} from '../application/save-survey-staffing';
import type {ReorganizationRepository,ReorganizationSelection,ReorganizationPreview} from '../application/reorganize-survey';
import {SurveyStaffingPgRepository} from './survey-staffing.repository';
import {SurveyTeamsPgRepository} from './survey-teams.repository';
import {saveSurveyTeam} from '../application/survey-teams';
interface Crew {chiefId:UUID;areas:Array<{id:UUID;areaId:UUID;departmentId:UUID|null}>;reporting:Array<{id:UUID;areaId:UUID;superintendentId:UUID}>;roster:UUID[];teams:UUID[]}
export class SurveyReorganizationPgRepository extends SurveyStaffingPgRepository implements ReorganizationRepository{
 async authorize(db:DbClient,actor:StaffingActor){await authorizeStaffingMutation(this,db,actor);}
 private async crew(db:DbClient,actor:StaffingActor,chiefId:UUID):Promise<Crew>{
  const scope=[actor.tenantId,actor.projectId,chiefId];
  if((await this.member(db,actor.tenantId,actor.projectId,chiefId))?.role!=='PARTY_CHIEF')throw new NotFoundError('Active Party Chief not found');
  const areas=(await db.query<Crew['areas'][number]>(`SELECT id,aor_node_id AS "areaId",department_id AS "departmentId" FROM aor_assignments WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3 AND deactivated_at IS NULL ORDER BY id`,scope)).rows;
  const reporting=(await db.query<Crew['reporting'][number]>(`SELECT id,aor_node_id AS "areaId",superintendent_id AS "superintendentId" FROM survey_reporting_links WHERE tenant_id=$1 AND project_id=$2 AND party_chief_id=$3 AND deactivated_at IS NULL ORDER BY id`,scope)).rows;
  const roster=(await db.query<{id:UUID}>(`SELECT instrument_man_id AS id FROM crew_rosters WHERE tenant_id=$1 AND project_id=$2 AND party_chief_id=$3 AND deactivated_at IS NULL ORDER BY instrument_man_id`,scope)).rows.map(r=>r.id);
  const teams=(await db.query<{id:UUID}>(`SELECT id FROM survey_teams WHERE tenant_id=$1 AND project_id=$2 AND lead_user_id=$3 AND deactivated_at IS NULL ORDER BY id`,scope)).rows.map(r=>r.id);
  return {chiefId,areas,reporting,roster,teams};
 }
 async preview(db:DbClient,actor:StaffingActor,input:ReorganizationSelection):Promise<ReorganizationPreview>{
  // Canonical selection excludes command-only fields from the checksum.
  const selection:ReorganizationSelection=input.kind==='CREW'?{kind:'CREW',partyChiefId:input.partyChiefId,areaId:input.areaId,superintendentId:input.superintendentId}:{kind:'INSTRUMENT_MAN',instrumentManId:input.instrumentManId,partyChiefId:input.partyChiefId};
  const project=await this.lockProject(db,actor.tenantId,actor.projectId);if(!project)throw new NotFoundError('Project not found');
  const teamRepo=new SurveyTeamsPgRepository(),destination=await this.crew(db,actor,selection.partyChiefId),blockers:string[]=[],summary:string[]=[];
  const state:Record<string,unknown>={destination};let subject:UUID;
  if(selection.kind==='CREW'){
   subject=selection.partyChiefId;
   if(destination.areas.length!==1||destination.areas[0]?.departmentId!==null)blockers.push('Resolve ambiguous or department Area coverage through existing administration');
   if(!await this.activeArea(db,actor.tenantId,actor.projectId,selection.areaId))throw new NotFoundError('Active Area not found');
   if(project.crewBuild==='FULL'){
    if(!selection.superintendentId||(await this.member(db,actor.tenantId,actor.projectId,selection.superintendentId))?.role!=='SURVEY_SUPERINTENDENT')throw new ConflictError('Select an eligible current Superintendent');
    if(!await this.superintendentCoversArea(db,actor.tenantId,actor.projectId,selection.superintendentId,selection.areaId))throw new ConflictError('The selected Superintendent must already cover this Area');
   }else if(selection.superintendentId)throw new ConflictError('This crew build has no Superintendent tier');
   if(destination.teams.length>1)blockers.push('Resolve multiple named teams before moving this crew');
   const team=destination.teams[0]?await teamRepo.team(db,actor.tenantId,actor.projectId,destination.teams[0]):null;state.team=team;
   if(team&&(team.members.length!==destination.roster.length+1||team.members.some(m=>!m.active||m.role!=='PARTY_CHIEF'&&m.role!=='INSTRUMENT_MAN'||m.userId!==subject&&!destination.roster.includes(m.userId))))blockers.push('Named team and current crew roster must match before an intact crew move');
   summary.push(`Retain this Party Chief and ${destination.roster.length} Instrument Men; coordinate Area, reporting and ${team?'named team '+team.name:'no named team'} in one transaction.`);
  }else{
   subject=selection.instrumentManId;
   if((await this.member(db,actor.tenantId,actor.projectId,subject))?.role!=='INSTRUMENT_MAN')throw new NotFoundError('Active Instrument Man not found');
   const sourceId=await this.rosterChief(db,actor.tenantId,actor.projectId,subject);if(!sourceId)throw new ConflictError('Select an Instrument Man with a current crew');
   const source=await this.crew(db,actor,sourceId);state.source=source;
   const oldTeamId=(await db.query<{team_id:UUID}>(`SELECT m.team_id FROM survey_team_members m JOIN survey_teams t ON t.tenant_id=m.tenant_id AND t.project_id=m.project_id AND t.id=m.team_id AND t.deactivated_at IS NULL WHERE m.tenant_id=$1 AND m.project_id=$2 AND m.user_id=$3 AND m.deactivated_at IS NULL`,[actor.tenantId,actor.projectId,subject])).rows[0]?.team_id;
   const oldTeam=oldTeamId?await teamRepo.team(db,actor.tenantId,actor.projectId,oldTeamId):null,newTeam=destination.teams.length===1?await teamRepo.team(db,actor.tenantId,actor.projectId,destination.teams[0]!):null;
   state.oldTeam=oldTeam;state.newTeam=newTeam;
   if(destination.teams.length>1||!!oldTeam!==!!newTeam||oldTeam&&oldTeam.lead.userId!==sourceId||newTeam&&newTeam.lead.userId!==destination.chiefId)blockers.push('Resolve ambiguous named-team membership before transferring this person');
   summary.push('Move only this Instrument Man in the current roster and matching named teams. Existing assigned requests remain with their recorded Chief and Instrument Man.');
  }
  const work=(await db.query<{id:UUID;status:string;row_version:number}>(`SELECT id,status,row_version FROM tickets WHERE tenant_id=$1 AND project_id=$2 AND ${selection.kind==='CREW'?'assigned_party_chief_id':'assigned_instrument_man_id'}=$3 AND status NOT IN ('DRAFT','COMPLETED','REQUESTER_CANCELED','FIELD_CANCELED','SURVEY_CANCELED') ORDER BY id`,[actor.tenantId,actor.projectId,subject])).rows;
  if(selection.kind==='CREW'&&destination.areas.some(a=>a.areaId!==selection.areaId)&&work.length)blockers.push(`Resolve or explicitly reassign ${work.length} open crew requests before changing Area`);
  summary.push(`${work.length} active assignments retained. Historical tickets, assignment snapshots, files and events are unchanged. Current roster visibility will follow the new structure.`);
  const snapshot=createHash('sha256').update(JSON.stringify({selection,token:await this.snapshot(db,actor.tenantId,actor.projectId),state,work})).digest('hex');
  return {snapshot,selection,summary,blockers,activeWork:work.length,state};
 }
 async apply(db:DbClient,actor:StaffingActor,preview:ReorganizationPreview,reason:string){
  const selection=preview.selection,scope=[actor.tenantId,actor.projectId],teamRepo=new SurveyTeamsPgRepository(),crew=preview.state.destination as unknown as Crew;
  if(selection.kind==='CREW'){
   await this.setReportingLink(db,actor.tenantId,actor.projectId,actor.actorId,crew.chiefId,selection.superintendentId,selection.areaId);
   if(crew.areas[0]?.areaId!==selection.areaId){await db.query('UPDATE aor_assignments SET deactivated_at=NOW() WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3 AND department_id IS NULL AND deactivated_at IS NULL',[...scope,crew.chiefId]);await this.addArea(db,actor.tenantId,actor.projectId,crew.chiefId,selection.areaId);}
   const team=preview.state.team as Awaited<ReturnType<SurveyTeamsPgRepository['team']>>;
   if(team)await saveSurveyTeam(teamRepo,db,actor,{teamId:team.id,expectedVersion:team.rowVersion,name:team.name,areaId:selection.areaId,leadUserId:team.lead.userId,memberIds:team.members.map(m=>m.userId)});
  }else{
   await this.addInstrumentMan(db,actor.tenantId,actor.projectId,selection.partyChiefId,selection.instrumentManId);
   const oldTeam=preview.state.oldTeam as Awaited<ReturnType<SurveyTeamsPgRepository['team']>>,newTeam=preview.state.newTeam as typeof oldTeam;
   if(oldTeam&&newTeam&&oldTeam.id!==newTeam.id){
    await saveSurveyTeam(teamRepo,db,actor,{teamId:oldTeam.id,expectedVersion:oldTeam.rowVersion,name:oldTeam.name,areaId:oldTeam.areaId,leadUserId:oldTeam.lead.userId,memberIds:oldTeam.members.filter(m=>m.userId!==selection.instrumentManId).map(m=>m.userId)});
    await saveSurveyTeam(teamRepo,db,actor,{teamId:newTeam.id,expectedVersion:newTeam.rowVersion,name:newTeam.name,areaId:newTeam.areaId,leadUserId:newTeam.lead.userId,memberIds:[...newTeam.members.map(m=>m.userId),selection.instrumentManId]});
   }
  }
  await this.record(db,actor.tenantId,actor.projectId,actor.actorId,{action:'coordinated-reorganization',selection,reason,snapshot:preview.snapshot,previous:preview.state,activeAssignmentCount:preview.activeWork,historicalWorkUnchanged:true});
  return {changed:true};
 }
}
