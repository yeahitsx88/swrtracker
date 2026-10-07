import test from 'node:test';
import assert from 'node:assert/strict';
import {ConflictError,ForbiddenError,ValidationError} from '@/shared/errors';
import {parseReorganization,reorganizeSurvey,type ReorganizationRepository,type ReorganizationSelection} from '@/modules/tenancy/application/reorganize-survey';
import type {DbClient,UUID} from '@/shared/types';
import type {StaffingActor} from '@/modules/tenancy/application/save-survey-staffing';
const id=(n:number)=>`91000000-0000-4000-8000-${String(n).padStart(12,'0')}` as UUID;
const actor:StaffingActor={tenantId:id(1),projectId:id(2),actorId:id(3),actorRole:'SURVEY_MANAGER',sessionVersion:1};
const selection:ReorganizationSelection={kind:'CREW',partyChiefId:id(4),areaId:id(5),superintendentId:id(6)},snapshot='a'.repeat(64),db={} as DbClient;
function fixture(){const writes:unknown[]=[];const repo:ReorganizationRepository={authorize:async(_db,a)=>{if(a.actorRole!=='SURVEY_MANAGER')throw new ForbiddenError();},preview:async()=>({snapshot,selection,summary:[],blockers:[],activeWork:0,state:{}}),apply:async(_db,_actor,p,reason)=>{writes.push({p,reason});return {changed:true};}};return {repo,writes};}
test('coordinated movement accepts explicit selection, current preview and reason',async()=>{const f=fixture();const input=parseReorganization({...selection,snapshot,reason:'Confirmed normal manpower rotation',confirmed:true},true);assert.deepEqual(await reorganizeSurvey(f.repo,db,actor,input as Parameters<typeof reorganizeSurvey>[3]),{changed:true});assert.equal(f.writes.length,1);});
test('stale work/staffing and unresolved continuity blockers cause no writes',async()=>{for(const stale of [true,false]){const f=fixture();const previous=f.repo.preview;f.repo.preview=async(...args)=>({...await previous(...args),snapshot:stale?'b'.repeat(64):snapshot,blockers:stale?[]:['Resolve open crew requests']});await assert.rejects(reorganizeSurvey(f.repo,db,actor,{...selection,snapshot,reason:'Confirmed manpower change',confirmed:true}),ConflictError);assert.equal(f.writes.length,0);}});
test('operational movement does not substitute administrator or Chief authority',async()=>{for(const role of ['PARTY_CHIEF','PROJECT_ADMIN','SURVEY_SUPERINTENDENT','REQUESTER'] as const){const f=fixture();await assert.rejects(reorganizeSurvey(f.repo,db,{...actor,actorRole:role},{...selection,snapshot,reason:'Confirmed manpower change',confirmed:true}),ForbiddenError);assert.equal(f.writes.length,0);}});
test('preview and confirmation normalize the same selection and reject unsupported intent',()=>{assert.deepEqual(parseReorganization(selection),selection);assert.throws(()=>parseReorganization({...selection,transferTickets:true}),ValidationError);for(const patch of [{confirmed:false},{reason:'short'},{snapshot:'broken'},{reason:'valid reason\ncontrol'}])assert.throws(()=>parseReorganization({...selection,snapshot,reason:'Confirmed manpower movement',confirmed:true,...patch},true),ValidationError);assert.deepEqual(parseReorganization({kind:'INSTRUMENT_MAN',instrumentManId:id(7),partyChiefId:id(8)}),{kind:'INSTRUMENT_MAN',instrumentManId:id(7),partyChiefId:id(8)});});

test('same-Area crew reporting changes preserve the complete named team without a team write',async()=>{
 const {SurveyReorganizationPgRepository}=await import('@/modules/tenancy/infrastructure/survey-reorganization.repository');
 const reporting:unknown[]=[],events:Record<string,unknown>[]=[];
 class Repository extends SurveyReorganizationPgRepository {
  override async setReportingLink(_db:DbClient,_tenant:UUID,_project:UUID,_actor:UUID,chiefId:UUID,superintendentId:UUID|null,areaId:UUID){
   reporting.push({chiefId,superintendentId,areaId});
   return {changed:true,previousSuperintendentId:id(9),previousAreaId:areaId};
  }
  override async record(_db:DbClient,_tenant:UUID,_project:UUID,_actor:UUID,payload:Record<string,unknown>){events.push(payload);}
 }
 const team={id:id(10),name:'Multi-Area crew',areaId:id(11),areas:[{id:id(11),name:'Other Area'},{id:selection.areaId,name:'Crew Area'}],rowVersion:7,lead:{userId:selection.partyChiefId},members:[{userId:selection.partyChiefId},{userId:id(12)}]};
 const destination={chiefId:selection.partyChiefId,areas:[{id:id(13),areaId:selection.areaId,departmentId:null}],reporting:[],roster:[id(12)],teams:[team.id]};
 const preview={snapshot,selection,summary:[],blockers:[],activeWork:1,state:{destination,team}};
 const noUnrelatedWrites:DbClient={query:async()=>{throw new Error('Same-Area reporting must not read or write named-team persistence');}};
 assert.deepEqual(await new Repository().apply(noUnrelatedWrites,actor,preview,'Change reporting within the current Area'),{changed:true});
 assert.deepEqual(reporting,[{chiefId:selection.partyChiefId,superintendentId:selection.superintendentId,areaId:selection.areaId}]);
 assert.equal(events.length,1);
 assert.deepEqual(events[0]!.previous,preview.state);
 assert.equal(events[0]!.historicalWorkUnchanged,true);
});

test('explicit destination binds the crew review without widening reporting-only or Instrument Man payloads',()=>{
 const chosen={...selection,destinationTeamId:id(17)};
 assert.deepEqual(parseReorganization(chosen),chosen);
 assert.deepEqual(parseReorganization({...chosen,snapshot,reason:'Move the complete reviewed crew',confirmed:true},true),{...chosen,snapshot,reason:'Move the complete reviewed crew',confirmed:true});
 assert.throws(()=>parseReorganization({...selection,destinationTeamId:null}),ValidationError);
 assert.throws(()=>parseReorganization({kind:'INSTRUMENT_MAN',instrumentManId:id(7),partyChiefId:id(8),destinationTeamId:id(17)}),ValidationError);
 assert.deepEqual(parseReorganization(selection),selection);
});
