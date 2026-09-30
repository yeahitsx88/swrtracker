import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import { deactivateSurveyTeam, readSurveyTeams, readTeamPersonnel, readTeamContext, readTeamAreas, saveSurveyTeam,
  type SurveyTeamDetail, type TeamActor, type TeamPersonnel } from '@/modules/tenancy/application/survey-teams';
import { handleDeleteSurveyTeam, handleGetSurveyTeams, handlePostSurveyTeam, parseTeamInput, parseTeamPage,
  handlePatchSurveyRole, parseSurveyRoleInput, type TeamDeps } from '@/app/api/projects/[projectId]/survey/teams/handler';
import { changeSurveyRole, type ChangeSurveyRoleInput, type SurveyRoleRepository } from '@/modules/tenancy/application/change-survey-role';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}` as UUID;
const tenantId=id(1), projectId=id(2), actorId=id(3), chiefId=id(4), imId=id(5), areaId=id(6), teamId=id(7);
const db = {} as DbClient;
const actor: TeamActor = { tenantId, projectId, actorId, actorRole: 'SURVEY_MANAGER', sessionVersion: 1 };
const chief: TeamPersonnel = { userId: chiefId, name:'Chief',email:'chief@example.test',role:'PARTY_CHIEF',active:true,teamId:null,teamName:null,roleVersion:1 };
const im: TeamPersonnel = { ...chief, userId:imId,name:'Instrument Man',role:'INSTRUMENT_MAN' };
const input = () => ({ teamId:null, expectedVersion:null, name:'Train 1 Team', areaId, leadUserId:chiefId, memberIds:[chiefId,imId] });

function fixture() {
  const writes: string[]=[];
  const events: Record<string, unknown>[]=[];
  const obligations={leadsTeam:false,areaAssignments:0,crewLinks:0,reportingLinks:0,responsibilityGrants:0,actingGrants:0};
  let current: SurveyTeamDetail | null=null;
  const people: [TeamPersonnel, TeamPersonnel]=[{...chief},{...im}];
  const repo: SurveyRoleRepository = {
    projectContext:async()=>({status:'ACTIVE',crewBuild:'FULL'}),
    areas:async(_db,t,p,q)=>({data:t===tenantId&&p===projectId?[{id:areaId,name:'Train 1'}]:[],total:1,limit:q.limit,offset:q.offset}),
    lockProject: async()=>({status:'ACTIVE',crewBuild:'FULL'}), lockManager:async()=>true,
    team:async(_db,t,p)=> t===tenantId && p===projectId ? current : null,
    list:async(_db,t,p,q)=>({data:t===tenantId&&p===projectId&&current?[current]:[],total:current?1:0,limit:q.limit,offset:q.offset}),
    personnel:async(_db,_t,_p,q)=>({data:people,total:people.length,limit:q.limit,offset:q.offset}),
    activeArea:async()=>true,members:async(_db,t,p,ids)=>t===tenantId&&p===projectId?people.filter(person=>ids.includes(person.userId)):[],
    nameExists:async()=>false,
    save:async(_db,_actor,newId,value)=>{ writes.push('save'); current={id:newId,name:value.name,areaId:value.areaId,areaName:'Train 1',lead:people.find(person=>person.userId===value.leadUserId)!,memberCount:value.memberIds.length,rowVersion:(current?.rowVersion??0)+1,members:people.filter(person=>value.memberIds.includes(person.userId))}; },
    deactivate:async()=>{writes.push('deactivate');current=null;}, recordTeamEvent:async(_db,_actor,event,payload)=>{writes.push(event);events.push(payload);},
    roleObligations:async()=>obligations,
    changeOperationalRole:async(_db,_actor,value)=>{const member=people.find(p=>p.userId===value.userId)!;member.role=value.role;member.roleVersion++;writes.push('role');return member.roleVersion;},
  };
  return {repo,writes,people,events,obligations,current:()=>current};
}

test('team creation and edits record atomic project events, while no-op saves retain the version', async()=>{
  const f=fixture(); const created=await saveSurveyTeam(f.repo,db,actor,input());
  assert.equal(created.rowVersion,1); assert.deepEqual(f.writes,['save','survey.team_created']);
  const updated={...input(),teamId:created.teamId,expectedVersion:1};
  assert.equal((await saveSurveyTeam(f.repo,db,actor,updated)).changed,false);
  assert.equal((await saveSurveyTeam(f.repo,db,actor,{...updated,name:'Utilities'})).rowVersion,2);
  assert.deepEqual(f.writes,['save','survey.team_created','save','survey.team_updated']);
});

test('all team reads and writes reject non-Manager roles before repository access', async()=>{
  const f=fixture(); const wrong={...actor,actorRole:'SURVEY_SUPERINTENDENT' as const};
  await assert.rejects(saveSurveyTeam(f.repo,db,wrong,input()),ForbiddenError);
  await assert.rejects(deactivateSurveyTeam(f.repo,db,wrong,teamId,1),ForbiddenError);
  await assert.rejects(readSurveyTeams(f.repo,db,wrong,{search:'',limit:25,offset:0}),ForbiddenError);
  await assert.rejects(readTeamPersonnel(f.repo,db,wrong,{search:'',limit:25,offset:0}),ForbiddenError);
  await assert.rejects(readTeamContext(f.repo,db,wrong),ForbiddenError);
  await assert.rejects(readTeamAreas(f.repo,db,wrong,{search:'',limit:10,offset:0}),ForbiddenError);
  assert.deepEqual(f.writes,[]);
});

test('Manager picker context and Area pages use scoped reads and reject incompatible detail parameters',async()=>{
  const f=fixture();
  const deps:TeamDeps={repo:f.repo,requireAuth:()=>({userId:actorId,tenantId,sessionVersion:1}),getProjectRole:async()=>actor.actorRole,
    withTransaction:async fn=>fn(db),executeIdempotent:async(_db,_ctx,_input,fn)=>({...await fn(),replayed:false})};
  const ctx={params:Promise.resolve({projectId})};
  const request=(query:string)=>new NextRequest(`http://localhost/api/projects/${projectId}/survey/teams${query}`);
  assert.deepEqual(await (await handleGetSurveyTeams(request('?mode=context'),ctx,deps)).json(),{project:{status:'ACTIVE',crewBuild:'FULL'}});
  const areas=await handleGetSurveyTeams(request('?mode=areas&limit=10'),ctx,deps);
  assert.equal(areas.status,200);assert.deepEqual((await areas.json()).data,[{id:areaId,name:'Train 1'}]);
  assert.equal((await handleGetSurveyTeams(request(`?mode=context&teamId=${teamId}`),ctx,deps)).status,400);
  assert.equal((await handleGetSurveyTeams(request('?mode=areas'),ctx,{...deps,getProjectRole:async()=>'REQUESTER'})).status,403);
  f.repo.projectContext=async()=>null;
  assert.equal((await handleGetSurveyTeams(request('?mode=context'),ctx,deps)).status,404);
});

