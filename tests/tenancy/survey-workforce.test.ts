import test from 'node:test';
import assert from 'node:assert/strict';
import { ConflictError, ForbiddenError, NotFoundError } from '@/shared/errors';
import { moveWorkforceMember, readWorkforceMember, type WorkforceRepository, type WorkforcePerson } from '@/modules/tenancy/application/survey-workforce';
import type { TeamActor } from '@/modules/tenancy/application/survey-teams';
import type { DbClient, UUID } from '@/shared/types';
const id=(n:number)=>`90000000-0000-4000-8000-${String(n).padStart(12,'0')}` as UUID;
const actor:TeamActor={tenantId:id(1),projectId:id(2),actorId:id(3),actorRole:'SURVEY_SUPERINTENDENT',sessionVersion:1};
const db={} as DbClient;
function fixture(){
 const people:WorkforcePerson[]=[{userId:id(4),name:'Chief A',email:'a@example.test',role:'PARTY_CHIEF',partyChiefId:null},
 {userId:id(5),name:'Chief B',email:'b@example.test',role:'PARTY_CHIEF',partyChiefId:null},
 {userId:id(6),name:'Assigned IM',email:'im@example.test',role:'INSTRUMENT_MAN',partyChiefId:id(4)}];
 const writes:unknown[]=[];
 const repo:WorkforceRepository={
 context:async()=>({status:'ACTIVE',crewBuild:'FULL'}),lockProject:async()=>({status:'ACTIVE',crewBuild:'FULL'}),
 lockActor:async()=>true,lockSubjects:async()=>{},snapshot:async()=>'a'.repeat(32),
 person:async(_db,_actor,userId)=>people.find(p=>p.userId===userId)??null,
 personnel:async(_db,_actor,q)=>({data:people,total:3,limit:q.limit,offset:q.offset}),
 move:async(_db,_actor,im,chief)=>{writes.push([im,chief]);},record:async(_db,_actor,payload)=>{writes.push(payload);}
 };
 return {repo,people,writes};
}
test('Superintendent transfers an assigned Instrument Man between their assigned Chiefs with an audit event',async()=>{
 const f=fixture();
 assert.deepEqual(await moveWorkforceMember(f.repo,db,actor,{instrumentManId:id(6),partyChiefId:id(5),expectedSnapshot:'a'.repeat(32)}),{changed:true});
 assert.equal(f.writes.length,2);
 assert.deepEqual(f.writes[0],[id(6),id(5)]);
 assert.equal((f.writes[1] as Record<string,unknown>).previousPartyChiefId,id(4));
});
test('out-of-pool Instrument Men and destination Chiefs fail without writes',async()=>{
 for(const input of [{instrumentManId:id(99),partyChiefId:id(5)},{instrumentManId:id(6),partyChiefId:id(99)}]){
 const f=fixture();await assert.rejects(moveWorkforceMember(f.repo,db,actor,{...input,expectedSnapshot:'a'.repeat(32)}),NotFoundError);assert.deepEqual(f.writes,[]);
 }
});
test('Party Chief has read-only member access and cannot expand or reorganize their workforce',async()=>{
 const f=fixture();const pc={...actor,actorRole:'PARTY_CHIEF' as const};
 assert.equal((await readWorkforceMember(f.repo,db,pc,id(6))).name,'Assigned IM');
 await assert.rejects(moveWorkforceMember(f.repo,db,pc,{instrumentManId:id(6),partyChiefId:id(5),expectedSnapshot:'a'.repeat(32)}),ForbiddenError);
 await assert.rejects(readWorkforceMember(f.repo,db,pc,id(99)),NotFoundError);assert.deepEqual(f.writes,[]);
});
test('stale staffing, changed actor authority, and archived projects reject workforce transfers',async()=>{
 for(const kind of ['snapshot','actor','archive']){
 const f=fixture();if(kind==='snapshot')f.repo.snapshot=async()=>'b'.repeat(32);if(kind==='actor')f.repo.lockActor=async()=>false;if(kind==='archive')f.repo.lockProject=async()=>({status:'ARCHIVED',crewBuild:'FULL'});
 await assert.rejects(moveWorkforceMember(f.repo,db,actor,{instrumentManId:id(6),partyChiefId:id(5),expectedSnapshot:'a'.repeat(32)}),kind==='actor'?ForbiddenError:ConflictError);assert.deepEqual(f.writes,[]);
 }
});
test('unrelated project roles cannot inspect workforce members',async()=>{
 const f=fixture();await assert.rejects(readWorkforceMember(f.repo,db,{...actor,actorRole:'REQUESTER'},id(6)),ForbiddenError);
});
