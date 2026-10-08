import assert from 'node:assert/strict';
import test from 'node:test';
import {readSuperintendentOrganization,type SuperintendentOrganizationRepository} from '@/modules/tenancy/application/read-superintendent-organization';
import {organizationChartPeople} from '@/components/ui/survey-org-chart/survey-org-chart-live-model';
import type {SurveyTeamsRepository,TeamActor,SurveyTeamDetail} from '@/modules/tenancy/application/survey-teams';
import type {DbClient,UUID} from '@/shared/types';
const id=(n:number)=>`91010000-0000-4000-8000-${String(n).padStart(12,'0')}` as UUID;
const actor:TeamActor={tenantId:id(1),projectId:id(2),actorId:id(3),actorRole:'SURVEY_SUPERINTENDENT',sessionVersion:1};
const db={} as DbClient,self={userId:id(3),name:'Own Superintendent',role:'SURVEY_SUPERINTENDENT' as const,active:true};
const personnel=[{userId:id(4),name:'Reported Chief',email:'private@example.invalid',role:'PARTY_CHIEF' as const,partyChiefId:null},{userId:id(5),name:'Named-team Chief without reporting',email:'private@example.invalid',role:'PARTY_CHIEF' as const,partyChiefId:null},{userId:id(6),name:'Crew Instrument',email:'private@example.invalid',role:'INSTRUMENT_MAN' as const,partyChiefId:id(4)},{userId:id(7),name:'Instrument with outside-scope Chief',email:'private@example.invalid',role:'INSTRUMENT_MAN' as const,partyChiefId:id(99)}];
function fixture(){
 const calls:unknown[]=[],team:SurveyTeamDetail={id:id(20),name:'Own Team',areaId:id(30),areaName:'Independent Team Area',areas:[{id:id(30),name:'Independent Team Area'},{id:id(31),name:'Additional Area'}],lead:{...self,email:'private@example.invalid'},members:[{...self,email:'private@example.invalid'},...personnel.map(p=>({...p,active:true}))],rowVersion:1,memberCount:5};
 const repo:SuperintendentOrganizationRepository={context:async(_db,a)=>{calls.push(a);return{status:'ACTIVE',crewBuild:'FULL'};},ownIdentity:async(_db,a)=>{calls.push(a);return self;},personnel:async(_db,a,q)=>{calls.push(a);return{data:personnel,total:4,offset:q.offset,limit:q.limit,snapshotToken:'a'.repeat(32)};},ownReporting:async(_db,a,chiefIds)=>{calls.push(a);assert.deepEqual(chiefIds,[id(4),id(5)]);return[{partyChiefId:id(4),reporting:{id:id(40),superintendent:self,area:{id:id(32),name:'Explicit Reporting Area',retired:false}}}];}};
 const teams={list:async(_db:DbClient,tenant:UUID,project:UUID,_q:unknown,lead:UUID)=>{assert.deepEqual([tenant,project,lead],[actor.tenantId,actor.projectId,actor.actorId]);return{data:[team],total:1,limit:100,offset:0};},team:async()=>team} as unknown as SurveyTeamsRepository;
 return{repo,teams,calls};
}
test('Superintendent chart reuses led teams and scoped workforce without inventing reporting or availability',async()=>{
 const f=fixture(),data=await readSuperintendentOrganization(f.repo,f.teams,db,actor),people=organizationChartPeople(data);
 assert.equal(data.scope,'SUPERINTENDENT');assert.equal(JSON.stringify(data).includes('private@example.invalid'),false);
 assert.deepEqual(people.map(p=>p.id),[id(3),id(4),id(5),id(6),id(7)]);assert.ok(f.calls.every(a=>a===actor));
 assert.equal(people.find(p=>p.id===id(4))?.parentId,id(3));assert.equal(people.find(p=>p.id===id(5))?.parentId,null);
 assert.equal(people.find(p=>p.id===id(6))?.parentId,id(4));assert.equal(people.find(p=>p.id===id(7))?.parentId,null);
 assert.match(people.find(p=>p.id===id(5))!.details.join(';'),/No explicit reporting link to you/);
 assert.ok(!people.find(p=>p.id===id(4))!.details.some(s=>s.startsWith('Assigned Areas:')),'Unavailable individual Area evidence is not asserted absent');
 assert.deepEqual(data.teams[0]?.areas?.map(a=>a.id),[id(30),id(31)]);
});
test('Scoped chart refuses wrong role and denied current context without project-wide personnel reads',async()=>{
 const f=fixture();for(const role of ['SURVEY_MANAGER','PARTY_CHIEF','INSTRUMENT_MAN','REQUESTER','VIEWER','PROJECT_ADMIN'] as const)await assert.rejects(readSuperintendentOrganization(f.repo,f.teams,db,{...actor,actorRole:role}),{name:'ForbiddenError'});
 assert.deepEqual(f.calls,[]);f.repo.context=async()=>null;await assert.rejects(readSuperintendentOrganization(f.repo,f.teams,db,actor),{name:'NotFoundError'});
});
test('Scoped oversized workforce fails explicitly and archived data remains read-only evidence',async()=>{
 const f=fixture();f.repo.personnel=async()=>({data:[],total:501,offset:0,limit:100,snapshotToken:'a'.repeat(32)});await assert.rejects(readSuperintendentOrganization(f.repo,f.teams,db,actor),{code:'ORG_CHART_LIMIT'});
 const archived=fixture();archived.repo.context=async()=>({status:'ARCHIVED',crewBuild:'FULL'});assert.equal((await readSuperintendentOrganization(archived.repo,archived.teams,db,actor)).project.status,'ARCHIVED');
});