test('team mutation rejects archived projects and a changed Manager assignment/session', async()=>{
  const f=fixture(); f.repo.lockManager=async()=>false;
  await assert.rejects(saveSurveyTeam(f.repo,db,actor,input()),ForbiddenError);
  f.repo.lockManager=async()=>true; f.repo.lockProject=async()=>({status:'ARCHIVED',crewBuild:'FULL'});
  await assert.rejects(saveSurveyTeam(f.repo,db,actor,input()),ConflictError);
  assert.deepEqual(f.writes,[]);
});

test('team lead must be a selected member and personnel cannot belong to another active team',async()=>{
  const f=fixture();
  await assert.rejects(saveSurveyTeam(f.repo,db,actor,{...input(),leadUserId:id(99)}),ConflictError);
  f.people[1].teamId=id(99);
  await assert.rejects(saveSurveyTeam(f.repo,db,actor,input()),ConflictError);
  assert.deepEqual(f.writes,[]);
});

test('team members and Areas remain tenant/project scoped, active and survey-role eligible',async()=>{
  const f=fixture();
  await assert.rejects(saveSurveyTeam(f.repo,db,actor,{...input(),memberIds:[chiefId,id(99)]}),ConflictError);
  await assert.rejects(saveSurveyTeam(f.repo,db,{...actor,tenantId:id(99)},input()),ConflictError);
  f.people[1].active=false;
  await assert.rejects(saveSurveyTeam(f.repo,db,actor,input()),ConflictError);
  f.people[1].active=true;f.people[1].role='REQUESTER';
  await assert.rejects(saveSurveyTeam(f.repo,db,actor,input()),ConflictError);
  f.people[1].role='INSTRUMENT_MAN';f.repo.activeArea=async()=>false;
  await assert.rejects(saveSurveyTeam(f.repo,db,actor,input()),NotFoundError);
  assert.deepEqual(f.writes,[]);
});

