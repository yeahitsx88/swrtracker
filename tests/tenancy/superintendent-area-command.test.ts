import assert from 'node:assert/strict';
import test from 'node:test';
import type {UUID,DbClient} from '@/shared/types';
import type {AreaUnlinkContext,SuperintendentAreaRepository,UnlinkSuperintendentAreaInput} from '@/modules/tenancy/application/superintendent-area.types';
import {ConflictError,ValidationError,NotFoundError} from '@/shared/errors';
import {unlinkSuperintendentArea,parseSuperintendentAreaUnlink} from '@/modules/tenancy/application/unlink-superintendent-area';
const id=(n:number)=>`99010000-0000-4000-8000-${String(n).padStart(12,'0')}` as UUID;
const token='a'.repeat(32),db={} as DbClient;
function fixture(){
 const context:AreaUnlinkContext={authority:{tenantId:id(1),projectId:id(3),actorId:id(10),actorMembershipId:id(100),actorCompanyId:id(2),actorCompanyType:'GC',actorSessionVersion:1,project:{status:'ACTIVE',crewBuild:'FULL'}},subject:{id:id(11),companyId:id(2),companyType:'GC',role:'SURVEY_SUPERINTENDENT',membershipId:id(101),sessionVersion:1,deactivatedAt:null},replacement:{id:id(12),companyId:id(2),companyType:'GC',role:'SURVEY_SUPERINTENDENT',membershipId:id(102),sessionVersion:1,deactivatedAt:null},assignment:{id:id(40),userId:id(11),areaId:id(21),createdAt:'2026-09-01T12:00:00.000Z',deactivatedAt:null},area:{id:id(21),name:'Area1',levelId:id(20),depth:0,parentId:null,retiredAt:null},replacementGrant:{id:id(50),userId:id(12),areaId:id(21),responsibility:'SURVEY_REVIEWER',grantedBy:id(10),grantedAt:'2026-09-01T12:00:00.000Z',revokedAt:null},replacementAssignment:{id:id(51),userId:id(12),areaId:id(21),createdAt:'2026-09-01T12:00:00.000Z',deactivatedAt:null},subtreeIds:[id(21),id(22)],reportingLinkIds:[],responsibilityGrantIds:[],actingGrantIds:[],heldMembershipIds:[id(100),id(101),id(102)]};
 const input:UnlinkSuperintendentAreaInput={action:'unlink-superintendent-area',superintendentId:id(11),linkId:id(40),replacementUserId:id(12),replacementGrantId:id(50),replacementAssignmentId:id(51),expectedSnapshot:token,confirmUnlink:true};
 const writes:string[]=[];let snapshot=token,changed=true;
 const repo={snapshot:async()=>snapshot,deactivateAssignment:async(_db:DbClient,_scope:unknown,value:UnlinkSuperintendentAreaInput)=>{assert.equal(value.linkId,id(40));if(changed)writes.push('one-assignment');return changed;},recordUnlink:async()=>{writes.push('one-staffing-event');}} as unknown as SuperintendentAreaRepository;
 return{context,input,repo,writes,stale:()=>{snapshot='b'.repeat(32);},zero:()=>{changed=false;}};
}
test('legacy complete reuse removes exactly one assignment and records one staffing event',async()=>{
 const f=fixture();const result=await unlinkSuperintendentArea(f.repo,db,f.context,f.input);
 assert.equal(result.changed,true);assert.equal(result.assignmentId,id(40));assert.equal(result.replacementGrantId,id(50));assert.equal(result.replacementAssignmentId,id(51));assert.match(result.unlinkEventId,/^[0-9a-f-]{36}$/);assert.ok(Date.parse(result.unlinkedAt));assert.deepEqual(f.writes,['one-assignment','one-staffing-event']);
});
test('all active subtree reporting responsibility and acting dependencies refuse without writes',async()=>{

 for(const field of ['reportingLinkIds','responsibilityGrantIds','actingGrantIds'] as const){const f=fixture();f.context[field]=[id(80)];await assert.rejects(unlinkSuperintendentArea(f.repo,db,f.context,f.input),ConflictError);assert.deepEqual(f.writes,[]);}
});
test('fresh cleanup refuses incomplete or mismatched exact coverage and ineligible identities',async()=>{

 const changes:Array<(c:AreaUnlinkContext)=>void>=[c=>{c.replacementGrant=null;},c=>{c.replacementAssignment=null;},c=>{c.replacementGrant!.areaId=id(24);},c=>{c.replacementAssignment!.areaId=id(24);},c=>{c.replacementGrant!.id=id(55);},c=>{c.replacementAssignment!.deactivatedAt='2026-10-01T00:00:00Z';},c=>{c.replacement.role='PARTY_CHIEF';},c=>{c.replacement.companyType='SUBCONTRACTOR';},c=>{c.subject.role='PROJECT_ADMIN';},c=>{c.subject.deactivatedAt='2026-10-01T00:00:00Z';},c=>{c.area.depth=1;},c=>{c.area.parentId=id(24);},c=>{c.area.retiredAt='2026-10-01T00:00:00Z';},c=>{c.authority.project.status='ARCHIVED';},c=>{c.authority.project.crewBuild='MEDIUM';}];
 for(const change of changes){const f=fixture();change(f.context);await assert.rejects(unlinkSuperintendentArea(f.repo,db,f.context,f.input),ConflictError);assert.deepEqual(f.writes,[]);}
 const f=fixture();f.context.assignment.userId=id(12);await assert.rejects(unlinkSuperintendentArea(f.repo,db,f.context,f.input),NotFoundError);assert.deepEqual(f.writes,[]);
});
test('obsolete snapshot and zero conditional update produce no audit',async()=>{
for(const failure of ['stale','zero'] as const){const f=fixture();f[failure]();await assert.rejects(unlinkSuperintendentArea(f.repo,db,f.context,f.input),ConflictError);assert.deepEqual(f.writes,[]);}
});
test('cleanup input binds exact witnesses confirmation and lowercase snapshot with no Area override',async()=>{
 const f=fixture();assert.deepEqual(parseSuperintendentAreaUnlink({...f.input,superintendentId:id(11).toUpperCase()}),f.input);
 for(const change of [{areaId:id(21)},{confirmUnlink:false},{replacementUserId:id(11)},{expectedSnapshot:'A'.repeat(32)},{replacementGrantId:'bad'},{action:'unlink'},{confirmUnlink:undefined}])assert.throws(()=>parseSuperintendentAreaUnlink({...f.input,...change}),ValidationError);
 for(const value of [null,[],true,'unlink'])assert.throws(()=>parseSuperintendentAreaUnlink(value),ValidationError);
});
