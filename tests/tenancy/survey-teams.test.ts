import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import { deactivateSurveyTeam, readSurveyTeams, readTeamPersonnel, saveSurveyTeam,
  type SurveyTeamDetail, type SurveyTeamsRepository, type TeamActor, type TeamPersonnel } from '@/modules/tenancy/application/survey-teams';
import { handleDeleteSurveyTeam, handleGetSurveyTeams, handlePostSurveyTeam, parseTeamInput, parseTeamPage,
  type TeamDeps } from '@/app/api/projects/[projectId]/survey/teams/handler';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}` as UUID;
const tenantId=id(1), projectId=id(2), actorId=id(3), chiefId=id(4), imId=id(5), areaId=id(6), teamId=id(7);
const db = {} as DbClient;
const actor: TeamActor = { tenantId, projectId, actorId, actorRole: 'SURVEY_MANAGER', sessionVersion: 1 };
const chief: TeamPersonnel = { userId: chiefId, name:'Chief',email:'chief@example.test',role:'PARTY_CHIEF',active:true,teamId:null,teamName:null };
const im: TeamPersonnel = { ...chief, userId:imId,name:'Instrument Man',role:'INSTRUMENT_MAN' };
const input = () => ({ teamId:null, expectedVersion:null, name:'Train 1 Team', areaId, leadUserId:chiefId, memberIds:[chiefId,imId] });

function fixture() {
  const writes: string[]=[];
  let current: SurveyTeamDetail | null=null;
  const people: [TeamPersonnel, TeamPersonnel]=[{...chief},{...im}];
  const repo: SurveyTeamsRepository = {
    lockProject: async()=>({status:'ACTIVE',crewBuild:'FULL'}), lockManager:async()=>true,
    team:async(_db,t,p)=> t===tenantId && p===projectId ? current : null,
    list:async(_db,t,p,q)=>({data:t===tenantId&&p===projectId&&current?[current]:[],total:current?1:0,limit:q.limit,offset:q.offset}),
    personnel:async(_db,_t,_p,q)=>({data:people,total:people.length,limit:q.limit,offset:q.offset}),
    activeArea:async()=>true,members:async(_db,t,p,ids)=>t===tenantId&&p===projectId?people.filter(person=>ids.includes(person.userId)):[],
    nameExists:async()=>false,
    save:async(_db,_actor,newId,value)=>{ writes.push('save'); current={id:newId,name:value.name,areaId:value.areaId,areaName:'Train 1',lead:people.find(person=>person.userId===value.leadUserId)!,memberCount:value.memberIds.length,rowVersion:(current?.rowVersion??0)+1,members:people.filter(person=>value.memberIds.includes(person.userId))}; },
    deactivate:async()=>{writes.push('deactivate');current=null;}, recordTeamEvent:async(_db,_actor,event)=>{writes.push(event);},
  };
  return {repo,writes,people,current:()=>current};
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
  assert.deepEqual(f.writes,[]);
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
