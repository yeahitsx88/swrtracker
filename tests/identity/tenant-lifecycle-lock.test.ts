import test from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server';
import {acquireTenantLifecycleLock,revalidateMutationAuth} from '../../src/lib/tenant-lifecycle-lock';
import {signToken} from '../../src/lib/auth';
import type {DbClient,UUID} from '../../src/shared/types';
const tenant='00000000-0000-4000-8000-000000000001' as UUID,user='00000000-0000-4000-8000-000000000002' as UUID;
test('lifecycle modes take the tenant row before domain work and never upgrade',async()=>{
 const calls:string[]=[];
 const db:DbClient={query:async<T extends object>(sql:string,params?:unknown[])=>{
  calls.push(sql);
  if(sql.includes('FROM tenants'))assert.deepEqual(params,[tenant]);
  return{rows:[sql.includes('transaction_id')?{transaction_id:'1'}:{id:tenant}] as T[]};
 }};
 await acquireTenantLifecycleLock(db,tenant,'SHARED');
 assert.ok(calls.some(sql=>sql.includes('FROM tenants')&&sql.includes('FOR SHARE')));
 await assert.rejects(acquireTenantLifecycleLock(db,tenant,'EXCLUSIVE'),/upgrade/i);
 const next:DbClient={query:async<T extends object>(sql:string)=>{calls.push(sql);return{rows:[{transaction_id:'2',id:tenant}] as T[]};}};
 await acquireTenantLifecycleLock(next,tenant,'EXCLUSIVE');
 assert.ok(calls.some(sql=>sql.includes('FROM tenants')&&sql.includes('FOR UPDATE')));
});
test('mutation revalidation rejects a revoked cookie after a lock wait',async()=>{
 const previous=process.env.JWT_SECRET;process.env.JWT_SECRET='phase5-wait-revalidation-secret';
 try{
  const req=new NextRequest('http://localhost/api/projects',{headers:{cookie:'swr_session='+signToken(user,tenant,1)}});
  const db:DbClient={query:async<T extends object>()=>({rows:[{revoked:true}] as T[]})};
  await assert.rejects(revalidateMutationAuth(db,req,{tenantId:tenant,userId:user,sessionVersion:1}),{type:'UnauthorizedError'});
 }finally{if(previous===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previous;}
});
test('a mutation cannot substitute another signed identity for its original actor',async()=>{
 const previous=process.env.JWT_SECRET;process.env.JWT_SECRET='phase5-identity-revalidation-secret';
 try{
  const req=new NextRequest('http://localhost/api/projects',{headers:{cookie:'swr_session='+signToken(user,tenant,1)}});
  const db:DbClient={query:async<T extends object>(sql:string)=>({rows:[sql.includes('revoked_auth_sessions')?{revoked:false}:{session_version:1,deactivated_at:null}] as T[]})};
  await assert.rejects(revalidateMutationAuth(db,req,{tenantId:tenant,userId:tenant,sessionVersion:1}),{type:'UnauthorizedError'});
 }finally{if(previous===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previous;}
});