test('duplicate team names and crew-build incompatible survey roles are rejected',async()=>{
  const f=fixture();f.repo.nameExists=async()=>true;
  await assert.rejects(saveSurveyTeam(f.repo,db,actor,input()),ConflictError);
  f.repo.nameExists=async()=>false;f.repo.lockProject=async()=>({status:'ACTIVE',crewBuild:'SLIM'});
  await assert.rejects(saveSurveyTeam(f.repo,db,actor,input()),ConflictError);
  f.people[0].role='SURVEY_SUPERINTENDENT';f.repo.lockProject=async()=>({status:'ACTIVE',crewBuild:'MEDIUM'});
  await assert.rejects(saveSurveyTeam(f.repo,db,actor,input()),ConflictError);
  assert.deepEqual(f.writes,[]);
});

test('stale edits/deletes and removing the lead without a replacement are rejected',async()=>{
  const f=fixture();const {teamId:created}=await saveSurveyTeam(f.repo,db,actor,input());
  await assert.rejects(saveSurveyTeam(f.repo,db,actor,{...input(),teamId:created,expectedVersion:2}),ConflictError);
  await assert.rejects(deactivateSurveyTeam(f.repo,db,actor,created,2),ConflictError);
  await assert.rejects(saveSurveyTeam(f.repo,db,actor,{...input(),teamId:created,expectedVersion:1,memberIds:[imId]}),ConflictError);
  assert.deepEqual(f.writes,['save','survey.team_created']);
  await deactivateSurveyTeam(f.repo,db,actor,created,1);
  assert.deepEqual(f.writes,['save','survey.team_created','deactivate','survey.team_deactivated']);
});

test('tenant/project scoped team detail returns NotFound without exposing another project',async()=>{
  const f=fixture();await saveSurveyTeam(f.repo,db,actor,input());
  await assert.rejects(readSurveyTeams(f.repo,db,{...actor,projectId:id(99)},{search:'',limit:25,offset:0},teamId),NotFoundError);
});

test('team trust boundary rejects duplicate people, unbounded pages, missing versions and malformed IDs',()=>{
  assert.throws(()=>parseTeamInput({...input(),memberIds:[chiefId,chiefId]}),ValidationError);
  assert.throws(()=>parseTeamInput({...input(),memberIds:Array(101).fill(chiefId)}),ValidationError);
  assert.throws(()=>parseTeamInput({...input(),teamId}),ValidationError);
  assert.throws(()=>parseTeamInput({...input(),areaId:'foreign'}),ValidationError);
  assert.throws(()=>parseTeamInput({...input(),name:'\u0000'}),ValidationError);
  assert.throws(()=>parseTeamPage(new NextRequest('http://localhost/api?limit=10000')),ValidationError);
  assert.throws(()=>parseTeamPage(new NextRequest('http://localhost/api?offset=-1')),ValidationError);
  assert.deepEqual(parseTeamPage(new NextRequest('http://localhost/api?limit=10&offset=20&search=Train')), {search:'Train',limit:10,offset:20});
});

