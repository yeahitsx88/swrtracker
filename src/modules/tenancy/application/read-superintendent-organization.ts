import {ForbiddenError, NotFoundError} from '@/shared/errors';
import type {DbClient,UUID} from '@/shared/types';
import {type TeamActor} from './survey-teams';
import type {WorkforceRepository} from './survey-workforce';
import {readOrganizationPages,organizationLimits,type SurveyOrganization,type OrganizationPerson} from './read-survey-organization';

export interface SuperintendentOrganizationRepository extends Pick<WorkforceRepository,'context'|'personnel'|'destinations'> {
  ownIdentity(db:DbClient,actor:TeamActor):Promise<OrganizationPerson|null>;
  ownReporting(db:DbClient,actor:TeamActor,chiefIds:UUID[]):Promise<Array<Pick<SurveyOrganization['staffing'][number],'partyChiefId'|'reporting'>>>;
}
/** A projection of the existing workforce and explicitly supervised-team reads, never project-wide personnel. */
export async function readSuperintendentOrganization(repo:SuperintendentOrganizationRepository,db:DbClient,actor:TeamActor):Promise<SurveyOrganization> {
  if(actor.actorRole!=='SURVEY_SUPERINTENDENT')throw new ForbiddenError('Current Superintendent authority required');
  const project=await repo.context(db,actor),self=await repo.ownIdentity(db,actor);
  if(!project||!self)throw new NotFoundError('Current project workforce not found');
  const workforce=await readOrganizationPages(query=>repo.personnel(db,actor,query),organizationLimits.personnel,'authorized workforce members');
  const summaries=await readOrganizationPages(query=>repo.destinations(db,actor,query),organizationLimits.teams,'currently supervised named teams');
  const identity=(p:OrganizationPerson)=>({userId:p.userId,name:p.name,role:p.role,active:p.active});
  const teams:SurveyOrganization['teams']=summaries.map(team=>({...team,lead:identity(team.lead),members:team.members.map(identity)}));
  const people=[{...self,teamId:null as UUID|null,teamName:null as string|null},...workforce.map(p=>({...identity({...p,active:true}),teamId:null as UUID|null,teamName:null as string|null}))];
  for(const p of people){const team=teams.find(t=>t.members.some(m=>m.userId===p.userId));if(team){p.teamId=team.id;p.teamName=team.name;}}
  const chiefs=workforce.filter(p=>p.role==='PARTY_CHIEF'),reporting=await repo.ownReporting(db,actor,chiefs.map(p=>p.userId));
  return {projectId:actor.projectId,project,scope:'SUPERINTENDENT',personnel:people,teams,superintendentAreas:[],staffing:chiefs.map(chief=>({
    partyChiefId:chief.userId,reporting:reporting.find(link=>link.partyChiefId===chief.userId)?.reporting??null,
    areas:{data:[],total:0,limit:100,truncated:false},instrumentMen:workforce.filter(p=>p.role==='INSTRUMENT_MAN'&&p.partyChiefId===chief.userId).map(p=>identity({...p,active:true}))
  }))};
}
