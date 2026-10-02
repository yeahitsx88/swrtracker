import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { signToken, requireActiveAuth, sessionTokenHash } from '../../src/lib/auth';
import { getProjectRole } from '../../src/lib/get-project-role';
import { executeIdempotentHttpMutation } from '../../src/lib/idempotency';
import { SurveyStaffingPgRepository } from '../../src/modules/tenancy/infrastructure/survey-staffing.repository';
import { handleGetSurveyStaffing, handlePostSurveyStaffing, type StaffingDeps } from '../../src/app/api/projects/[projectId]/survey/staffing/handler';
import type { DbClient, UUID } from '../../src/shared/types';

// Run the fresh gated survey-teams-postgres.ts fixture first. Never use Sabine.
const id=(n:number)=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}` as UUID;
const tenant=id(1),company=id(4),project=id(700),chief=id(701),candidate=id(702),im=id(703),superA=id(704),superB=id(705),
  area=id(706),uncovered=id(707),level=id(708),manager=id(709),im2=id(710),newIm=id(711),admin=id(712);
async function main(){
  const url=new URL(process.env.DATABASE_URL??'');
  if(process.env.SWR_TEAM_POSTGRES!=='1'||url.hostname!=='127.0.0.1'||url.port!=='15489'||url.pathname!=='/swr_team_isolated')throw Error('Disposable staffing fixture only');
  const pool=new Pool({connectionString:url.href,max:8});let checks=0;
  const transaction=async<T>(fn:(db:DbClient)=>Promise<T>)=>{const db=await pool.connect();try{await db.query('BEGIN');const value=await fn(db);await db.query('COMMIT');return value;}catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}};
  try{
    assert.equal((await pool.query('SELECT name FROM tenants WHERE id=$1',[tenant])).rows[0]?.name,'Team test');
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM projects WHERE id=$1',[project])).rows[0].n,0,'Fresh fixture required');
    await pool.query(`INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,'Staffing safety fixture','ACTIVE','FULL')`,[project,tenant]);
    for(const [user,role] of [[chief,'PARTY_CHIEF'],[candidate,'REQUESTER'],[im,'INSTRUMENT_MAN'],[superA,'SURVEY_SUPERINTENDENT'],[superB,'SURVEY_SUPERINTENDENT'],[manager,'SURVEY_MANAGER'],[im2,'INSTRUMENT_MAN'],[newIm,'REQUESTER'],[admin,'PROJECT_ADMIN']]){
      await pool.query(`INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,$5,'not-a-login-hash')`,[user,tenant,company,`${user}@example.test`,`Safety ${role}`]);
      await pool.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)',[project,user,role]);
    }
    await pool.query(`INSERT INTO aor_levels(id,tenant_id,project_id,depth,label) VALUES($1,$2,$3,0,'Area')`,[level,tenant,project]);
    for(const node of [area,uncovered])await pool.query(`INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,name,code) VALUES($1,$2,$3,$4,$5,$6)`,[node,tenant,project,level,`Safety ${node===area?'covered':'uncovered'}`,node===area?'C':'U']);
    for(const user of [superA,superB])await pool.query('INSERT INTO aor_assignments(tenant_id,project_id,user_id,aor_node_id) VALUES($1,$2,$3,$4)',[tenant,project,user,area]);
    const repo=new SurveyStaffingPgRepository();
    const deps:StaffingDeps={repo,executeIdempotent:executeIdempotentHttpMutation,getProjectRole,withTransaction:transaction,requireAuth:(req:NextRequest)=>requireActiveAuth(req,pool)};
    const ctx={params:Promise.resolve({projectId:project})};let bearer=signToken(manager,tenant);
    const request=(method:string,value?:unknown,key=randomUUID(),token=bearer,resource=project,query='')=>new NextRequest(`http://localhost/api/projects/${resource}/survey/staffing${query}`,{
      method,headers:{cookie:`swr_session=${token}`,'content-type':'application/json','Idempotency-Key':key},...(value===undefined?{}:{body:JSON.stringify(value)})});
    const checked=async(response:Promise<Response>,status:number)=>{const res=await response;const body=await res.json();assert.equal(res.status,status,JSON.stringify(body));checks++;return body;};
    const snapshot=async()=> (await checked(handleGetSurveyStaffing(request('GET',undefined,undefined,bearer,project,'?mode=snapshot'),ctx,deps),200)).snapshotToken as string;
    const post=(value:unknown,key=randomUUID(),token=bearer,context=ctx)=>handlePostSurveyStaffing(request('POST',value,key,token),context,deps);
    const base={partyChiefId:chief,areaId:area,superintendentId:superA,instrumentManIds:[im],confirmRoleChanges:true};
    const eventCount=async()=>Number((await pool.query('SELECT COUNT(*) AS n FROM survey_staffing_events WHERE tenant_id=$1 AND project_id=$2',[tenant,project])).rows[0].n);
    const state=async()=>({snapshot:await repo.snapshot(pool,tenant,project),events:await eventCount(),people:(await pool.query(`SELECT u.id,u.session_version,pm.role FROM users u JOIN project_memberships pm ON pm.user_id=u.id WHERE u.tenant_id=$1 AND pm.project_id=$2 ORDER BY u.id`,[tenant,project])).rows});
    const first={...base,expectedSnapshot:await snapshot()},firstKey=randomUUID();
    assert.deepEqual(await checked(post(first,firstKey),200),{success:true,changed:true});
    const afterFirst=await state();assert.equal(afterFirst.events,1);assert.notEqual(afterFirst.snapshot,first.expectedSnapshot);
    assert.deepEqual(await checked(post(first,firstKey),200),{success:true,changed:true});assert.deepEqual(await state(),afterFirst);
    await checked(post({...first,instrumentManIds:[]},firstKey),409);assert.deepEqual(await state(),afterFirst);
    assert.equal((await checked(post(first),409)).error.code,'STALE_STAFFING');assert.deepEqual(await state(),afterFirst);
    // A fresh valid token with an omitted IM must not detach the existing roster.
    assert.deepEqual(await checked(post({...base,expectedSnapshot:await snapshot(),instrumentManIds:[]}),200),{success:true,changed:false});
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM crew_rosters WHERE project_id=$1 AND deactivated_at IS NULL',[project])).rows[0].n,1);checks++;
    const details=await checked(handleGetSurveyStaffing(request('GET',undefined,undefined,bearer,project,`?partyChiefId=${chief}&limit=10`),ctx,deps),200);
    assert.equal(details.staffing.snapshotToken,await repo.snapshot(pool,tenant,project));
    const page=await checked(handleGetSurveyStaffing(request('GET',undefined,undefined,bearer,project,`?partyChiefId=${chief}&limit=25&search=no-match`),ctx,deps),200);
    assert.equal(page.staffing.snapshotToken,details.staffing.snapshotToken);assert.equal(page.staffing.instrumentManTotal,1);
    // Two different commands from the same displayed state: one wins, one conflicts.
    const raceToken=await snapshot(),beforeRace=await eventCount();
    const race=await Promise.all([post({...base,expectedSnapshot:raceToken,superintendentId:superB}),post({...base,expectedSnapshot:raceToken,instrumentManIds:[im,im2]})]);
    assert.deepEqual(race.map(res=>res.status).sort(),[200,409]);assert.equal(await eventCount(),beforeRace+1);checks++;
    // Same command/key races return one committed result, never duplicate an event.
    const duplicate={...base,expectedSnapshot:await snapshot(),instrumentManIds:[im,im2],superintendentId:superB},duplicateKey=randomUUID(),beforeDup=await eventCount();
    const same=await Promise.all([post(duplicate,duplicateKey),post(duplicate,duplicateKey)]);
    assert.deepEqual(same.map(res=>res.status),[200,200]);assert.deepEqual(await same[0].json(),await same[1].json());assert.equal(await eventCount(),beforeDup+1);checks++;
    // Replaying an earlier save must not restore its former reporting link.
    await checked(post(first,firstKey),200);assert.equal((await pool.query('SELECT superintendent_id FROM survey_reporting_links WHERE project_id=$1 AND party_chief_id=$2 AND deactivated_at IS NULL',[project,chief])).rows[0].superintendent_id,superB);
    const beforeFail=await state(),failureKey=randomUUID(),promotion={...base,expectedSnapshot:beforeFail.snapshot!,partyChiefId:candidate,instrumentManIds:[newIm]};
    const failing=new SurveyStaffingPgRepository();failing.record=async()=>{throw Error('Injected staffing audit failure');};
    await checked(handlePostSurveyStaffing(request('POST',promotion,failureKey),ctx,{...deps,repo:failing}),500);
    assert.deepEqual(await state(),beforeFail);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM api_idempotency WHERE tenant_id=$1 AND actor_id=$2 AND idempotency_key=$3',[tenant,manager,failureKey])).rows[0].n,0,'Failed save must roll back its ledger claim');checks++;
    await checked(post(promotion,failureKey),200);
    const promoted=(await state()).people;assert.equal(promoted.find(p=>p.id===candidate)?.role,'PARTY_CHIEF');assert.equal(promoted.find(p=>p.id===newIm)?.role,'INSTRUMENT_MAN');
    assert.equal(promoted.find(p=>p.id===candidate)?.session_version,2);assert.equal(promoted.find(p=>p.id===newIm)?.session_version,2);
    // New snapshot hashes capture non-staffing-command changes too.
    for(const mutation of [
      ()=>pool.query('UPDATE aor_nodes SET retired_at=NOW() WHERE id=$1',[uncovered]),
      ()=>pool.query('UPDATE users SET session_version=session_version+1 WHERE id=$1',[im2]),
      ()=>pool.query('UPDATE aor_assignments SET deactivated_at=NOW() WHERE project_id=$1 AND user_id=$2',[project,superA]),
    ]){const old=await snapshot();await mutation();assert.equal((await checked(post({...base,expectedSnapshot:old}),409)).error.code,'STALE_STAFFING');}
    await pool.query('UPDATE aor_nodes SET retired_at=NULL WHERE id=$1',[uncovered]);
    await pool.query('UPDATE aor_assignments SET deactivated_at=NULL WHERE project_id=$1 AND user_id=$2',[project,superA]);
    for(const patch of [{areaId:id(14)},{partyChiefId:id(16)},{instrumentManIds:[id(8)]},{instrumentManIds:[admin]},{instrumentManIds:[im,im]},{areaId:uncovered}]){
      const before=await state();const response=await post({...base,...patch,expectedSnapshot:before.snapshot});assert.ok([400,403,409].includes(response.status),await response.text());assert.deepEqual(await state(),before);checks++;
    }
    const valid={...base,expectedSnapshot:await snapshot()},key=randomUUID();await checked(post(valid,key),200);
    await checked(post(valid,key,signToken(chief,tenant)),403);await checked(post(valid,key,signToken(id(13),id(11))),403);
    await checked(post(valid,key,bearer,{params:Promise.resolve({projectId:id(10)})}),403);
    assert.equal(await repo.snapshot(pool,id(11),project),null);checks++;
    await pool.query(`UPDATE project_memberships SET role='VIEWER' WHERE project_id=$1 AND user_id=$2`,[project,manager]);await checked(post(valid,key),403);
    await pool.query(`UPDATE project_memberships SET role='SURVEY_MANAGER' WHERE project_id=$1 AND user_id=$2`,[project,manager]);
    await pool.query('UPDATE users SET deactivated_at=NOW(),deactivated_by=id WHERE id=$1',[manager]);await checked(post(valid,key),401);await pool.query('UPDATE users SET deactivated_at=NULL,deactivated_by=NULL WHERE id=$1',[manager]);
    await pool.query('INSERT INTO revoked_auth_sessions(tenant_id,user_id,token_hash,expires_at) VALUES($1,$2,$3,NOW()+interval \'1 hour\')',[tenant,manager,sessionTokenHash(bearer)]);await checked(post(valid,key),401);bearer=signToken(manager,tenant);
    await pool.query('UPDATE users SET session_version=2 WHERE id=$1',[manager]);await checked(post(valid,key),401);bearer=signToken(manager,tenant,2);
    await pool.query(`UPDATE projects SET status='ARCHIVED' WHERE id=$1`,[project]);await checked(post(valid,key),409);
    await checked(handleGetSurveyStaffing(request('GET',undefined,undefined,bearer,project,`?partyChiefId=${chief}`),ctx,deps),200);
    await pool.query(`UPDATE projects SET status='ACTIVE' WHERE id=$1`,[project]);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM tickets WHERE project_id=$1',[project])).rows[0].n,0);
    console.log(`Staffing safety PostgreSQL/handler checks passed: ${checks}`);
  }finally{await pool.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
