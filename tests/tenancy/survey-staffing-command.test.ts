import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { handleGetSurveyStaffing, handlePostSurveyStaffing, handlePatchSurveyStaffing, type StaffingDeps } from '@/app/api/projects/[projectId]/survey/staffing/handler';
import { SurveyStaffingPgRepository } from '@/modules/tenancy/infrastructure/survey-staffing.repository';
import { executeIdempotentHttpMutation } from '@/lib/idempotency';
import type { DbClient, UUID } from '@/shared/types';
import {UnauthorizedError} from '@/shared/errors';
import type { ProjectRole } from '@/modules/identity/domain/types';

const id=(n:number)=>`30000000-0000-4000-8000-${String(n).padStart(12,'0')}` as UUID;
const tenantId=id(1),projectId=id(2),actorId=id(3),chief=id(4),area=id(5),superintendent=id(6),im=id(7);
const initial='a'.repeat(32),changed='b'.repeat(32);
function fixture(){
  let token=initial,authorized=true,role:ProjectRole='SURVEY_MANAGER',archived=false,ledgerCalls=0;
  const writes:string[]=[],lockOrder:UUID[][]=[];
  const ledger=new Map<string,{request_hash:string;response_status:number|null;response_body:unknown}>();
  const db:DbClient={async query<T extends object>(sql:string,params:unknown[]=[]){
    if(sql.includes('pg_current_xact_id'))return {rows:[{transaction_id:'staffing-route'}] as T[]};
    if(sql.includes('FROM tenants'))return {rows:[{id:tenantId}] as T[]};
    ledgerCalls++; const key=JSON.stringify(params.slice(0,4));
    if(sql.startsWith('INSERT INTO api_idempotency')){
      if(ledger.has(key))return {rows:[]};
      ledger.set(key,{request_hash:params[4] as string,response_status:null,response_body:null});
      return {rows:[{idempotency_key:params[3]}] as T[]};
    }
    if(sql.startsWith('SELECT request_hash'))return {rows:[ledger.get(key)!] as T[]};
    if(sql.startsWith('UPDATE api_idempotency')){const row=ledger.get(key)!;row.response_status=params[4] as number;row.response_body=JSON.parse(params[5] as string);return {rows:[]};}
    throw new Error('Unexpected fixture query');
  }};
  const repo=new SurveyStaffingPgRepository();
  repo.lockProject=async()=>({status:archived?'ARCHIVED':'ACTIVE',crewBuild:'FULL'});
  repo.lockManager=async()=>authorized;repo.snapshot=async()=>token;
  repo.lockSubjects=async(_db,_tenant,_project,people)=>{lockOrder.push(people);};
  repo.member=async(_db,_tenant,_project,userId)=>({userId,role:userId===superintendent?'SURVEY_SUPERINTENDENT':userId===chief?'PARTY_CHIEF':'INSTRUMENT_MAN'});
  repo.activeArea=async()=>true;repo.superintendentCoversArea=async()=>true;
  repo.activeAreasForUser=async()=>[];repo.rosterChief=async()=>null;
  repo.addArea=async()=>{writes.push('area');};repo.addInstrumentMan=async()=>{writes.push('roster');};
  repo.setReportingLink=async()=>{writes.push('link');return {changed:true,previousSuperintendentId:null,previousAreaId:null};};
  repo.record=async()=>{writes.push('audit');token=changed;};
  const deps:StaffingDeps={repo,executeIdempotent:executeIdempotentHttpMutation,
    requireAuth:()=>({tenantId,userId:actorId,sessionVersion:1}),getProjectRole:async()=>role,withTransaction:async fn=>fn(db)};
  const input={expectedSnapshot:initial,partyChiefId:chief,areaId:area,superintendentId:superintendent,instrumentManIds:[im],confirmRoleChanges:true};
  const ctx={params:Promise.resolve({projectId})};
  const request=(value:unknown=input,key:string|null='key')=>new NextRequest(`http://localhost/api/projects/${projectId}/survey/staffing`,{
    method:'POST',headers:{'content-type':'application/json',...(key===null?{}:{'Idempotency-Key':key})},body:JSON.stringify(value)});
  return {deps,repo,input,ctx,request,writes,lockOrder,ledgerCalls:()=>ledgerCalls,setToken:(value:string)=>{token=value;},
    setRole:(value:ProjectRole)=>{role=value;},revoke:()=>{authorized=false;},archive:()=>{archived=true;}};
}

