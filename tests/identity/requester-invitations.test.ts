import test from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server';
import {ConflictError,ForbiddenError} from '@/shared/errors';
import {issueRequesterInvitation,type RequesterInvitationWriter} from '@/modules/identity/application/requester-invitations';
import {CompanyAccessRepository} from '@/modules/identity/infrastructure/company-access.repository';
import {handleGetRequesterInvites,handlePostRequesterInvite,type RequesterInviteRouteDeps} from '@/app/api/projects/[projectId]/invites/handler';
import {handlePostRegister} from '@/app/api/auth/register/handler';
import type {IUserRepository} from '@/modules/identity/application/ports';
import type {DbClient,UUID} from '@/shared/types';

const tenantId='10000000-0000-4000-8000-000000000001' as UUID;
const projectId='10000000-0000-4000-8000-000000000002' as UUID;
const companyId='10000000-0000-4000-8000-000000000003' as UUID;
const actorId='10000000-0000-4000-8000-000000000004' as UUID;
const input={tenantId,projectId,companyId,email:' Terry@dot-sim.example.invalid ',invitedBy:actorId};
const db:DbClient={query:async<T extends object>()=>({rows:[] as T[]})};
function writer(overrides:Partial<RequesterInvitationWriter>={}):RequesterInvitationWriter{
 return {isProjectOpen:async()=>true,isRequesterCompanyAvailable:async()=>true,hasRegisteredEmail:async()=>false,hasPendingRequesterInvite:async()=>false,createRequesterInvite:async()=>({token:actorId}),...overrides};
}
test('employee invitation binds normalized email, tenant, company, project and fixed Requester insertion',async()=>{
 let captured:Parameters<RequesterInvitationWriter['createRequesterInvite']>[1]|undefined;
 const result=await issueRequesterInvitation(writer({createRequesterInvite:async(_db,value)=>{captured=value;return {token:actorId};}}),db,input);
 assert.equal(result.email,'terry@dot-sim.example.invalid');assert.equal(captured?.companyId,companyId);assert.equal(captured?.projectId,projectId);
 assert.equal(captured?.tenantId,tenantId);assert.ok(captured!.expiresAt.getTime()>Date.now()+6*24*60*60*1000);assert.equal('role' in captured!,false);
});
test('employee invitations reject archived projects, unavailable companies, existing accounts and pending duplicates before insertion',async()=>{
 const cases:Array<[Partial<RequesterInvitationWriter>,string]>=[
  [{isProjectOpen:async()=>false},'ConflictError'],[{isRequesterCompanyAvailable:async()=>false},'ValidationError'],
  [{hasRegisteredEmail:async()=>true},'ConflictError'],[{hasPendingRequesterInvite:async()=>true},'ConflictError'],
 ];
 for(const [change,name] of cases){let inserts=0;await assert.rejects(()=>issueRequesterInvitation(writer({...change,createRequesterInvite:async()=>{inserts++;return {token:actorId};}}),db,input),{name});assert.equal(inserts,0);}
});
test('invalid invitation emails never reach insertion',async()=>{
 for(const email of ['','terry','a@b','a b@example.invalid','a'.repeat(250)+'@example.invalid']) await assert.rejects(()=>issueRequesterInvitation(writer(),db,{...input,email}),{name:'ValidationError'});
});
test('invitation repository SQL requires exact tenant/project association for employees and retains only the subcontractor legacy path',async()=>{
 const calls:Array<{sql:string;params:unknown[]|undefined}>=[];
 const sqlDb:DbClient={query:async<T extends object>(sql:string,params?:unknown[])=>{calls.push({sql,params});return {rows:[{token:actorId,available:true,registered:false,pending:false,open:true}] as T[]};}};
 const repo=new CompanyAccessRepository();await repo.createRequesterInvite(sqlDb,{...input,expiresAt:new Date()});await repo.isRequesterCompanyAvailable(sqlDb,tenantId,projectId,companyId);
 await repo.hasRegisteredEmail(sqlDb,tenantId,input.email);await repo.hasPendingRequesterInvite(sqlDb,tenantId,projectId,input.email);
 assert.ok(calls[0]!.sql.includes("'REQUESTER'"));assert.ok(calls[0]!.sql.includes('p.tenant_id = $1'));assert.ok(calls[0]!.sql.includes("p.status <> 'ARCHIVED'"));
 assert.ok(calls[0]!.sql.includes("c.type IN ('GC','OWNER_REP','SUBCONTRACTOR')"));assert.ok(calls[0]!.sql.includes("c.type='SUBCONTRACTOR' AND EXISTS"));
 assert.ok(calls[1]!.sql.includes('pc.tenant_id=$1 AND pc.project_id=$2 AND pc.company_id=c.id'));
 assert.deepEqual(calls[1]!.params,[tenantId,projectId,companyId]);assert.ok(!calls[2]!.sql.includes('deactivated_at'));
 assert.ok(calls[3]!.sql.includes('accepted_at IS NULL AND canceled_at IS NULL AND expires_at>NOW'));
});
function routeFixture(){
 const rows=new Map<string,{request_hash:string;response_status:number|null;response_body:unknown}>();
 const state={authorized:true,open:true,created:0,audits:0,failAudit:false};
 const client:DbClient={query:async<T extends object>(sql:string,params?:unknown[])=>{
  const values=params??[],key=JSON.stringify(values.slice(0,4));let result:object[]=[];
  if(sql.includes('INSERT INTO api_idempotency')){if(!rows.has(key)){rows.set(key,{request_hash:values[4] as string,response_status:null,response_body:null});result=[{idempotency_key:values[3]}];}}
  else if(sql.includes('FROM api_idempotency')){const row=rows.get(key);if(row)result=[row];}
  else if(sql.includes('UPDATE api_idempotency')){const row=rows.get(key)!;row.response_status=values[4] as number;row.response_body=JSON.parse(values[5] as string);}
  return {rows:result as T[]};
 }};
 const repo=new CompanyAccessRepository();
 repo.isProjectOpen=async()=>state.open;repo.isRequesterCompanyAvailable=async()=>true;
 repo.hasRegisteredEmail=async()=>false;repo.hasPendingRequesterInvite=async()=>false;
 repo.createRequesterInvite=async()=>{state.created++;return {token:actorId};};
 repo.listRequesterInvitationOptions=async()=>({projectStatus:'ACTIVE',companies:[{id:companyId,name:'DOT SIM GC',type:'GC'}],pendingInvites:[]});
 const deps:RequesterInviteRouteDeps={db:client,repo,requireAuth:async()=>({tenantId,userId:actorId,sessionVersion:1}),
  authorize:async()=>{if(!state.authorized)throw new ForbiddenError('Project administration required');},
  appendEvent:async(_client,event)=>{assert.equal(event.eventType,'user.invited');assert.equal(event.changes.role,'REQUESTER');assert.equal('token' in event.changes,false);state.audits++;if(state.failAudit)throw new Error('audit failure');return actorId;},
  withTransaction:async(fn,mutation)=>{const snapshot=structuredClone([...rows]),created=state.created,audits=state.audits;
   try{if(mutation)await mutation.authorize(client,mutation.auth);return await fn(client);}catch(error){rows.clear();for(const [key,value] of snapshot)rows.set(key,value);state.created=created;state.audits=audits;throw error;}
  },
 };
 const ctx={params:Promise.resolve({projectId})};
 const request=(body:object={companyId,email:input.email},key:string|null='requester-invite-key')=>new NextRequest('http://localhost/api/projects/'+projectId+'/invites',{method:'POST',headers:{'content-type':'application/json',...(key?{'Idempotency-Key':key}:{})},body:JSON.stringify(body)});
 return {deps,state,ctx,request,rows};
}
test('invitation command replays one invite/audit and rejects changed intent',async()=>{
 const f=routeFixture();assert.equal((await handlePostRequesterInvite(f.request(),f.ctx,f.deps)).status,201);
 assert.equal((await handlePostRequesterInvite(f.request(),f.ctx,f.deps)).status,201);assert.equal(f.state.created,1);assert.equal(f.state.audits,1);
 assert.equal((await handlePostRequesterInvite(f.request({companyId,email:'different@example.invalid'}),f.ctx,f.deps)).status,409);
});
test('current administration and project state are checked before successful invitation replay',async()=>{
 const f=routeFixture();await handlePostRequesterInvite(f.request(),f.ctx,f.deps);f.state.authorized=false;
 assert.equal((await handlePostRequesterInvite(f.request(),f.ctx,f.deps)).status,403);
 assert.equal((await handleGetRequesterInvites(new NextRequest('http://localhost'),f.ctx,f.deps)).status,403);
 f.state.authorized=true;f.state.open=false;assert.equal((await handlePostRequesterInvite(f.request(),f.ctx,f.deps)).status,409);assert.equal(f.state.created,1);
});
test('invitation API refuses role/tenant/project overrides and missing retry keys',async()=>{
 const f=routeFixture();for(const extra of [{role:'TENANT_ADMIN'},{tenantId},{projectId}]) assert.equal((await handlePostRequesterInvite(f.request({companyId,email:input.email,...extra}),f.ctx,f.deps)).status,400);
 assert.equal((await handlePostRequesterInvite(f.request({companyId,email:input.email},null),f.ctx,f.deps)).status,400);assert.equal(f.state.created,0);
});
test('invitation audit failure rolls back insertion and retry ledger in the caller transaction',async()=>{
 const f=routeFixture();f.state.failAudit=true;assert.equal((await handlePostRequesterInvite(f.request(),f.ctx,f.deps)).status,500);
 assert.equal(f.state.created,0);assert.equal(f.state.audits,0);assert.equal(f.rows.size,0);
 f.state.failAudit=false;assert.equal((await handlePostRequesterInvite(f.request(),f.ctx,f.deps)).status,201);assert.equal(f.state.created,1);
});
test('invitation options expose associated companies and no token',async()=>{
 const f=routeFixture();const response=await handleGetRequesterInvites(new NextRequest('http://localhost'),f.ctx,f.deps);assert.equal(response.status,200);
 assert.equal(response.headers.get('cache-control'),'private, no-store');const value=await response.json();assert.equal(value.companies[0].type,'GC');assert.equal('token' in value,false);
});
test('new employee registration derives Requester membership from the bound invite, ignoring claimed elevated role',async()=>{
 let membership:{projectId:UUID;role:string}|undefined,accepted=false;
 const user={id:actorId,tenantId,companyId,email:'terry@dot-sim.example.invalid',name:'DOT SIM Terry Smith',authMethod:'LOCAL' as const,createdAt:new Date()};
 const repo:IUserRepository={findByEmail:async()=>null,findById:async()=>null,isDomainAllowed:async()=>false,isCompanyInTenant:async()=>true,listRegisterableProjectIds:async()=>[],
  findActiveInviteByToken:async()=>({tenantId,projectId,companyId,companyType:'GC',email:user.email,role:'REQUESTER'}),
  saveProjectMembership:async(_db,value)=>{membership=value;},markInviteAccepted:async()=>{accepted=true;},bumpSessionVersion:async()=>{},save:async()=>{}};
 const transactionDb:DbClient={query:async<T extends object>(sql:string)=>({rows:[sql.includes('pg_current_xact_id')?{transaction_id:'invite-register'}:{id:tenantId}] as T[]})};
 const response=await handlePostRegister(new NextRequest('http://localhost/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tenantId,email:user.email,name:user.name,password:'fictional-test-password',inviteToken:actorId,role:'TENANT_ADMIN',projectId:actorId})}),{db:transactionDb,createRepo:()=>repo,createUser:async()=>user,withTransaction:fn=>fn(transactionDb)});
 assert.equal(response.status,201);assert.deepEqual(membership&&{projectId:membership.projectId,role:membership.role},{projectId,role:'REQUESTER'});assert.ok(accepted);
});