test('team route resolves project membership, rejects wrong roles and requires delete confirmation',async()=>{
  const f=fixture();let resolvedProject:UUID|null=null;
  const deps:TeamDeps={repo:f.repo,requireAuth:()=>({tenantId,userId:actorId,sessionVersion:1}),
    getProjectRole:async(_db,_tenant,project)=>{resolvedProject=project;return 'SURVEY_MANAGER';},withTransaction:async fn=>fn(db),
    executeIdempotent:async(_db,_scope,_payload,mutation)=>({...await mutation(),replayed:false})};
  const ctx={params:Promise.resolve({projectId})};
  const request=(method:string,value:unknown)=>new NextRequest('http://localhost/api',{method,headers:{'idempotency-key':'team-test-key'},body:JSON.stringify(value)});
  assert.equal((await handlePostSurveyTeam(new NextRequest('http://localhost/api',{method:'POST',body:JSON.stringify(input())}),ctx,deps)).status,400);
  assert.deepEqual(f.writes,[]);
  assert.equal((await handlePostSurveyTeam(request('POST',input()),ctx,deps)).status,201);
  assert.equal(resolvedProject,projectId);
  assert.equal((await handleDeleteSurveyTeam(request('DELETE',{teamId,expectedVersion:1}),ctx,deps)).status,400);
  deps.getProjectRole=async()=> 'PARTY_CHIEF';
  assert.equal((await handleGetSurveyTeams(new NextRequest('http://localhost/api?mode=personnel'),ctx,deps)).status,403);
  assert.equal((await handlePostSurveyTeam(request('POST',input()),ctx,deps)).status,403);
  deps.getProjectRole=async()=>{throw new ForbiddenError('Not a member');};
  assert.equal((await handleGetSurveyTeams(new NextRequest('http://localhost/api'),ctx,deps)).status,403);
});

const roleInput = (value: Partial<ChangeSurveyRoleInput> = {}): ChangeSurveyRoleInput => ({
  userId:chiefId,expectedRole:'PARTY_CHIEF',expectedRoleVersion:1,role:'INSTRUMENT_MAN',confirmRoleChanges:true,...value,
});

test('fixed survey role assignment/promotion/demotion/removal retains one existing identity and records each change',async()=>{
  const f=fixture();f.people[0].role='REQUESTER';
  for(const role of ['INSTRUMENT_MAN','PARTY_CHIEF','SURVEY_SUPERINTENDENT','REQUESTER'] as const) {
    const member=f.people[0]; const from=member.role;
    const result=await changeSurveyRole(f.repo,db,actor,roleInput({expectedRole:from,expectedRoleVersion:member.roleVersion,role}));
    assert.equal(result.changed,true);assert.equal(result.userId,chiefId);assert.equal(result.role,role);
  }
  assert.equal(f.people[0].roleVersion,5);assert.equal(f.people.length,2);
  assert.deepEqual(f.writes,['role','survey.role_changed','role','survey.role_changed','role','survey.role_changed','role','survey.role_changed']);
  assert.equal(f.events[3]!.role,'REQUESTER');assert.equal(f.events[3]!.historicalTicketAssignmentsUnchanged,true);
});

test('role no-op writes no audit/session change; stale role or account version is rejected including ABA',async()=>{
  const f=fixture();
  assert.equal((await changeSurveyRole(f.repo,db,actor,roleInput({role:'PARTY_CHIEF',confirmRoleChanges:false}))).changed,false);
  assert.deepEqual(f.writes,[]);
  await assert.rejects(changeSurveyRole(f.repo,db,actor,roleInput({expectedRole:'REQUESTER'})),ConflictError);
  await assert.rejects(changeSurveyRole(f.repo,db,actor,roleInput({expectedRoleVersion:2})),ConflictError);
  await changeSurveyRole(f.repo,db,actor,roleInput());
  await changeSurveyRole(f.repo,db,actor,roleInput({expectedRole:'INSTRUMENT_MAN',expectedRoleVersion:2,role:'PARTY_CHIEF'}));
  await assert.rejects(changeSurveyRole(f.repo,db,actor,roleInput()),ConflictError);
  assert.equal(f.writes.length,4);
});