test('staffing save and replay use the original snapshot without repeating grants or audit',async()=>{
  const f=fixture();const first=await handlePostSurveyStaffing(f.request(),f.ctx,f.deps);
  assert.equal(first.status,200);assert.deepEqual(await first.json(),{success:true,changed:true});
  const replay=await handlePostSurveyStaffing(f.request(),f.ctx,f.deps);
  assert.equal(replay.status,200);assert.deepEqual(await replay.json(),{success:true,changed:true});
  assert.deepEqual(f.writes,['area','link','roster','audit']);assert.deepEqual(f.lockOrder,[[chief,superintendent,im].sort()]);
});
test('a fresh retry key with an obsolete snapshot rejects before staffing writes',async()=>{
  const f=fixture();f.setToken(changed);
  const response=await handlePostSurveyStaffing(f.request(),f.ctx,f.deps);
  assert.equal(response.status,409);assert.equal((await response.json()).error.code,'STALE_STAFFING');assert.deepEqual(f.writes,[]);
});
test('staffing retry key cannot be reused with a changed command',async()=>{
  const f=fixture();assert.equal((await handlePostSurveyStaffing(f.request(),f.ctx,f.deps)).status,200);
  const response=await handlePostSurveyStaffing(f.request({...f.input,instrumentManIds:[]}),f.ctx,f.deps);
  assert.equal(response.status,409);assert.equal((await response.json()).error.code,'IDEMPOTENCY_KEY_REUSE_MISMATCH');assert.equal(f.writes.length,4);
});
test('revoked Manager authority, role and archived project prevent cached replay access',async()=>{
  for(const denial of ['revoke','role','archive'] as const){
    const f=fixture();assert.equal((await handlePostSurveyStaffing(f.request(),f.ctx,f.deps)).status,200);
    const before=f.ledgerCalls();if(denial==='revoke')f.revoke();else if(denial==='role')f.setRole('REQUESTER');else f.archive();
    assert.equal((await handlePostSurveyStaffing(f.request(),f.ctx,f.deps)).status,denial==='archive'?409:403);
    assert.equal(f.ledgerCalls(),before);assert.equal(f.writes.length,4);
  }
});
test('staffing rejects missing keys, missing/malformed snapshots, unknown fields and invalid JSON',async()=>{
  const f=fixture();assert.equal((await handlePostSurveyStaffing(f.request(f.input,null),f.ctx,f.deps)).status,400);
  for(const value of [{...f.input,expectedSnapshot:undefined},{...f.input,expectedSnapshot:'bad'},{...f.input,replaceRoster:true},[]]){
    assert.equal((await handlePostSurveyStaffing(f.request(value),f.ctx,f.deps)).status,400);
  }
  const malformed=new NextRequest(`http://localhost/api/projects/${projectId}/survey/staffing`,{method:'POST',body:'{'});
  assert.equal((await handlePostSurveyStaffing(malformed,f.ctx,f.deps)).status,400);
  assert.equal(f.ledgerCalls(),0);assert.deepEqual(f.writes,[]);
});
test('snapshot mode is an authorized bounded token read, never a staffing mutation',async()=>{
  const f=fixture();const req=(suffix='')=>new NextRequest(`http://localhost/api/projects/${projectId}/survey/staffing?mode=snapshot${suffix}`);
  const response=await handleGetSurveyStaffing(req(),f.ctx,f.deps);
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{snapshotToken:initial});
  for(const suffix of ['&mode=snapshot','&partyChiefId='+chief,'&search=x'])assert.equal((await handleGetSurveyStaffing(req(suffix),f.ctx,f.deps)).status,400);
  f.revoke();assert.equal((await handleGetSurveyStaffing(req(),f.ctx,f.deps)).status,403);assert.deepEqual(f.writes,[]);assert.equal(f.ledgerCalls(),0);
});

