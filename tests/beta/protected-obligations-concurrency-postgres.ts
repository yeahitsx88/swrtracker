// Real two-session lock acceptance, restricted to the named disposable fixture.
import assert from 'node:assert/strict';
import {Pool,type PoolClient} from 'pg';
import {randomUUID} from 'node:crypto';
import {ProtectedObligationsPgRepository} from '../../src/modules/tenancy/infrastructure/protected-obligations.repository';
import {resolveSurveyReviewer} from '../../src/modules/tenancy/application/resolve-survey-reviewer';
import {executeIdempotentHttpMutation} from '../../src/lib/idempotency';
import {ConflictError,ForbiddenError,NotFoundError,UnauthorizedError} from '../../src/shared/errors';
import {requireSurveyReviewAuthority} from '../../src/lib/survey-review-authority';
import {TenancyRepository} from '../../src/modules/tenancy/infrastructure/tenancy.repository';
import {assignAorUser} from '../../src/modules/tenancy/application/assign-aor-user';
import type {DbClient,UUID} from '../../src/shared/types';
import type {ResolveReviewerInput} from '../../src/modules/tenancy/application/protected-obligations.types';
const id=(n:number)=>`98000000-0000-4000-8000-${String(n).padStart(12,'0')}` as UUID;
const auth={tenantId:id(1),userId:id(10),sessionVersion:1},scope={tenantId:id(1),projectId:id(3)};
const base={userId:id(11),grantId:id(30),replacementUserId:id(12),coverageMode:'reuse' as const,confirmResolution:true as const};
async function main(){
 const url=new URL(process.env.DATABASE_URL??'');assert.equal(process.env.SWR_TEAM_POSTGRES,'1');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15489');assert.equal(url.pathname,'/swr_team_isolated');
 const pg=new Pool({connectionString:url.href,max:5});const repo=new ProtectedObligationsPgRepository();let checks=0,fixtureOwned=false;
 const expect=(a:unknown,b:unknown,message?:string)=>{assert.deepEqual(a,b,message);checks++;};
 const transaction=async(db:PoolClient)=>{await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='6000ms'");};
 // Obtain backend IDs before launching any pending query on that connection.
 const waitForLock=async(waiterPid:number,holderPid:number)=>{
  const deadline=Date.now()+3000;while(Date.now()<deadline){const row=(await pg.query('SELECT $2::int=ANY(pg_blocking_pids($1::int)) AS blocked',[waiterPid,holderPid])).rows[0];if(row.blocked){checks++;return;}await new Promise(r=>setTimeout(r,10));}throw Error('Expected actual two-session lock wait was not observed');
 };
 const reset=async()=>{
  await pg.query('UPDATE project_responsibility_grants SET revoked_at=NULL,revoked_by=NULL WHERE id=ANY($1::uuid[])',[[id(30),id(50)]]);
  await pg.query('UPDATE aor_assignments SET deactivated_at=NULL WHERE id=ANY($1::uuid[])',[[id(51),id(52)]]);
  await pg.query('UPDATE aor_nodes SET retired_at=NULL WHERE id=$1',[id(21)]);
  await pg.query('UPDATE aor_levels SET depth=0 WHERE id=$1',[id(20)]);
  await pg.query("UPDATE users SET session_version=1,deactivated_at=NULL,deactivated_by=NULL,company_id=$2 WHERE id=ANY($1::uuid[])",[[id(10),id(12)],id(2)]);
  await pg.query("UPDATE project_memberships SET role=CASE WHEN user_id=$2 THEN 'SURVEY_MANAGER' ELSE 'SURVEY_SUPERINTENDENT' END WHERE project_id=$1 AND user_id=ANY($3::uuid[])",[id(3),id(10),[id(10),id(12)]]);
  await pg.query("UPDATE companies SET type='GC' WHERE id=$1",[id(2)]);
  await pg.query("DELETE FROM access_grant_events WHERE project_id=$1 AND resolution_evidence->>'kind' IN ('SURVEY_REVIEWER_RESOLUTION','SURVEY_REVIEWER_HANDOVER_GRANT')",[id(3)]);
  await pg.query("DELETE FROM api_idempotency WHERE tenant_id=$1 AND endpoint=$2",[id(1),`POST:/api/projects/${id(3)}/survey/protected-obligations`]);
 };
 const fresh=async(db:DbClient,input:ResolveReviewerInput,key:string)=>{const context=await repo.lockResolutionContext(db,auth,id(3),input);return executeIdempotentHttpMutation(db,{tenantId:id(1),actorId:id(10),endpoint:`POST:/api/projects/${id(3)}/survey/protected-obligations`,idempotencyKey:key},input,async()=>({status:200,body:await resolveSurveyReviewer(repo,db,context,input)}));};
 try{
  expect((await pg.query('SELECT name FROM tenants WHERE id=$1',[id(1)])).rows[0]?.name,'Protected reviewer disposable');
  expect((await pg.query('SELECT count(*)::int AS n FROM access_grant_events WHERE project_id=$1',[id(3)])).rows[0].n,0);
  expect((await pg.query('SELECT count(*)::int AS n FROM project_responsibility_grants WHERE id=$1',[id(50)])).rows[0].n,0);
  expect((await pg.query('SELECT count(*)::int AS n FROM aor_assignments WHERE id=ANY($1::uuid[])',[[id(51),id(52)]])).rows[0].n,0);
  fixtureOwned=true;
  await pg.query("INSERT INTO project_responsibility_grants(id,tenant_id,project_id,user_id,aor_node_id,responsibility,granted_by) VALUES($1,$2,$3,$4,$5,'SURVEY_REVIEWER',$6)",[id(50),id(1),id(3),id(12),id(21),id(14)]);
  await pg.query('INSERT INTO aor_assignments(id,tenant_id,project_id,user_id,aor_node_id) VALUES($1,$2,$3,$4,$5)',[id(51),id(1),id(3),id(12),id(21)]);
  await pg.query('INSERT INTO aor_assignments(id,tenant_id,project_id,user_id,aor_node_id) VALUES($1,$2,$3,$4,$5)',[id(52),id(1),id(3),id(12),id(21)]);
  const mutations=[
   ['witness','UPDATE aor_assignments SET deactivated_at=now() WHERE id=$1',[id(51)]],
   ['duplicate-witness','UPDATE aor_assignments SET deactivated_at=now() WHERE id=$1',[id(52)]],
   ['review-grant','UPDATE project_responsibility_grants SET revoked_at=now(),revoked_by=$2 WHERE id=$1',[id(50),id(14)]],
   ['replacement-role',"UPDATE project_memberships SET role='PARTY_CHIEF' WHERE project_id=$1 AND user_id=$2",[id(3),id(12)]],
   ['replacement-account','UPDATE users SET deactivated_at=now(),deactivated_by=id WHERE id=$1',[id(12)]],
   ['replacement-session','UPDATE users SET session_version=2 WHERE id=$1',[id(12)]],
   ['replacement-company','UPDATE users SET company_id=$2 WHERE id=$1',[id(12),id(8)]],
   ['actor-role',"UPDATE project_memberships SET role='VIEWER' WHERE project_id=$1 AND user_id=$2",[id(3),id(10)]],
   ['actor-session','UPDATE users SET session_version=2 WHERE id=$1',[id(10)]],
   ['actor-company',"UPDATE companies SET type='SUBCONTRACTOR' WHERE id=$1",[id(2)]],
   ['area','UPDATE aor_nodes SET retired_at=now() WHERE id=$1',[id(21)]],
   ['level','UPDATE aor_levels SET depth=1 WHERE id=$1',[id(20)]]
  ] as const;
  for(const [kind,sql,args] of mutations)for(const first of ['resolution','change']){
   await reset();const input={...base,expectedSnapshot:await repo.snapshot(pg,scope,id(11))};
   const a=await pg.connect(),b=await pg.connect();let pending:Promise<unknown>|undefined;
   const aPid=(await a.query('SELECT pg_backend_pid() AS pid')).rows[0].pid,bPid=(await b.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
   try{
    await transaction(a);await transaction(b);
    if(first==='resolution'){
     const context=await repo.lockResolutionContext(a,auth,id(3),input);
     pending=b.query(sql,[...args]).then(()=>b.query('COMMIT')).then(()=>null,error=>error);
     await waitForLock(bPid,aPid);
     const result=await resolveSurveyReviewer(repo,a,context,input);expect(result.createdReviewGrant,false);expect(result.createdIndividualAssignment,false);
     await a.query('COMMIT');const writerError=await pending;if(writerError)throw writerError;
     expect((await pg.query('SELECT count(*)::int AS n FROM access_grant_events WHERE project_id=$1',[id(3)])).rows[0].n,1,kind);
    }else{
     await b.query(sql,[...args]);
     pending=(async()=>{const context=await repo.lockResolutionContext(a,auth,id(3),input);return resolveSurveyReviewer(repo,a,context,input);})().then(result=>result,error=>error);
     await waitForLock(aPid,bPid);await b.query('COMMIT');
     const result=await pending;expect(result instanceof ConflictError||result instanceof ForbiddenError||result instanceof UnauthorizedError||result instanceof NotFoundError,true,`${kind}: ${String(result)}`);
     await a.query('ROLLBACK');expect((await pg.query('SELECT revoked_at FROM project_responsibility_grants WHERE id=$1',[id(30)])).rows[0].revoked_at,null);
     expect((await pg.query('SELECT count(*)::int AS n FROM access_grant_events WHERE project_id=$1',[id(3)])).rows[0].n,0);
    }
   }finally{await a.query('ROLLBACK');await b.query('ROLLBACK');if(pending)await pending;a.release();b.release();}
  }

  for(const sameKey of [true,false]){
   await reset();const a=await pg.connect(),b=await pg.connect();let pending:Promise<unknown>|undefined;
   try{
    const input={...base,expectedSnapshot:await repo.snapshot(pg,scope,id(11))},key=randomUUID();
    const aPid=(await a.query('SELECT pg_backend_pid() AS pid')).rows[0].pid,bPid=(await b.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    await transaction(a);await transaction(b);const first=await fresh(a,input,key);
    pending=fresh(b,input,sameKey?key:randomUUID()).then(value=>value,error=>error);
    await waitForLock(bPid,aPid);await a.query('COMMIT');const second=await pending;
    if(sameKey){expect((second as typeof first).body,first.body);expect((second as typeof first).replayed,true);await b.query('COMMIT');}
    else{expect(second instanceof ConflictError,true);await b.query('ROLLBACK');}
    expect((await pg.query('SELECT count(*)::int AS n FROM access_grant_events WHERE project_id=$1',[id(3)])).rows[0].n,1);
   }finally{await a.query('ROLLBACK');await b.query('ROLLBACK');if(pending)await pending;a.release();b.release();}
  }
  for(const first of ['review','resolution']){
   await reset();const a=await pg.connect(),b=await pg.connect();let pending:Promise<unknown>|undefined;
   try{
    const input={...base,expectedSnapshot:await repo.snapshot(pg,scope,id(11))};const aPid=(await a.query('SELECT pg_backend_pid() AS pid')).rows[0].pid,bPid=(await b.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    await transaction(a);await transaction(b);
    const review=()=>requireSurveyReviewAuthority(b,{...scope,aorNodeId:id(21)},{actorId:id(12),actorRole:'SURVEY_SUPERINTENDENT'});
    if(first==='review'){
     await review();pending=fresh(a,input,randomUUID()).then(value=>value,error=>error);await waitForLock(aPid,bPid);await b.query('COMMIT');const result=await pending;if(result instanceof Error)throw result;await a.query('COMMIT');
    }else{
     const result=await fresh(a,input,randomUUID());expect(result.status,200);pending=review().then(value=>value,error=>error);await waitForLock(bPid,aPid);await a.query('COMMIT');const reviewed=await pending;if(reviewed instanceof Error)throw reviewed;expect((reviewed as {grantId:UUID}).grantId,id(50));await b.query('COMMIT');
    }
   }finally{await a.query('ROLLBACK');await b.query('ROLLBACK');if(pending)await pending;a.release();b.release();}
  }
  await reset();await pg.query("UPDATE projects SET status='SETUP' WHERE id=$1",[id(3)]);
  const a=await pg.connect(),b=await pg.connect();let pending:Promise<unknown>|undefined,replacementAssignment:UUID|undefined;
  try{
   const input={...base,expectedSnapshot:await repo.snapshot(pg,scope,id(11))};const aPid=(await a.query('SELECT pg_backend_pid() AS pid')).rows[0].pid,bPid=(await b.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
   await transaction(a);await transaction(b);
   class PausedAreaReplacement extends TenancyRepository{
    override async saveAorAssignment(db:DbClient,assignment:Parameters<TenancyRepository['saveAorAssignment']>[1]){
     replacementAssignment=assignment.id;pending=fresh(a,input,randomUUID()).then(value=>value,error=>error);await waitForLock(aPid,bPid);await super.saveAorAssignment(db,assignment);
    }
   }
   await assignAorUser(new PausedAreaReplacement(),b,{...scope,userId:id(12),aorNodeId:id(21),actorRole:'PROJECT_ADMIN',deactivateAssignmentIds:[id(51)]});await b.query('COMMIT');const result=await pending;expect(result instanceof ConflictError,true,'Generic Area replacement wins and yields stale conflict, not a deadlock');await a.query('ROLLBACK');
  }finally{await a.query('ROLLBACK');await b.query('ROLLBACK');if(pending)await pending;a.release();b.release();if(replacementAssignment)await pg.query('DELETE FROM aor_assignments WHERE id=$1 AND tenant_id=$2',[replacementAssignment,id(1)]);await pg.query("UPDATE projects SET status='ACTIVE' WHERE id=$1",[id(3)]);}
  await reset();
  // Two departing obligations choose the same replacement and Area. Project
  // serialization permits one creation; the second requires deliberate reload.
  await reset();await pg.query('DELETE FROM project_responsibility_grants WHERE id=$1',[id(50)]);await pg.query('DELETE FROM aor_assignments WHERE id=ANY($1::uuid[])',[[id(51),id(52)]]);
  await pg.query("INSERT INTO project_responsibility_grants(id,tenant_id,project_id,user_id,aor_node_id,responsibility,granted_by) VALUES($1,$2,$3,$4,$5,'SURVEY_REVIEWER',$6)",[id(79),id(1),id(3),id(13),id(21),id(14)]);
  const sameAreaA=await pg.connect(),sameAreaB=await pg.connect();let sameAreaPending:Promise<unknown>|undefined,created:Awaited<ReturnType<typeof resolveSurveyReviewer>>|undefined;
  try{
   const first:ResolveReviewerInput={...base,coverageMode:'assignAdditional',confirmAdditionalCoverage:true,coverageIntent:'TEMPORARY',expectedSnapshot:await repo.snapshot(pg,scope,id(11))};
   const second:ResolveReviewerInput={...first,userId:id(13),grantId:id(79),expectedSnapshot:await repo.snapshot(pg,scope,id(13))};
   const aPid=(await sameAreaA.query('SELECT pg_backend_pid() AS pid')).rows[0].pid,bPid=(await sameAreaB.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
   await transaction(sameAreaA);await transaction(sameAreaB);created=(await fresh(sameAreaA,first,randomUUID())).body;
   sameAreaPending=fresh(sameAreaB,second,randomUUID()).then(value=>value,error=>error);await waitForLock(bPid,aPid);await sameAreaA.query('COMMIT');const stale=await sameAreaPending;
   expect(stale instanceof ConflictError,true);expect((stale as ConflictError).code,'STALE_PROTECTED_OBLIGATIONS');await sameAreaB.query('ROLLBACK');
   expect((await pg.query("SELECT count(*)::int AS n FROM project_responsibility_grants WHERE project_id=$1 AND user_id=$2 AND aor_node_id=$3 AND revoked_at IS NULL",[id(3),id(12),id(21)])).rows[0].n,1);
   await transaction(sameAreaB);const reuse:ResolveReviewerInput={...base,userId:id(13),grantId:id(79),expectedSnapshot:await repo.snapshot(pg,scope,id(13))};const reused=(await fresh(sameAreaB,reuse,randomUUID())).body;
   expect(reused.replacementGrantId,created.replacementGrantId);expect(reused.createdReviewGrant,false);expect(reused.createdIndividualAssignment,false);await sameAreaB.query('COMMIT');expect((await pg.query('SELECT count(*)::int AS n FROM access_grant_events WHERE project_id=$1',[id(3)])).rows[0].n,3);
  }finally{
   await sameAreaA.query('ROLLBACK');await sameAreaB.query('ROLLBACK');if(sameAreaPending)await sameAreaPending;sameAreaA.release();sameAreaB.release();await reset();await pg.query('DELETE FROM project_responsibility_grants WHERE id=$1 AND tenant_id=$2',[id(79),id(1)]);
   if(created){await pg.query('DELETE FROM project_responsibility_grants WHERE id=$1 AND tenant_id=$2',[created.replacementGrantId,id(1)]);await pg.query('DELETE FROM aor_assignments WHERE id=$1 AND tenant_id=$2',[created.replacementAssignmentId,id(1)]);}
   await pg.query("INSERT INTO project_responsibility_grants(id,tenant_id,project_id,user_id,aor_node_id,responsibility,granted_by) VALUES($1,$2,$3,$4,$5,'SURVEY_REVIEWER',$6)",[id(50),id(1),id(3),id(12),id(21),id(14)]);
   for(const n of [51,52])await pg.query('INSERT INTO aor_assignments(id,tenant_id,project_id,user_id,aor_node_id) VALUES($1,$2,$3,$4,$5)',[id(n),id(1),id(3),id(12),id(21)]);
  }
  // Generic inserts do not participate in this endpoint's project lock. An
  // absent individual witness cannot be locked; preserve both committed rows.
  await reset();const savedAssignments=(await pg.query('SELECT to_jsonb(a) AS row FROM aor_assignments a WHERE id=ANY($1::uuid[]) ORDER BY id',[[id(51),id(52)]])).rows;
  await pg.query('DELETE FROM aor_assignments WHERE id=ANY($1::uuid[])',[[id(51),id(52)]]);
  const insertRace=await pg.connect();
  try{
   await transaction(insertRace);
   class ConcurrentIndividual extends ProtectedObligationsPgRepository{
    override async createIndividualCoverage(...args:Parameters<ProtectedObligationsPgRepository['createIndividualCoverage']>){
     await pg.query('INSERT INTO aor_assignments(id,tenant_id,project_id,user_id,aor_node_id) VALUES($1,$2,$3,$4,$5)',[id(77),id(1),id(3),id(12),id(21)]);return super.createIndividualCoverage(...args);
    }
   }
   const current=new ConcurrentIndividual(),input:ResolveReviewerInput={...base,coverageMode:'assignAdditional',confirmAdditionalCoverage:true,coverageIntent:'TEMPORARY',expectedSnapshot:await repo.snapshot(pg,scope,id(11))};
   const result=await resolveSurveyReviewer(current,insertRace,await current.lockResolutionContext(insertRace,auth,id(3),input),input);
   expect(result.createdIndividualAssignment,true);expect(result.createdReviewGrant,false);
   expect((await insertRace.query('SELECT count(*)::int AS n FROM aor_assignments WHERE project_id=$1 AND user_id=$2 AND aor_node_id=$3 AND deactivated_at IS NULL',[id(3),id(12),id(21)])).rows[0].n,2);
  }finally{await insertRace.query('ROLLBACK');insertRace.release();await pg.query('DELETE FROM aor_assignments WHERE id=$1 AND tenant_id=$2',[id(77),id(1)]);for(const record of savedAssignments)await pg.query('INSERT INTO aor_assignments SELECT (jsonb_populate_record(NULL::aor_assignments,$1::jsonb)).*',[record.row]);}
  // A competing responsibility insertion is fenced by the existing unique
  // index. It must conflict and roll back our handover, without adopting it.
  const savedGrant=(await pg.query('SELECT to_jsonb(g) AS row FROM project_responsibility_grants g WHERE id=$1',[id(50)])).rows[0].row;
  await pg.query('DELETE FROM project_responsibility_grants WHERE id=$1',[id(50)]);
  const grantRace=await pg.connect();
  try{
   await transaction(grantRace);
   class ConcurrentResponsibility extends ProtectedObligationsPgRepository{
    override async createReviewCoverage(...args:Parameters<ProtectedObligationsPgRepository['createReviewCoverage']>){
     await pg.query("INSERT INTO project_responsibility_grants(id,tenant_id,project_id,user_id,aor_node_id,responsibility,granted_by) VALUES($1,$2,$3,$4,$5,'SURVEY_REVIEWER',$6)",[id(78),id(1),id(3),id(12),id(21),id(14)]);return super.createReviewCoverage(...args);
    }
   }
   const current=new ConcurrentResponsibility(),input:ResolveReviewerInput={...base,coverageMode:'assignAdditional',confirmAdditionalCoverage:true,coverageIntent:'PERMANENT',expectedSnapshot:await repo.snapshot(pg,scope,id(11))};
   const context=await current.lockResolutionContext(grantRace,auth,id(3),input);
   await assert.rejects(executeIdempotentHttpMutation(grantRace,{tenantId:id(1),actorId:id(10),endpoint:`POST:/api/projects/${id(3)}/survey/protected-obligations`,idempotencyKey:randomUUID()},input,async()=>({status:200,body:await resolveSurveyReviewer(current,grantRace,context,input)})),ConflictError);checks++;
   await grantRace.query('ROLLBACK');expect((await pg.query('SELECT revoked_at FROM project_responsibility_grants WHERE id=$1',[id(30)])).rows[0].revoked_at,null);expect((await pg.query('SELECT count(*)::int AS n FROM access_grant_events WHERE project_id=$1',[id(3)])).rows[0].n,0);expect((await pg.query('SELECT count(*)::int AS n FROM api_idempotency WHERE tenant_id=$1 AND actor_id=$2 AND endpoint=$3',[id(1),id(10),`POST:/api/projects/${id(3)}/survey/protected-obligations`])).rows[0].n,0);
  }finally{await grantRace.query('ROLLBACK');grantRace.release();await pg.query('DELETE FROM project_responsibility_grants WHERE id=$1 AND tenant_id=$2',[id(78),id(1)]);await pg.query('INSERT INTO project_responsibility_grants SELECT (jsonb_populate_record(NULL::project_responsibility_grants,$1::jsonb)).*',[savedGrant]);}
  console.log(`PASS ${checks} actual two-session reviewer concurrency checks`);
 }finally{
  if(fixtureOwned){await reset();await pg.query('DELETE FROM project_responsibility_grants WHERE id=$1 AND tenant_id=$2',[id(50),id(1)]);await pg.query('DELETE FROM aor_assignments WHERE id=$1 AND tenant_id=$2',[id(51),id(1)]);await pg.query('DELETE FROM aor_assignments WHERE id=$1 AND tenant_id=$2',[id(52),id(1)]);}
  await pg.end();
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
