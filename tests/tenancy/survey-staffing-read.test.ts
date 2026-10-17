import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { readSurveyStaffing, type SurveyStaffingDetail, type SurveyStaffingReadRepository } from '@/modules/tenancy/application/read-survey-staffing';
import { SurveyStaffingPgRepository } from '@/modules/tenancy/infrastructure/survey-staffing.repository';
import { handleGetSurveyStaffing, type StaffingDeps } from '@/app/api/projects/[projectId]/survey/staffing/handler';
import type { DbClient, UUID } from '@/shared/types';
import { executeIdempotentHttpMutation } from '@/lib/idempotency';

const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}` as UUID;
const tenantId=id(1),projectId=id(2),partyChiefId=id(3),actorId=id(4);
const query={search:'',limit:10,offset:0};
const detail:SurveyStaffingDetail={snapshotToken:'a'.repeat(32),partyChief:{userId:partyChiefId,name:'Chief',email:'chief@example.test',role:'PARTY_CHIEF',active:true},
  reporting:null,areas:{data:[],total:0,limit:100,truncated:false},instrumentMen:{data:[],total:0,limit:10,offset:0},instrumentManTotal:0};
const db={} as DbClient;
const params={tenantId,projectId,partyChiefId,actorRole:'SURVEY_MANAGER' as const,query};

test('staffing reads refuse non-Manager roles before repository access',async()=>{
  const repo:SurveyStaffingReadRepository={readStaffing:async()=>{throw new Error('must not query');}};
  for(const actorRole of ['SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN','REQUESTER','PROJECT_ADMIN','VIEWER'] as const){
    await assert.rejects(readSurveyStaffing(repo,db,{...params,actorRole}),{name:'ForbiddenError'});
  }
});
test('staffing reads enforce IDs, bounded pagination and valid search before querying',async()=>{
  const repo:SurveyStaffingReadRepository={readStaffing:async()=>{throw new Error('must not query');}};
  for(const patch of [{partyChiefId:'wrong' as UUID},{projectId:'wrong' as UUID},
    ...[{limit:1},{limit:1000},{offset:-1},{offset:1000001},{offset:0.1},{search:'x'.repeat(121)},{search:'bad\u0000'}].map(value=>({query:{...query,...value}}))]){
    await assert.rejects(readSurveyStaffing(repo,db,{...params,...patch}),{name:'ValidationError'});
  }
});
test('staffing read returns current explicit assignments and refuses a missing active Chief',async()=>{
  const repo:SurveyStaffingReadRepository={readStaffing:async(_db,tenant,project,chief,page)=>{
    assert.deepEqual([tenant,project,chief,page],[tenantId,projectId,partyChiefId,query]);return detail;}};
  assert.deepEqual(await readSurveyStaffing(repo,db,params),detail);
  await assert.rejects(readSurveyStaffing({readStaffing:async()=>null},db,params),{name:'NotFoundError'});
});
test('staffing snapshot SQL bounds related populations and never infers from named teams or tickets',async()=>{
  let calls=0;
  const database:DbClient={async query<T extends object>(sql:string,values:unknown[]=[]){
    calls++;assert.deepEqual(values,[tenantId,projectId,partyChiefId,'%needle%',25,50]);
    assert.ok(sql.includes("pm.role='PARTY_CHIEF'"));assert.ok(sql.includes('cr.tenant_id=$1 AND cr.project_id=$2'));
    assert.ok(sql.includes('rl.tenant_id=$1 AND rl.project_id=$2'));assert.ok(sql.includes('rl.deactivated_at IS NULL'));
    assert.ok(sql.includes('aa.deactivated_at IS NULL'));assert.ok(sql.includes('LIMIT 100'));
    assert.ok(sql.includes('LIMIT $5 OFFSET $6'));assert.ok(sql.includes("'truncated'"));
    assert.ok(!/FOR UPDATE|survey_team|\btickets\b/.test(sql)); assert.ok(sql.includes('snapshot.token'));
    return {rows:[{staffing:detail}] as T[]};}};
  assert.deepEqual(await new SurveyStaffingPgRepository().readStaffing(database,tenantId,projectId,partyChiefId,{search:'needle',limit:25,offset:50}),detail);
  assert.equal(calls,1);
});

function fixture(actorRole:'SURVEY_MANAGER'|'PARTY_CHIEF'='SURVEY_MANAGER'){
  let reads=0,authorizations=0;
  const repo=new SurveyStaffingPgRepository();repo.readStaffing=async()=>{reads++;return detail;};
  const deps:StaffingDeps={repo,requireAuth:()=>({userId:actorId,tenantId,sessionVersion:1}),
    executeIdempotent:executeIdempotentHttpMutation,
    getProjectRole:async()=>{authorizations++;return actorRole;},withTransaction:async fn=>fn(db)};
  const ctx={params:Promise.resolve({projectId})};
  const request=(suffix='')=>new NextRequest(`http://localhost/api/projects/${projectId}/survey/staffing?partyChiefId=${partyChiefId}${suffix}`);
  return {deps,ctx,request,counts:()=>({reads,authorizations})};
}
test('staffing GET maps a Manager snapshot and rejects another role',async()=>{
  const f=fixture();const response=await handleGetSurveyStaffing(f.request('&limit=10'),f.ctx,f.deps);
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{staffing:detail});
  assert.deepEqual(f.counts(),{reads:1,authorizations:1});
  const denied=fixture('PARTY_CHIEF');assert.equal((await handleGetSurveyStaffing(denied.request(),denied.ctx,denied.deps)).status,403);
  assert.equal(denied.counts().reads,0);
});
test('staffing GET rejects malformed, duplicate and forged scope parameters without data reads',async()=>{
  const f=fixture();
  for(const suffix of ['&limit=-10','&limit=1000','&offset=NaN','&actorRole=SURVEY_MANAGER','&limit=10&limit=25','&partyChiefId='+id(9),'&search='+encodeURIComponent('bad\u0000')]){
    assert.equal((await handleGetSurveyStaffing(f.request(suffix),f.ctx,f.deps)).status,400);
  }
  assert.equal((await handleGetSurveyStaffing(f.request(),{params:Promise.resolve({projectId:'wrong'})},f.deps)).status,400);
  assert.equal(f.counts().reads,0);
});
test('staffing GET propagates stale-session denial before any repository read',async()=>{
  const f=fixture();f.deps.requireAuth=async()=>{const {UnauthorizedError}=await import('@/shared/errors');throw new UnauthorizedError('Session expired');};
  assert.equal((await handleGetSurveyStaffing(f.request(),f.ctx,f.deps)).status,401);assert.deepEqual(f.counts(),{reads:0,authorizations:0});
});
