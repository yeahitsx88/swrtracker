import test from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server';
import {signToken} from '@/lib/auth';
import {getPool} from '@/lib/db';
import {withTransaction} from '@/lib/with-transaction';
import type {UUID} from '@/shared/types';
const tenant='00000000-0000-4000-8000-000000000001' as UUID;
const user='00000000-0000-4000-8000-000000000002' as UUID;
test('coordinated transaction authenticates and authorizes after tenant wait, before replay or domain work',async()=>{
  process.env.DATABASE_URL??='postgres://test:test@127.0.0.1:1/test';
  const oldSecret=process.env.JWT_SECRET;process.env.JWT_SECRET='lifecycle-transaction-test';
  const pg=getPool(),connect=pg.connect,calls:string[]=[];
  const client={query:async(sql:string)=>{
    calls.push(sql);
    if(sql.includes('transaction_id'))return {rows:[{transaction_id:'1'}]};
    if(sql.includes('FROM tenants'))return {rows:[{id:tenant}]};
    if(sql.includes('revoked_auth_sessions'))return {rows:[{revoked:false}]};
    if(sql.includes('FROM users'))return {rows:[{session_version:1,deactivated_at:null}]};
    return {rows:[]};
  },release:()=>{calls.push('release');}};
  pg.connect=(async()=>client) as typeof pg.connect;
  try{
    const req=new NextRequest('http://localhost/api/projects',{headers:{cookie:'swr_session='+signToken(user,tenant)}});
    const options={req,auth:{userId:user,tenantId:tenant,sessionVersion:1},mode:'EXCLUSIVE' as const,
      authorize:async()=>{calls.push('authorize');}};
    await withTransaction(async()=>{calls.push('ledger/domain');},options);
    const tenantIndex=calls.findIndex(x=>x.includes('FROM tenants'));
    assert.ok(tenantIndex>calls.indexOf('BEGIN'));
    assert.ok(calls[tenantIndex]!.endsWith('FOR UPDATE'));
    assert.ok(calls.findIndex(x=>x.includes('revoked_auth_sessions'))>tenantIndex);
    assert.ok(calls.indexOf('authorize')>calls.findIndex(x=>x.includes('FROM users')));
    assert.ok(calls.indexOf('ledger/domain')>calls.indexOf('authorize'));
    assert.ok(calls.indexOf('COMMIT')>calls.indexOf('ledger/domain'));
    calls.length=0;
    await assert.rejects(withTransaction(async()=>{calls.push('ledger/domain');},{
      ...options,authorize:async()=>{throw new Error('Current authority removed');},
    }),/authority removed/);
    assert.equal(calls.includes('ledger/domain'),false);
    assert.equal(calls.includes('ROLLBACK'),true);
  }finally{pg.connect=connect;if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;}
});