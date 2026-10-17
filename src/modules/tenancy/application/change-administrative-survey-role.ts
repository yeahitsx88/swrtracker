import type {AuthContext} from '@/lib/auth';
import {assertProjectAdministrator} from '@/lib/project-capabilities';
import {assertRecommissioningMutation} from '@/lib/recommissioning-gate';
import {appendAdministrativeEvent} from '@/modules/audit/infrastructure/administrative-event.repository';
import {ConflictError,ForbiddenError,NotFoundError,ValidationError} from '@/shared/errors';
import type {DbClient,UUID} from '@/shared/types';
import {assertResolvedSurveyRoleObligations,type OperationalRoleChangeInput,type SurveyRoleRepository} from './change-survey-role';

export interface AdministrativeSurveyRoleRepository extends Pick<SurveyRoleRepository,'lockProject'|'members'|'roleObligations'|'changeOperationalRole'> {
  anotherCurrentManager(db:DbClient,tenantId:UUID,projectId:UUID,subjectId:UUID):Promise<boolean>;
}
const surveyRoles=new Set(['SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN']);
/** Independently authorized role administration does not grant crew-structure operations. */
export async function changeAdministrativeSurveyRole(repo:AdministrativeSurveyRoleRepository,db:DbClient,auth:AuthContext,projectId:UUID,input:OperationalRoleChangeInput){
  const authority=await assertProjectAdministrator(db,auth,projectId);
  await assertRecommissioningMutation(db,auth.tenantId,projectId);
  const project=await repo.lockProject(db,auth.tenantId,projectId);
  if(!project)throw new NotFoundError('Project not found');
  if(project.status==='ARCHIVED')throw new ConflictError('Closed projects cannot receive role changes');
  if(!surveyRoles.has(input.role)&&input.role!=='REQUESTER')throw new ValidationError('Choose a fixed survey role or remove the survey role to Requester');
  const [member]=await repo.members(db,auth.tenantId,projectId,[input.userId]);
  if(!member?.active)throw new NotFoundError('Active eligible project member not found');
  if(!surveyRoles.has(member.role)&&!['REQUESTER','VIEWER','SURVEY_MANAGER'].includes(member.role))throw new ConflictError('This operational role uses its separate authorized workflow');
  if(!surveyRoles.has(member.role)&&!surveyRoles.has(input.role)&&member.role!=='SURVEY_MANAGER')throw new ValidationError('Use the existing Requester or Viewer role assignment');
  if(member.role!==input.expectedRole||member.roleVersion!==input.expectedRoleVersion)throw new ConflictError('This person’s role or account changed; reload and review it again','STALE_SURVEY_ROLE');
  if(member.role===input.role)return {changed:false,sessionRenewalRequired:false};
  if(input.userId===auth.userId)throw new ForbiddenError('Another authorized leader or administrator must change your operational role');
  if(!input.confirmRoleChanges)throw new ValidationError('Confirm this role change and the affected person’s sign-in renewal');
  if(project.crewBuild!=='FULL'&&input.role==='SURVEY_SUPERINTENDENT'||project.crewBuild==='SLIM'&&input.role==='PARTY_CHIEF')throw new ConflictError('This role is not supported by the project crew build');
  const obligations=await repo.roleObligations(db,auth.tenantId,projectId,input.userId);
  assertResolvedSurveyRoleObligations(obligations);
  if(input.role==='REQUESTER'&&member.teamId)throw new ConflictError('Resolve named-team membership in Team Management before removing this survey role','SURVEY_TEAM_MEMBERSHIP_OBLIGATION');
  if(member.role==='SURVEY_MANAGER'&&!await repo.anotherCurrentManager(db,auth.tenantId,projectId,input.userId))throw new ConflictError('Appoint a permanent replacement Survey Manager through Project Administration before removing this Manager','LAST_SURVEY_MANAGER');
  const roleVersion=await repo.changeOperationalRole(db,{tenantId:auth.tenantId,projectId,actorId:auth.userId},input);
  await appendAdministrativeEvent(db,{auth,projectId,subjectUserId:input.userId,eventType:'project.role_changed',authorityEvidence:{centralIT:authority.centralIT,independentProjectAdministration:!authority.centralIT},changes:{previousRole:member.role,role:input.role,previousRoleVersion:member.roleVersion,roleVersion,retainedTeamId:member.teamId,confirmed:true,sessionRenewalRequired:true,historicalTicketAssignmentsUnchanged:true}});
  return {changed:true,sessionRenewalRequired:true};
}