test('a staffing change during eligibility validation is caught before the first write',async()=>{
  const f=fixture();f.deps.repo.activeArea=async()=>{f.setToken(changed);return true;};
  const response=await handlePostSurveyStaffing(f.request(),f.ctx,f.deps);
  assert.equal(response.status,409);assert.equal((await response.json()).error.code,'STALE_STAFFING');assert.deepEqual(f.writes,[]);
});

function unlinkFixture(kind: 'roster'|'area'|'reporting' = 'roster') {
  const f=fixture(), linkId=id(8);
  f.repo.lockLink=async()=>({id:linkId,partyChiefId:chief,instrumentManId:im,areaId:area,departmentId:null});
  f.repo.hasDependentReporting=async()=>false;
  f.repo.deactivateLink=async()=>{f.writes.push('unlink');return true;};
  const input={action:'unlink',kind,linkId,partyChiefId:chief,expectedSnapshot:initial,confirmUnlink:true};
  const patch=(value:unknown=input,key:string|null='unlink-key')=>handlePatchSurveyStaffing(f.request(value,key),f.ctx,{...f.deps,repo:f.repo});
  return {...f,input,patch};
}
test('targeted unlink retries return the original result with one deactivation and audit',async()=>{
  for(const kind of ['roster','reporting','area'] as const){
    const f=unlinkFixture(kind);assert.equal((await f.patch()).status,200);assert.equal((await f.patch()).status,200);
    assert.deepEqual(f.writes,['unlink','audit']);assert.deepEqual(f.lockOrder,[[chief]]);
    assert.equal((await f.patch({...f.input,linkId:id(9)})).status,409);
    assert.equal((await f.patch(f.input,'new-key')).status,409);
  }
});
test('unlink requires deliberate confirmation, exact supported fields and valid identities',async()=>{
  const f=unlinkFixture();
  for(const patch of [{confirmUnlink:false},{expectedSnapshot:undefined},{linkId:'bad'},{kind:'responsibility'},{departmentId:id(9)},{action:'clear-all'}]){
    assert.equal((await f.patch({...f.input,...patch})).status,400);
  }
  assert.equal((await f.patch(f.input,null)).status,400);assert.equal(f.ledgerCalls(),0);assert.deepEqual(f.writes,[]);
});
test('unlink guards current Chief, exact target, department scope and dependent reporting before writes',async()=>{
  for(const denial of ['chief','missing','department','dependent','changed','write-race'] as const){
    const f=unlinkFixture('area');
    if(denial==='chief')f.repo.member=async()=>null;
    if(denial==='missing')f.repo.lockLink=async()=>null;
    if(denial==='department')f.repo.lockLink=async()=>({id:id(8),partyChiefId:chief,areaId:area,departmentId:id(9)});
    if(denial==='dependent')f.repo.hasDependentReporting=async()=>true;
    if(denial==='changed')f.repo.hasDependentReporting=async()=>{f.setToken(changed);return false;};
    if(denial==='write-race')f.repo.deactivateLink=async()=>false;
    assert.equal((await f.patch()).status,denial==='chief'?400:denial==='missing'?404:409);assert.deepEqual(f.writes,[]);
  }
});
test('cached unlink is denied after Manager role/session loss or project closure',async()=>{
  for(const denial of ['role','revoke','archive'] as const){
    const f=unlinkFixture();assert.equal((await f.patch()).status,200);const before=f.ledgerCalls();
    if(denial==='role')f.setRole('SURVEY_SUPERINTENDENT');else if(denial==='revoke')f.revoke();else f.archive();
    assert.equal((await f.patch()).status,denial==='archive'?409:403);assert.equal(f.ledgerCalls(),before);assert.deepEqual(f.writes,['unlink','audit']);
  }
});

test('staffing post-wait logout refusal occurs before role, staffing or saved ledger access',async()=>{
 const f=fixture();let domain=0;
 f.deps.requireAuth=async(_req,db)=>{
   if(db)throw new UnauthorizedError('Logged out during lifecycle wait');
   return {tenantId,userId:actorId,sessionVersion:1};
 };
 f.deps.getProjectRole=async()=>{domain++;return 'SURVEY_MANAGER';};
 assert.equal((await handlePostSurveyStaffing(f.request(),f.ctx,f.deps)).status,401);
 assert.equal(domain,0);assert.equal(f.ledgerCalls(),0);assert.deepEqual(f.writes,[]);
});