test('role edits never replace Survey Manager or unrelated elevated project roles',async()=>{
  const f=fixture();
  for(const role of ['SURVEY_MANAGER','PROJECT_ADMIN','CAD_LEAD','DEPARTMENT_MANAGER'] as const) {
    f.people[0].role=role;
    await assert.rejects(changeSurveyRole(f.repo,db,actor,roleInput({expectedRole:role})),ConflictError);
  }
  await assert.rejects(changeSurveyRole(f.repo,db,{...actor,actorRole:'PARTY_CHIEF'},roleInput()),ForbiddenError);
  assert.deepEqual(f.writes,[]);
});

test('removing a survey role requires removing the team member and replacing the lead first',async()=>{
  const f=fixture();f.people[0].teamId=teamId;f.obligations.leadsTeam=true;
  await assert.rejects(changeSurveyRole(f.repo,db,actor,roleInput({role:'REQUESTER'})),/Choose another team lead/);
  f.obligations.leadsTeam=false;
  await assert.rejects(changeSurveyRole(f.repo,db,actor,roleInput({role:'REQUESTER'})),/Remove this person from their named team/);
  // Changing between supported roles need not remove organizational membership.
  await changeSurveyRole(f.repo,db,actor,roleInput());
  assert.equal(f.events[0]!.retainedTeamId,teamId);
});

test('active crew, reporting, Area, responsibility and acting obligations block incompatible role changes',async()=>{
  const f=fixture();
  for(const key of ['crewLinks','reportingLinks','areaAssignments','responsibilityGrants','actingGrants'] as const) {
    f.obligations[key]=1;
    await assert.rejects(changeSurveyRole(f.repo,db,actor,roleInput()),ConflictError);
    f.obligations[key]=0;
  }
  assert.deepEqual(f.writes,[]);
});

test('role changes require confirmation and active project membership, and respect the crew build',async()=>{
  const f=fixture();
  await assert.rejects(changeSurveyRole(f.repo,db,actor,roleInput({confirmRoleChanges:false})),ValidationError);
  await assert.rejects(changeSurveyRole(f.repo,db,actor,roleInput({userId:id(99)})),NotFoundError);
  f.people[0].active=false;
  await assert.rejects(changeSurveyRole(f.repo,db,actor,roleInput()),NotFoundError);
  f.people[0].active=true;f.repo.lockProject=async()=>({status:'ACTIVE',crewBuild:'MEDIUM'});
  await assert.rejects(changeSurveyRole(f.repo,db,actor,roleInput({role:'SURVEY_SUPERINTENDENT'})),ConflictError);
  f.repo.lockProject=async()=>({status:'ACTIVE',crewBuild:'SLIM'});
  await assert.rejects(changeSurveyRole(f.repo,db,actor,roleInput({role:'PARTY_CHIEF'})),ConflictError);
  f.repo.lockProject=async()=>({status:'ARCHIVED',crewBuild:'FULL'});
  await assert.rejects(changeSurveyRole(f.repo,db,actor,roleInput()),ConflictError);
  assert.deepEqual(f.writes,[]);
});

test('role command trust boundary refuses arbitrary permissions and requires a current role version',async()=>{
  const body={action:'set-role',...roleInput()};
  assert.throws(()=>parseSurveyRoleInput({...body,role:'TENANT_ADMIN'}),ValidationError);
  assert.throws(()=>parseSurveyRoleInput({...body,expectedRole:'SURVEY_MANAGER'}),ValidationError);
  assert.throws(()=>parseSurveyRoleInput({...body,expectedRoleVersion:undefined}),ValidationError);
  assert.throws(()=>parseSurveyRoleInput({...body,action:'custom-role'}),ValidationError);
  const f=fixture();
  const deps:TeamDeps={repo:f.repo,requireAuth:()=>({tenantId,userId:actorId,sessionVersion:1}),getProjectRole:async()=> 'SURVEY_MANAGER',
    withTransaction:async fn=>fn(db),executeIdempotent:async(_db,_scope,_payload,mutation)=>({...await mutation(),replayed:false})};
  const req=new NextRequest('http://localhost/api',{method:'PATCH',headers:{'idempotency-key':'role-command'},body:JSON.stringify(body)});
  const result=await handlePatchSurveyRole(req,{params:Promise.resolve({projectId})},deps);
  assert.equal(result.status,200);assert.equal((await result.json()).roleVersion,2);
});
