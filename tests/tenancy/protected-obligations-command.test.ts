import test from 'node:test';
import assert from 'node:assert/strict';
import {parseReviewerResolution,resolveSurveyReviewer} from '../../src/modules/tenancy/application/resolve-survey-reviewer';
import type {ProtectedObligationsRepository,ResolutionContext,ResolveReviewerInput} from '../../src/modules/tenancy/application/protected-obligations.types';
import type {DbClient,UUID} from '../../src/shared/types';
import {ConflictError,ForbiddenError,NotFoundError,ValidationError} from '../../src/shared/errors';
const id=(n:number)=>`98000000-0000-4000-8000-${String(n).padStart(12,'0')}` as UUID;
const grant={id:id(30),userId:id(11),areaId:id(21),responsibility:'SURVEY_REVIEWER',grantedBy:id(14),grantedAt:'2026-09-30T00:00:00Z',revokedAt:null};
const assignment={id:id(41),userId:id(12),areaId:id(21),createdAt:'2026-09-30T00:00:00Z',deactivatedAt:null};
const token='a'.repeat(32),db={} as DbClient;
const input:ResolveReviewerInput={userId:id(11),grantId:id(30),replacementUserId:id(12),coverageMode:'assignAdditional',confirmResolution:true,confirmAdditionalCoverage:true,coverageIntent:'TEMPORARY',expectedSnapshot:token};
function fixture(){
 const context:ResolutionContext={authority:{branch:'SURVEY_MANAGER',tenantId:id(1),projectId:id(3),actorId:id(10),actorMembershipId:id(100),actorCompanyId:id(2),actorCompanyType:'GC',actorSessionVersion:1,project:{status:'ACTIVE',crewBuild:'FULL'}},grant,area:{id:id(21),name:'Area1',levelId:id(20),depth:0,parentId:null,retiredAt:null},subject:{id:id(11),companyId:id(2),companyType:'GC',role:'SURVEY_SUPERINTENDENT',membershipId:id(101),sessionVersion:1,deactivatedAt:null},replacement:{id:id(12),companyId:id(2),companyType:'GC',role:'SURVEY_SUPERINTENDENT',membershipId:id(102),sessionVersion:1,deactivatedAt:null},replacementGrant:null,replacementAssignment:null};
 const writes:string[]=[],records:any[]=[];
 const repo={snapshot:async()=>token,createIndividualCoverage:async(_db:any,_scope:any,userId:UUID,areaId:UUID,rowId:UUID,at:string)=>{writes.push('assignment');return{...assignment,id:rowId,userId,areaId,createdAt:at};},createReviewCoverage:async(_db:any,_scope:any,userId:UUID,areaId:UUID,actorId:UUID,rowId:UUID,at:string)=>{writes.push('grant');return{...grant,id:rowId,userId,areaId,grantedBy:actorId,grantedAt:at};},revokeSelectedGrant:async()=>{writes.push('revoke');return true;},recordResolution:async(...args:any[])=>{writes.push('audit');records.push(args);}} as unknown as ProtectedObligationsRepository;
 return{context,repo,writes,records};
}
test('additional coverage creates only missing exact-Area witnesses before revoke/audit',async()=>{
 const f=fixture(),result=await resolveSurveyReviewer(f.repo,db,f.context,input);
 assert.deepEqual(f.writes,['assignment','grant','revoke','audit']);assert.equal(result.createdReviewGrant,true);assert.equal(result.createdIndividualAssignment,true);assert.equal(result.grantId,grant.id);assert.equal(result.replacementUserId,id(12));assert.equal(f.context.grant.revokedAt,null);
});
test('reuse preserves original provenance and never creates coverage',async()=>{
 const f=fixture();f.context.replacementGrant={...grant,id:id(31),userId:id(12)};f.context.replacementAssignment=assignment;
 const result=await resolveSurveyReviewer(f.repo,db,f.context,{userId:input.userId,grantId:input.grantId,replacementUserId:input.replacementUserId,expectedSnapshot:token,confirmResolution:true,coverageMode:'reuse'});
 assert.deepEqual(f.writes,['revoke','audit']);assert.equal(result.replacementGrantId,id(31));assert.equal(result.replacementAssignmentId,assignment.id);assert.equal(result.createdReviewGrant,false);assert.equal(result.createdIndividualAssignment,false);
});
test('grant-only and assignment-only coverage add only the missing witness',async()=>{
 for(const existing of ['grant','assignment']){const f=fixture();if(existing==='grant')f.context.replacementGrant={...grant,id:id(31),userId:id(12)};else f.context.replacementAssignment=assignment;
 const result=await resolveSurveyReviewer(f.repo,db,f.context,{...input,coverageIntent:'PERMANENT'});assert.equal(result.createdReviewGrant,existing!=='grant');assert.equal(result.createdIndividualAssignment,existing!=='assignment');assert.equal(f.writes[0],existing==='grant'?'assignment':'grant');assert.equal(f.writes.length,3);}
});
test('stale checksum cannot create revoke or audit',async()=>{
 const f=fixture();await assert.rejects(resolveSurveyReviewer(f.repo,db,f.context,{...input,expectedSnapshot:'b'.repeat(32)}),(e:any)=>e instanceof ConflictError&&e.code==='STALE_PROTECTED_OBLIGATIONS');assert.deepEqual(f.writes,[]);
});
test('fresh command refuses unsupported scope, subject and replacement evidence before writes',async()=>{
 for(const change of [(c:ResolutionContext)=>{c.grant={...grant,responsibility:'FIELD_COORDINATOR'};},(c:ResolutionContext)=>{c.grant={...grant,revokedAt:'2026-09-30T00:00:00Z'};},(c:ResolutionContext)=>{c.area=null;},(c:ResolutionContext)=>{c.area!.depth=1;},(c:ResolutionContext)=>{c.area!.parentId=id(22);},(c:ResolutionContext)=>{c.area!.retiredAt='2026-09-30';},(c:ResolutionContext)=>{c.subject.role='SURVEY_MANAGER';},(c:ResolutionContext)=>{c.subject.deactivatedAt='2026-09-30';},(c:ResolutionContext)=>{c.replacement.role='PARTY_CHIEF';},(c:ResolutionContext)=>{c.replacement.companyType='SUBCONTRACTOR';},(c:ResolutionContext)=>{c.replacement.deactivatedAt='2026-09-30';},(c:ResolutionContext)=>{c.authority.project.status='ARCHIVED';}]){const f=fixture();change(f.context);await assert.rejects(resolveSurveyReviewer(f.repo,db,f.context,input),(e:any)=>e instanceof ConflictError||e instanceof ForbiddenError||e instanceof NotFoundError);assert.deepEqual(f.writes,[]);}
});
test('reuse with missing evidence and additional with complete evidence require deliberate reload',async()=>{
 const f=fixture();await assert.rejects(resolveSurveyReviewer(f.repo,db,f.context,{userId:input.userId,grantId:input.grantId,replacementUserId:input.replacementUserId,expectedSnapshot:token,confirmResolution:true,coverageMode:'reuse'}),ConflictError);assert.deepEqual(f.writes,[]);
 f.context.replacementGrant={...grant,id:id(31),userId:id(12)};f.context.replacementAssignment=assignment;await assert.rejects(resolveSurveyReviewer(f.repo,db,f.context,input),ConflictError);assert.deepEqual(f.writes,[]);
});
test('strict resolution payload rejects invented scope and ambiguous confirmations',()=>{
 for(const body of [{...input,areaId:id(22)},{...input,confirmResolution:false},{...input,confirmAdditionalCoverage:false},{...input,coverageIntent:'AUTO'},{...input,coverageMode:'reuse'},{...input,expectedSnapshot:'bad'},[],null,{...input,grantId:'bad'},{...input,replacementUserId:input.userId}])assert.throws(()=>parseReviewerResolution(body),ValidationError);
 assert.deepEqual(parseReviewerResolution(input),input);
});

test('canonical person IDs cannot bypass the distinct replacement rule',()=>{
 const raw='ABCDEFAB-0000-4000-8000-000000000001';
 assert.throws(()=>parseReviewerResolution({...input,userId:raw,replacementUserId:raw.toLowerCase()}),ValidationError);
 const result=parseReviewerResolution({...input,userId:raw});assert.equal(result.userId,raw.toLowerCase());
});
