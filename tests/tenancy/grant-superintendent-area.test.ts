import assert from 'node:assert/strict';
import test from 'node:test';
import {NextRequest} from 'next/server';
import {grantSuperintendentArea,parseGrantSuperintendentArea,type CoverageGrantContext,type SuperintendentCoverageRepository} from '@/modules/tenancy/application/grant-superintendent-area';
import {handleGetSuperintendentCoverage,handlePostSuperintendentCoverage,type SuperintendentCoverageDeps} from '@/app/api/projects/[projectId]/survey/superintendent-coverage/handler';
import type {AuthContext} from '@/lib/auth';
import type {DbClient,UUID} from '@/shared/types';

const id=(n:number)=>`99020000-0000-4000-8000-${String(n).padStart(12,'0')}` as UUID;
const tenant=id(1),project=id(2),manager=id(3),superintendent=id(4),area=id(5);
const snapshot='a'.repeat(32);
const valid={action:'grant-superintendent-area',superintendentId:superintendent,areaId:area,expectedSnapshot:snapshot,reason:'North Area needs a reporting Superintendent',confirmGrant:true};

function context(overrides:Partial<CoverageGrantContext>={}):CoverageGrantContext{
 return{
  authority:{tenantId:tenant,projectId:project,actorId:manager,actorMembershipId:id(30),actorCompanyId:id(31),actorCompanyType:'GC',actorSessionVersion:1,project:{status:'ACTIVE',crewBuild:'FULL'}},
  subject:{id:superintendent,companyId:id(40),companyType:'GC',role:'SURVEY_SUPERINTENDENT',membershipId:id(41),sessionVersion:1,deactivatedAt:null,accessDisabledAt:null},
  area:{id:area,name:'North Area',levelId:id(50),depth:0,parentId:null,retiredAt:null},
  assignment:null,reviewGrant:null,heldMembershipIds:[id(30),id(41)],...overrides};
}
function fakeRepo(currentSnapshot=snapshot){
 const calls:string[]=[];
 const repo:SuperintendentCoverageRepository={
  review:async()=>{throw new Error('unused');},lockGrantContext:async()=>context(),
  assertNotCancelling:async()=>{calls.push('cancelling');},
  snapshot:async()=>currentSnapshot,
  createAssignment:async(_db,_scope,userId,areaId,assignmentId,at)=>{calls.push('assignment');return{id:assignmentId,userId,areaId,createdAt:at,deactivatedAt:null};},
  createReviewGrant:async(_db,_scope,userId,areaId,actorId,grantId,at)=>{calls.push('grant');return{id:grantId,userId,areaId,responsibility:'SURVEY_REVIEWER',grantedBy:actorId,grantedAt:at,revokedAt:null};},
  recordGrant:async(_db,_context,_input,result)=>{calls.push(`record:${result.createdIndividualAssignment}:${result.createdReviewGrant}`);},
 };
 return{repo,calls};
}
const db={} as DbClient;

test('grant input requires the exact reviewed action, ids, snapshot, reason and explicit confirmation',()=>{
 assert.deepEqual(parseGrantSuperintendentArea({...valid,reason:'  North Area needs a reporting Superintendent  '}),valid);
 for(const bad of [{...valid,confirmGrant:false},{...valid,action:'unlink-superintendent-area'},{...valid,extra:1},{...valid,areaId:'north'},{...valid,expectedSnapshot:'stale'},{...valid,reason:'too short'},{...valid,reason:'x'.repeat(1001)},null,[]]){
  assert.throws(()=>parseGrantSuperintendentArea(bad),{type:'ValidationError'},JSON.stringify(bad));
 }
});

test('fresh grant creates both halves of coverage and records one event',async()=>{
 const {repo,calls}=fakeRepo();
 const result=await grantSuperintendentArea(repo,db,context(),parseGrantSuperintendentArea(valid));
 assert.equal(result.createdIndividualAssignment,true);assert.equal(result.createdReviewGrant,true);assert.equal(result.areaId,area);
 assert.deepEqual(calls,['cancelling','assignment','grant','record:true:true']);
});

test('an existing half is reused, never duplicated',async()=>{
 const {repo,calls}=fakeRepo();
 const existing={id:id(60),userId:superintendent,areaId:area,createdAt:'2026-10-01',deactivatedAt:null};
 const result=await grantSuperintendentArea(repo,db,context({assignment:existing}),parseGrantSuperintendentArea(valid));
 assert.equal(result.assignmentId,existing.id);assert.equal(result.createdIndividualAssignment,false);
 assert.deepEqual(calls,['cancelling','grant','record:false:true']);
});

