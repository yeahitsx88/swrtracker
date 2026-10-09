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
 private async memberTeam(db:DbClient,actor:StaffingActor,userId:UUID){
  const {rows}=await db.query<{team_id:UUID}>(`SELECT m.team_id FROM survey_team_members m
    JOIN survey_teams t ON t.tenant_id=m.tenant_id AND t.project_id=m.project_id AND t.id=m.team_id
    WHERE m.tenant_id=$1 AND m.project_id=$2 AND m.user_id=$3 AND m.deactivated_at IS NULL AND t.deactivated_at IS NULL`,
    [actor.tenantId,actor.projectId,userId]);
  return rows[0]?new SurveyTeamsPgRepository().team(db,actor.tenantId,actor.projectId,rows[0].team_id):null;
 }
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
  const selection:ReorganizationSelection=input.kind==='CREW'?{kind:'CREW',partyChiefId:input.partyChiefId,areaId:input.areaId,superintendentId:input.superintendentId,...(input.destinationTeamId?{destinationTeamId:input.destinationTeamId}:{})}:{kind:'INSTRUMENT_MAN',instrumentManId:input.instrumentManId,partyChiefId:input.partyChiefId,destinationTeamId:input.destinationTeamId};
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
   const cohort=[subject,...destination.roster],members=await teamRepo.members(db,actor.tenantId,actor.projectId,cohort);
   state.cohort=members;
   if(members.length!==cohort.length||members.some(m=>m.role!==(m.userId===subject?'PARTY_CHIEF':'INSTRUMENT_MAN')))blockers.push('Every included crew member must have their current eligible survey role and project access.');
   const areaNames=(await db.query<{id:UUID;name:string}>('SELECT id,name FROM aor_nodes WHERE tenant_id=$1 AND project_id=$2 AND id=ANY($3::uuid[]) ORDER BY id',[actor.tenantId,actor.projectId,[...new Set([...destination.areas.map(a=>a.areaId),...destination.reporting.map(r=>r.areaId),selection.areaId])]])).rows;
   const superintendentNames=(await db.query<{id:UUID;name:string}>(`SELECT u.id,u.name FROM users u JOIN project_memberships pm ON pm.user_id=u.id AND pm.project_id=$2 JOIN projects p ON p.id=pm.project_id AND p.tenant_id=$1 WHERE u.tenant_id=$1 AND u.id=ANY($3::uuid[]) ORDER BY u.id`,[actor.tenantId,actor.projectId,[...new Set([...destination.reporting.map(r=>r.superintendentId),...(selection.superintendentId?[selection.superintendentId]:[])])]])).rows;
   state.reviewNames={areas:areaNames,superintendents:superintendentNames};
   const areaLabel=(id:UUID)=>`${areaNames.find(a=>a.id===id)?.name??'Area unavailable'} (${id})`,superintendentLabel=(id:UUID)=>`${superintendentNames.find(p=>p.id===id)?.name??'Superintendent unavailable'} (${id})`;

   if(selection.destinationTeamId){
    const sourceTeam=await this.memberTeam(db,actor,subject),destinationTeam=await teamRepo.team(db,actor.tenantId,actor.projectId,selection.destinationTeamId);
    if(!destinationTeam)throw new NotFoundError('Current destination named team not found');
    state.sourceTeam=sourceTeam;state.destinationTeam=destinationTeam;
    if(members.some(m=>(m.teamId??null)!==(sourceTeam?.id??null)))blockers.push('The whole current crew must belong to the same source named team, or all have no named team. Resolve conflicting membership first.');
    if(!destinationTeam.lead.active||!destinationTeam.members.some(m=>m.userId===destinationTeam.lead.userId&&m.active))blockers.push('Resolve the destination team lead vacancy before this transfer.');
    if(!(destinationTeam.areas??[{id:destinationTeam.areaId}]).some(a=>a.id===selection.areaId))blockers.push('The explicit destination named team must already cover the selected Area. Use existing Team Management to resolve coverage first.');
    for(const team of [sourceTeam,destinationTeam])if(team){
     if(!team.lead.active||!team.members.some(m=>m.userId===team.lead.userId&&m.active))blockers.push('Resolve the current named-team lead vacancy before this transfer.');
     const current=await teamRepo.members(db,actor.tenantId,actor.projectId,team.members.map(m=>m.userId));
     if(current.length!==team.members.length||current.some(m=>!['SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN'].includes(m.role)||project.crewBuild!=='FULL'&&m.role==='SURVEY_SUPERINTENDENT'))blockers.push('Resolve ineligible current named-team members before this transfer.');
     for(const a of team.areas??[{id:team.areaId}])if(!await this.activeArea(db,actor.tenantId,actor.projectId,a.id))blockers.push('Resolve retired named-team coverage before transferring this crew.');
    }
    if(sourceTeam&&sourceTeam.id!==destinationTeam.id){
     if(cohort.includes(sourceTeam.lead.userId))blockers.push('Choose a separate current source team lead before moving this crew; the transfer cannot leave a lead vacancy.');
     const count=await teamRepo.delegationObligations(db,actor,sourceTeam.id,null);
     if(count)blockers.push(`Resolve ${count} source-team delegated request(s) awaiting crew selection through Survey Operations before transferring this crew.`);
    }
    summary.push(`Source named team: ${sourceTeam?.name??'No named team'} (${sourceTeam?.id??'unassigned'}). Destination: ${destinationTeam.name} (${destinationTeam.id}).`,
     `Keep every source Area: ${(sourceTeam?.areas??(sourceTeam?[{id:sourceTeam.areaId,name:sourceTeam.areaName}]:[])).map(a=>`${a.name} (${a.id})`).join(', ')||'No named-team coverage'}.`,
     `Keep every destination Area: ${(destinationTeam.areas??[{id:destinationTeam.areaId,name:destinationTeam.areaName}]).map(a=>`${a.name} (${a.id})`).join(', ')}. Keep its existing primary Area and team lead.`,
     `Chief current individual Area: ${destination.areas.map(a=>areaLabel(a.areaId)).join(', ')||'Unresolved'}. New individual Area: ${areaLabel(selection.areaId)}. Other individual assignments stay unchanged.`);
   }else{
    if(destination.areas[0]?.areaId!==selection.areaId)blockers.push('Select an explicit destination named team before changing the Chief’s individual Area.');
    const team=destination.teams[0]?await teamRepo.team(db,actor.tenantId,actor.projectId,destination.teams[0]):null;state.team=team;
    if(team&&(team.members.length!==destination.roster.length+1||team.members.some(m=>!m.active||m.role!=='PARTY_CHIEF'&&m.role!=='INSTRUMENT_MAN'||m.userId!==subject&&!destination.roster.includes(m.userId))))blockers.push('Named team and current crew roster must match before an intact crew move');
    summary.push('Same-Area reporting-only movement: retain all current named-team membership, coverage, primary Area and team version.');
   }
   summary.push(`Included Chief: ${members.find(m=>m.userId===subject)?.name??subject} (${subject}). Included Instrument Men: ${members.filter(m=>m.userId!==subject).map(m=>`${m.name} (${m.userId})`).join(', ')||'None'}.`,
    `Current reporting: ${destination.reporting.map(r=>`${superintendentLabel(r.superintendentId)} in ${areaLabel(r.areaId)}`).join(', ')||'None'}. New reporting: ${selection.superintendentId?superintendentLabel(selection.superintendentId):'No Superintendent tier'} in ${areaLabel(selection.areaId)}. Keep all current roster links in one transaction.`);
  }else{
   subject=selection.instrumentManId;
   if((await this.member(db,actor.tenantId,actor.projectId,subject))?.role!=='INSTRUMENT_MAN')throw new NotFoundError('Active Instrument Man not found');
   const sourceId=await this.rosterChief(db,actor.tenantId,actor.projectId,subject);
   const source=sourceId?await this.crew(db,actor,sourceId):null;state.source=source;
   const oldTeam=await this.memberTeam(db,actor,subject),newTeam=await teamRepo.team(db,actor.tenantId,actor.projectId,selection.destinationTeamId);
   if(!newTeam)throw new NotFoundError('Current explicit destination named team not found');
   if(!newTeam.members.some(member=>member.userId===destination.chiefId&&member.active))blockers.push('The selected destination Chief must already belong to the explicitly selected named team.');
   if(!newTeam.lead.active||!newTeam.members.some(member=>member.userId===newTeam.lead.userId&&member.active))blockers.push('Resolve the explicit destination team lead vacancy before this transfer.');
   state.oldTeam=oldTeam;state.newTeam=newTeam;
   if(oldTeam&&!newTeam||oldTeam&&sourceId&&!oldTeam.members.some(member=>member.userId===sourceId))blockers.push('The Instrument Man and current Chief must belong to the same team, and the destination Chief must have a team.');
   if(oldTeam?.lead.userId===subject&&oldTeam.id!==newTeam?.id)blockers.push('Choose another lead for the current team before moving this person.');
   if(oldTeam&&oldTeam.id!==newTeam?.id){const count=await teamRepo.delegationObligations(db,actor,oldTeam.id,null);if(count)blockers.push(`Resolve ${count} delegated request(s) awaiting crew selection through Survey Operations before removing this team member.`);}
   if(sourceId===destination.chiefId)blockers.push('This Instrument Man already belongs to the selected Chief.');
   summary.push(`Move this Instrument Man from ${oldTeam?.name??(sourceId?'the current crew':'the unassigned personnel pool')} to ${newTeam?.name??'the destination crew'}. Existing request assignments stay with their recorded Chief and Instrument Man.`);
  }
  const explicitCrew=selection.kind==='CREW'&&!!selection.destinationTeamId;
  const work=(await db.query<{id:UUID;status:string;row_version:number}>(`SELECT id,status,row_version FROM tickets WHERE tenant_id=$1 AND project_id=$2 AND ${explicitCrew?'(assigned_party_chief_id=$3 OR field_validation_reviewer_id=$3 OR assigned_instrument_man_id=ANY($4::uuid[]))':`${selection.kind==='CREW'?'assigned_party_chief_id':'assigned_instrument_man_id'}=$3`} AND status NOT IN ('DRAFT','COMPLETED',${explicitCrew?"'REJECTED',":''}'REQUESTER_CANCELED','FIELD_CANCELED','SURVEY_CANCELED') ORDER BY id`,explicitCrew?[actor.tenantId,actor.projectId,subject,destination.roster]:[actor.tenantId,actor.projectId,subject])).rows;
  if(explicitCrew){
   if(work.length)blockers.push(`Resolve or explicitly reassign ${work.length} open crew requests before an explicit crew transfer.`);
   const pending=(await db.query<{count:number}>(`SELECT COUNT(*)::int AS count FROM survey_work_delegations d JOIN tickets t ON t.tenant_id=d.tenant_id AND t.project_id=d.project_id AND t.id=d.ticket_id WHERE d.tenant_id=$1 AND d.project_id=$2 AND d.lead_user_id=$3 AND d.ended_at IS NULL AND t.status='APPROVED' AND t.assigned_instrument_man_id IS NULL`,[actor.tenantId,actor.projectId,subject])).rows[0]!.count;
   if(pending)blockers.push(`Resolve ${pending} Chief delegation(s) awaiting crew selection before this transfer.`);
  }else if(selection.kind==='CREW'&&destination.areas.some(a=>a.areaId!==selection.areaId)&&work.length)blockers.push(`Resolve or explicitly reassign ${work.length} open crew requests before changing Area`);
  summary.push(`${work.length} active assignments retained. Historical tickets, assignment snapshots, files and events are unchanged. Current roster visibility will follow the new structure.`);
  const snapshot=createHash('sha256').update(JSON.stringify({selection,token:await this.snapshot(db,actor.tenantId,actor.projectId),state,work})).digest('hex');
  return {snapshot,selection,summary,blockers,activeWork:work.length,state};
 }
 async apply(db:DbClient,actor:StaffingActor,preview:ReorganizationPreview,reason:string){
  const selection=preview.selection,scope=[actor.tenantId,actor.projectId],teamRepo=new SurveyTeamsPgRepository(),crew=preview.state.destination as unknown as Crew;
  if(selection.kind==='CREW'){
   await this.setReportingLink(db,actor.tenantId,actor.projectId,actor.actorId,crew.chiefId,selection.superintendentId,selection.areaId);
   if(crew.areas[0]?.areaId!==selection.areaId){await db.query('UPDATE aor_assignments SET deactivated_at=NOW() WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3 AND department_id IS NULL AND deactivated_at IS NULL',[...scope,crew.chiefId]);await this.addArea(db,actor.tenantId,actor.projectId,crew.chiefId,selection.areaId);}
   if(selection.destinationTeamId){
    const sourceTeam=preview.state.sourceTeam as Awaited<ReturnType<SurveyTeamsPgRepository['team']>>,destinationTeam=preview.state.destinationTeam as NonNullable<typeof sourceTeam>,cohort=[crew.chiefId,...crew.roster];
    if(sourceTeam?.id!==destinationTeam.id){
     if(sourceTeam)await saveSurveyTeam(teamRepo,db,actor,{teamId:sourceTeam.id,expectedVersion:sourceTeam.rowVersion,name:sourceTeam.name,areaId:sourceTeam.areaId,areaIds:sourceTeam.areas?.map(a=>a.id)??[sourceTeam.areaId],leadUserId:sourceTeam.lead.userId,memberIds:sourceTeam.members.filter(m=>!cohort.includes(m.userId)).map(m=>m.userId)});
     await saveSurveyTeam(teamRepo,db,actor,{teamId:destinationTeam.id,expectedVersion:destinationTeam.rowVersion,name:destinationTeam.name,areaId:destinationTeam.areaId,areaIds:destinationTeam.areas?.map(a=>a.id)??[destinationTeam.areaId],leadUserId:destinationTeam.lead.userId,memberIds:[...destinationTeam.members.map(m=>m.userId),...cohort]});
    }
   }
   // Omitted destination is legacy same-Area reporting only: no named-team write.
  }else{
   await this.addInstrumentMan(db,actor.tenantId,actor.projectId,selection.partyChiefId,selection.instrumentManId);
   const oldTeam=preview.state.oldTeam as Awaited<ReturnType<SurveyTeamsPgRepository['team']>>,newTeam=preview.state.newTeam as typeof oldTeam;
   if(newTeam&&oldTeam?.id!==newTeam.id){
    if(oldTeam)await saveSurveyTeam(teamRepo,db,actor,{teamId:oldTeam.id,expectedVersion:oldTeam.rowVersion,name:oldTeam.name,areaId:oldTeam.areaId,areaIds:oldTeam.areas?.map(area=>area.id)??[oldTeam.areaId],leadUserId:oldTeam.lead.userId,memberIds:oldTeam.members.filter(m=>m.userId!==selection.instrumentManId).map(m=>m.userId)});
    await saveSurveyTeam(teamRepo,db,actor,{teamId:newTeam.id,expectedVersion:newTeam.rowVersion,name:newTeam.name,areaId:newTeam.areaId,areaIds:newTeam.areas?.map(area=>area.id)??[newTeam.areaId],leadUserId:newTeam.lead.userId,memberIds:[...newTeam.members.map(m=>m.userId),selection.instrumentManId]});
   }
  }
  await this.record(db,actor.tenantId,actor.projectId,actor.actorId,{action:'coordinated-reorganization',selection,reason,snapshot:preview.snapshot,previous:preview.state,activeAssignmentCount:preview.activeWork,historicalWorkUnchanged:true});
  return {changed:true};
 }
}
