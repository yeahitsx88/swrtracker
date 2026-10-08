import {ForbiddenError, NotFoundError} from '@/shared/errors';
import type {DbClient,UUID} from '@/shared/types';
import {readSurveyTeams,type TeamActor,type SurveyTeamsRepository} from './survey-teams';
import type {WorkforceRepository} from './survey-workforce';
import {readOrganizationPages,organizationLimits,type SurveyOrganization,type OrganizationPerson} from './read-survey-organization';

export interface SuperintendentOrganizationRepository extends Pick<WorkforceRepository,'context'|'personnel'> {
  ownIdentity(db:DbClient,actor:TeamActor):Promise<OrganizationPerson|null>;
  ownReporting(db:DbClient,actor:TeamActor,chiefIds:UUID[]):Promise<Array<Pick<SurveyOrganization['staffing'][number],'partyChiefId'|'reporting'>>>;
}
/** A projection of the existing workforce and led-team reads, never project-wide personnel. */
export async function readSuperintendentOrganization(repo:SuperintendentOrganizationRepository,teamsRepo:SurveyTeamsRepository,db:DbClient,actor:TeamActor):Promise<SurveyOrganization> {
  if(actor.actorRole!=='SURVEY_SUPERINTENDENT')throw new ForbiddenError('Current Superintendent authority required');
  const project=await repo.context(db,actor),self=await repo.ownIdentity(db,actor);
  if(!project||!self)throw new NotFoundError('Current project workforce not found');
  const workforce=await readOrganizationPages(query=>repo.personnel(db,actor,query),organizationLimits.personnel,'authorized workforce members');
  const summaries=await readOrganizationPages(async query=>{
    const page=await readSurveyTeams(teamsRepo,db,actor,query);
    if('team' in page)throw new Error('Expected team page');return page;
  },organizationLimits.teams,'teams you lead');
  const teams:SurveyOrganization['teams']=[];
  const identity=(p:OrganizationPerson)=>({userId:p.userId,name:p.name,role:p.role,active:p.active});
  for(const summary of summaries){
    const value=await readSurveyTeams(teamsRepo,db,actor,{search:'',limit:100,offset:0},summary.id);
    if(!('team' in value))throw new Error('Expected authorized team detail');
    teams.push({...value.team,lead:identity(value.team.lead),members:value.team.members.map(identity)});
  }
  const people=[{...self,teamId:null as UUID|null,teamName:null as string|null},...workforce.map(p=>({...identity({...p,active:true}),teamId:null as UUID|null,teamName:null as string|null}))];
  for(const p of people){const team=teams.find(t=>t.members.some(m=>m.userId===p.userId));if(team){p.teamId=team.id;p.teamName=team.name;}}
  const chiefs=workforce.filter(p=>p.role==='PARTY_CHIEF'),reporting=await repo.ownReporting(db,actor,chiefs.map(p=>p.userId));
  return {projectId:actor.projectId,project,scope:'SUPERINTENDENT',personnel:people,teams,superintendentAreas:[],staffing:chiefs.map(chief=>({
    partyChiefId:chief.userId,reporting:reporting.find(link=>link.partyChiefId===chief.userId)?.reporting??null,
    areas:{data:[],total:0,limit:100,truncated:false},instrumentMen:workforce.filter(p=>p.role==='INSTRUMENT_MAN'&&p.partyChiefId===chief.userId).map(p=>identity({...p,active:true}))
  }))};
}
