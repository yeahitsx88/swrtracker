import test from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server';
import {handleGetProtectedObligations,handlePostProtectedObligations,type ProtectedObligationsDeps} from '../../src/app/api/projects/[projectId]/survey/protected-obligations/handler';
import {ForbiddenError,UnauthorizedError} from '../../src/shared/errors';
import type {DbClient,UUID} from '../../src/shared/types';
const id='98000000-0000-4000-8000-000000000001' as UUID;
const ctx={params:Promise.resolve({projectId:id})};
const request=(q='mode=personnel')=>new NextRequest('http://localhost/api/projects/'+id+'/survey/protected-obligations?'+q);
const authority={tenantId:id,projectId:id,branch:'SURVEY_MANAGER' as const,actorId:id,actorMembershipId:id,actorCompanyId:id,actorCompanyType:'GC',actorSessionVersion:1,project:{status:'ACTIVE' as const,crewBuild:'FULL' as const}};
function deps():ProtectedObligationsDeps{return{requireAuth:async()=>({tenantId:id,userId:id,sessionVersion:1}),withTransaction:async fn=>fn({query:async<T extends object>(sql:string)=>({rows:[sql.includes('pg_current_xact_id')?{transaction_id:'protected-route'}:{id}] as T[]})}),executeIdempotent:async(_db,_scope,_payload,mutation)=>({...await mutation(),replayed:false}),repo:{readAuthority:async()=>authority,readPage:async()=>({mode:'personnel',project:authority.project,personnel:{data:[],total:0,limit:25,offset:0}})} as unknown as ProtectedObligationsDeps['repo']};}
test('scoped GET is private/no-store and returns bounded contract',async()=>{
 const response=await handleGetProtectedObligations(request(),ctx,deps());assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal((await response.json()).mode,'personnel');
});
test('bad duplicate and unknown filters fail without repository discovery',async()=>{
 for(const q of ['mode=personnel&mode=personnel','mode=personnel&unknown=yes','mode=obligations']){const d=deps();d.repo.readAuthority=async()=>{throw Error('must not query');};const response=await handleGetProtectedObligations(request(q),ctx,d);assert.equal(response.status,400);assert.equal(response.headers.get('cache-control'),'private, no-store');}
});
test('scoped GET preserves unauthorized and forbidden statuses with private errors',async()=>{
 for(const [error,status] of [[new UnauthorizedError(),401],[new ForbiddenError(),403]] as const){const d=deps();d.requireAuth=async()=>{throw error;};const response=await handleGetProtectedObligations(request(),ctx,d);assert.equal(response.status,status);assert.equal(response.headers.get('cache-control'),'private, no-store');}
});

const payload={userId:id,grantId:id,replacementUserId:'98000000-0000-4000-8000-000000000002',expectedSnapshot:'a'.repeat(32),confirmResolution:true,coverageMode:'reuse'};
const post=(value:unknown=payload,key='stable-key')=>new NextRequest('http://localhost/api/projects/'+id+'/survey/protected-obligations',{method:'POST',headers:{'content-type':'application/json','idempotency-key':key},body:JSON.stringify(value)});
test('POST refuses unknown fields and missing key before locking or ledger',async()=>{
 const d=deps();for(const req of [post({...payload,areaId:id}),post(payload,'')]){const response=await handlePostProtectedObligations(req,ctx,d);assert.equal(response.status,400);assert.equal(response.headers.get('cache-control'),'private, no-store');}
});
test('POST rechecks the bearer after lock waits and before historical ledger replay',async()=>{
 const d=deps();let calls=0,ledger=false;
 d.requireAuth=async(_req,transactionDb)=>{calls++;if(transactionDb)throw new UnauthorizedError('Logged out');return{userId:id,tenantId:id,sessionVersion:1};};
 d.repo.lockResolutionContext=async()=>({authority} as any);
 d.executeIdempotent=async()=>{ledger=true;throw Error('Unexpected ledger call');};
 const response=await handlePostProtectedObligations(post(),ctx,d);assert.equal(response.status,401);assert.equal(calls,2);assert.equal(ledger,false);
});
test('POST current authority refusal occurs before guessed subject or historical response',async()=>{
 const d=deps();let ledger=false;d.repo.lockResolutionContext=async()=>{throw new ForbiddenError();};d.executeIdempotent=async()=>{ledger=true;throw Error('Unexpected ledger call');};
 const response=await handlePostProtectedObligations(post(),ctx,d);assert.equal(response.status,403);assert.equal(ledger,false);
});

test('protected handover locks tenant and checks current bearer before any domain lock',async()=>{
 const d=deps(),steps:string[]=[];
 const db:DbClient={query:async<T extends object>(sql:string)=>{
   steps.push(sql.includes('FROM tenants')?'tenant':'transaction');
   return {rows:[sql.includes('pg_current_xact_id')?{transaction_id:'protected-order'}:{id}] as T[]};
 }};
 d.withTransaction=async fn=>fn(db);
 d.requireAuth=async(_req,currentDb)=>{if(currentDb)steps.push('bearer');return {tenantId:id,userId:id,sessionVersion:1};};
 d.repo.lockResolutionContext=async()=>{steps.push('domain');throw new ForbiddenError();};
 assert.equal((await handlePostProtectedObligations(post(),ctx,d)).status,403);
 assert.ok(steps.includes('tenant'));assert.ok(steps.indexOf('tenant')<steps.indexOf('bearer'));
 assert.ok(steps.indexOf('bearer')<steps.indexOf('domain'));
});