test('refusals: complete coverage, stale review, ineligible subject, non top-level Area, uneditable project',async()=>{
 const input=parseGrantSuperintendentArea(valid);
 const grant={id:id(61),userId:superintendent,areaId:area,responsibility:'SURVEY_REVIEWER',grantedBy:manager,grantedAt:'2026-10-01',revokedAt:null};
 const assignment={id:id(60),userId:superintendent,areaId:area,createdAt:'2026-10-01',deactivatedAt:null};
 await assert.rejects(grantSuperintendentArea(fakeRepo().repo,db,context({assignment,reviewGrant:grant}),input),{type:'ConflictError',code:'ALREADY_COVERED'});
 await assert.rejects(grantSuperintendentArea(fakeRepo('b'.repeat(32)).repo,db,context(),input),{type:'ConflictError',code:'STALE_SUPERINTENDENT_COVERAGE'});
 for(const subject of [{role:'PARTY_CHIEF' as const},{deactivatedAt:'2026-10-01'},{accessDisabledAt:'2026-10-01'},{companyType:'SUBCONTRACTOR'},{membershipId:null}]){
  await assert.rejects(grantSuperintendentArea(fakeRepo().repo,db,context({subject:{...context().subject,...subject}}),input),{type:'ConflictError'},JSON.stringify(subject));
 }
 for(const where of [{depth:1},{parentId:id(70)},{retiredAt:'2026-10-01'}]){
  await assert.rejects(grantSuperintendentArea(fakeRepo().repo,db,context({area:{...context().area,...where}}),input),{type:'ConflictError'},JSON.stringify(where));
 }
 for(const projectState of [{status:'ARCHIVED' as const,crewBuild:'FULL' as const},{status:'ACTIVE' as const,crewBuild:'MEDIUM' as const}]){
  const {repo,calls}=fakeRepo();
  await assert.rejects(grantSuperintendentArea(repo,db,context({authority:{...context().authority,project:projectState}}),input),{type:'ConflictError'});
  assert.deepEqual(calls,[],'no write or lifecycle read after an uneditable project refusal');
 }
});

const auth:AuthContext={userId:manager,tenantId:tenant,sessionVersion:1,role:'SURVEY_MANAGER'} as unknown as AuthContext;
function handlerDeps(order:string[],overrides:Partial<SuperintendentCoverageDeps>={}):SuperintendentCoverageDeps{
 const fakeDb={query:async(sql:string)=>{
  if(sql.includes('pg_current_xact_id'))return{rows:[{transaction_id:String(order.length)}]};
  if(sql.includes('FROM tenants')){order.push(sql.includes('FOR UPDATE')?'tenant:EXCLUSIVE':'tenant:SHARED');return{rows:[{id:tenant}]};}
  return{rows:[]};
 }} as unknown as DbClient;
 const {repo}=fakeRepo();
 return{
  requireAuth:(async()=>auth) as unknown as SuperintendentCoverageDeps['requireAuth'],
  withTransaction:async fn=>fn(fakeDb),
  repo:{...repo,review:async()=>{order.push('review');return{} as never;},lockGrantContext:async()=>{order.push('context');return context();}},
  executeIdempotent:(async(_db:DbClient,meta:{endpoint:string},_input:unknown,mutate:()=>Promise<{status:number;body:unknown}>)=>{order.push(`idempotent:${meta.endpoint}`);return mutate();}) as unknown as SuperintendentCoverageDeps['executeIdempotent'],
  ...overrides};
}
const ctx={params:Promise.resolve({projectId:project})};

test('POST takes the EXCLUSIVE tenant barrier before context, then records through the idempotency ledger',async()=>{
 const order:string[]=[];
 const res=await handlePostSuperintendentCoverage(new NextRequest('http://localhost/api',{method:'POST',body:JSON.stringify(valid),headers:{'Idempotency-Key':'grant-key-0001'}}),ctx,handlerDeps(order));
 assert.equal(res.status,201);assert.equal(res.headers.get('cache-control'),'private, no-store');
 assert.deepEqual(order,['tenant:EXCLUSIVE','context',`idempotent:POST:/api/projects/${project}/survey/superintendent-coverage`]);
 const body=await res.json();assert.equal(body.createdReviewGrant,true);
});

test('POST refuses a missing idempotency key and malformed input before any lock',async()=>{
 const order:string[]=[];
 const noKey=await handlePostSuperintendentCoverage(new NextRequest('http://localhost/api',{method:'POST',body:JSON.stringify(valid)}),ctx,handlerDeps(order));
 assert.equal(noKey.status,400);
 const bad=await handlePostSuperintendentCoverage(new NextRequest('http://localhost/api',{method:'POST',body:JSON.stringify({...valid,confirmGrant:false}),headers:{'Idempotency-Key':'grant-key-0002'}}),ctx,handlerDeps(order));
 assert.equal(bad.status,400);assert.deepEqual(order,[]);
});

test('POST refuses when the session changed after the lifecycle wait',async()=>{
 const order:string[]=[];let reads=0;
 const deps=handlerDeps(order,{requireAuth:(async()=>(++reads>=3?{...auth,sessionVersion:2}:auth)) as unknown as SuperintendentCoverageDeps['requireAuth']});
 const res=await handlePostSuperintendentCoverage(new NextRequest('http://localhost/api',{method:'POST',body:JSON.stringify(valid),headers:{'Idempotency-Key':'grant-key-0003'}}),ctx,deps);
 assert.equal(res.status,401);assert.ok(!order.some(step=>step.startsWith('idempotent')));
});

test('GET review is SHARED, private and accepts only superintendentId',async()=>{
 const order:string[]=[];
 const ok=await handleGetSuperintendentCoverage(new NextRequest(`http://localhost/api?superintendentId=${superintendent}`),ctx,handlerDeps(order));
 assert.equal(ok.status,200);assert.equal(ok.headers.get('cache-control'),'private, no-store');assert.deepEqual(order,['tenant:SHARED','review']);
 const extra=await handleGetSuperintendentCoverage(new NextRequest(`http://localhost/api?superintendentId=${superintendent}&areaId=${area}`),ctx,handlerDeps([]));
 assert.equal(extra.status,400);
 const badId=await handleGetSuperintendentCoverage(new NextRequest('http://localhost/api?superintendentId=nope'),ctx,handlerDeps([]));
 assert.equal(badId.status,400);
});
