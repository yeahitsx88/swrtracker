import {ConflictError,ForbiddenError,NotFoundError,ValidationError} from '@/shared/errors';
import type {DbClient,UUID} from '@/shared/types';
import {authorizeTeamMutation,saveSurveyTeam,type TeamActor} from './survey-teams';
import {assertResolvedSurveyRoleObligations,type OperationalRoleChangeInput,type SurveyRoleRepository} from './change-survey-role';

export interface SupervisedSurveyRoleInput extends OperationalRoleChangeInput {reviewedTeamId:UUID;expectedTeamVersion:number}
/** Actor's current named-team authority must survive before any recorded replay.
 * Subject membership/version is checked on first execution; successful removal ends it. */
export async function authorizeSupervisedSurveyRole(repo:SurveyRoleRepository,db:DbClient,actor:TeamActor,teamId:UUID){
 if(actor.actorRole!=='SURVEY_SUPERINTENDENT')throw new ForbiddenError('Only a current Superintendent may change roles of their supervised team members here');
 const project=await repo.lockProject(db,actor.tenantId,actor.projectId);
 if(!project)throw new NotFoundError('Project not found');
 if(!await repo.lockSuperintendent(db,actor))throw new ForbiddenError('Your Superintendent role or session changed');
 if(project.status==='ARCHIVED')throw new ConflictError('Closed projects cannot receive role changes');
 const team=await repo.team(db,actor.tenantId,actor.projectId,teamId);
 if(!team||team.lead.userId!==actor.actorId||!team.lead.active)throw new ForbiddenError('You may change roles only in a current named team you lead');
 // Retain the existing named-team Area scope; never create individual/reporting grants.
 for(const area of team.areas??[{id:team.areaId,name:team.areaName}])if(!await repo.activeArea(db,actor.tenantId,actor.projectId,area.id))throw new ConflictError('Ask your Survey Manager to resolve retired team Area coverage first');
 return {project,team};
}
export async function changeSupervisedSurveyRole(repo:SurveyRoleRepository,db:DbClient,actor:TeamActor,input:SupervisedSurveyRoleInput){
 if(input.userId===actor.actorId)throw new ForbiddenError('Another authorized leader or administrator must change your operational role');
 const {project,team}=await authorizeSupervisedSurveyRole(repo,db,actor,input.reviewedTeamId);
 if(team.rowVersion!==input.expectedTeamVersion)throw new ConflictError('This team changed; reload and review the person again','STALE_TEAM');
 if(!['PARTY_CHIEF','INSTRUMENT_MAN','REQUESTER'].includes(input.role))throw new ForbiddenError('The Survey Manager or independent administrator manages Superintendent roles');
 if(input.role==='PARTY_CHIEF'&&project.crewBuild==='SLIM')throw new ConflictError('Party Chief is not supported by this project crew build');
 const [member]=await repo.members(db,actor.tenantId,actor.projectId,[input.userId]);
 if(!member?.active||member.teamId!==team.id||!team.members.some(m=>m.userId===member.userId))throw new ForbiddenError('This person is no longer a current member of your reviewed team');
 if(!['PARTY_CHIEF','INSTRUMENT_MAN'].includes(member.role)||member.userId===team.lead.userId)throw new ForbiddenError('Only another supervised Chief or Instrument Man may be changed here');
 if(member.role!==input.expectedRole||member.roleVersion!==input.expectedRoleVersion)throw new ConflictError('The reviewed role or account changed; reload before confirming','STALE_SURVEY_ROLE');
 if(member.role===input.role)return {changed:false,roleVersion:member.roleVersion};
 if(!input.confirmRoleChanges)throw new ValidationError('Confirm the reviewed role change and sign-in renewal');
 assertResolvedSurveyRoleObligations(await repo.roleObligations(db,actor.tenantId,actor.projectId,member.userId));
 let teamVersion=team.rowVersion;
 if(input.role==='REQUESTER'){
  // Owner Decision52 follow-up: the existing team save and role command share
  // this transaction. Neither a team exit nor a role change can commit alone.
  const removed=await saveSurveyTeam(repo,db,actor,{teamId:team.id,expectedVersion:team.rowVersion,name:team.name,areaId:team.areaId,areaIds:team.areas?.map(a=>a.id),leadUserId:team.lead.userId,memberIds:team.members.filter(m=>m.userId!==member.userId).map(m=>m.userId)});
  teamVersion=removed.rowVersion;
 }
 const roleVersion=await repo.changeOperationalRole(db,actor,input);
 await repo.recordTeamEvent(db,actor,'survey.role_changed',{userId:member.userId,name:member.name,previousRole:member.role,role:input.role,previousRoleVersion:member.roleVersion,roleVersion,reviewedTeamId:team.id,expectedTeamVersion:input.expectedTeamVersion,teamVersion,retainedTeamId:input.role==='REQUESTER'?null:team.id,removedTeamId:input.role==='REQUESTER'?team.id:null,currentSuperintendentId:actor.actorId,confirmed:true,sessionRenewalRequired:true,historicalTicketAssignmentsUnchanged:true});
 return {changed:true,roleVersion,teamVersion};
}
/** Explicit removal does not restore nonsurvey promotion in Manager Team Management. */
export async function removeSurveyRole(repo:SurveyRoleRepository,db:DbClient,actor:TeamActor,input:OperationalRoleChangeInput){
 await authorizeTeamMutation(repo,db,actor);
 if(input.userId===actor.actorId)throw new ForbiddenError('Another authorized administrator must remove your operational role');
 if(input.role!=='REQUESTER')throw new ValidationError('Survey-role removal retains Requester membership');
 const [member]=await repo.members(db,actor.tenantId,actor.projectId,[input.userId]);
 if(!member?.active)throw new NotFoundError('Active eligible project member not found');
 if(!['SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN'].includes(member.role))throw new ForbiddenError('This role requires its separately authorized administrative workflow');
 if(member.role!==input.expectedRole||member.roleVersion!==input.expectedRoleVersion)throw new ConflictError('The reviewed role or account changed; reload before confirming','STALE_SURVEY_ROLE');
 if(!input.confirmRoleChanges)throw new ValidationError('Confirm removal to Requester and sign-in renewal');
 assertResolvedSurveyRoleObligations(await repo.roleObligations(db,actor.tenantId,actor.projectId,member.userId));
 if(member.teamId)throw new ConflictError('Remove this person from their named team before removing their survey role','SURVEY_TEAM_MEMBERSHIP_OBLIGATION');
 const roleVersion=await repo.changeOperationalRole(db,actor,input);
 await repo.recordTeamEvent(db,actor,'survey.role_changed',{userId:member.userId,name:member.name,previousRole:member.role,role:'REQUESTER',previousRoleVersion:member.roleVersion,roleVersion,retainedTeamId:null,confirmed:true,sessionRenewalRequired:true,historicalTicketAssignmentsUnchanged:true});
 return {changed:true,roleVersion};
}
