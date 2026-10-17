import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {acquireTenantLifecycleLock} from '../../src/lib/tenant-lifecycle-lock';
import {executeIdempotentHttpMutation} from '../../src/lib/idempotency';
import {assertRecommissioningMutation,assertPreparationNotCancelling} from '../../src/lib/recommissioning-gate';
import {cancelProjectPreparation,authorizePreparationCancellationCommand,type PreparationCancellationCommand} from '../../src/modules/tenancy/application/cancel-project-preparation';
import {SqlPreparationCancellationRepository} from '../../src/modules/tenancy/infrastructure/cancel-project-preparation.repository';
import {SqlRecommissionRepository} from '../../src/modules/tenancy/infrastructure/recommission-project.repository';
import type {AuthContext} from '../../src/lib/auth';
import type {UUID} from '../../src/shared/types';
async function main(){
 const url=new URL(process.env.DATABASE_URL??'');assert.equal(process.env.SWR_TEAM_POSTGRES,'1');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15489');assert.equal(url.pathname,'/swr_team_isolated');
 const schema='preparation_cancel_'+randomUUID().replaceAll('-',''),pg=new Pool({connectionString:url.href}),db=await pg.connect();let checks=0;
 const tenant=randomUUID() as UUID,foreign=randomUUID() as UUID,company=randomUUID(),central=randomUUID() as UUID,requester=randomUUID() as UUID,project=randomUUID() as UUID,reopening=randomUUID() as UUID,draft=randomUUID() as UUID;
 const auth={tenantId:tenant,userId:central,sessionVersion:1} as AuthContext,repo=new SqlPreparationCancellationRepository();
 try{
  await db.query('CREATE SCHEMA "'+schema+'"');await db.query('SET search_path TO "'+schema+'",public');
  for(const name of(await readdir('db/migrations')).filter(x=>x.endsWith('.sql')).sort())await db.query(await readFile('db/migrations/'+name,'utf8'));
  await db.query(await readFile('db/migrations/044_preparation_cancellation.sql','utf8'));checks++;
  await db.query("INSERT INTO tenants(id,name) VALUES($1,'Owned preparation'),($2,'Owned foreign preparation')",[tenant,foreign]);
  await db.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'Owned GC','GC')",[company,tenant]);
  for(const [id,name] of [[central,'Central'],[requester,'Requester']])await db.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,$5,'fixture')",[id,tenant,company,id+'@example.test',name]);
  await db.query("INSERT INTO tenant_memberships(id,tenant_id,user_id,role) VALUES($1,$2,$3,'TENANT_ADMIN')",[randomUUID(),tenant,central]);
  for(const id of [project,reopening])await db.query("INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,'Owned preparation','SETUP','FULL')",[id,tenant]);
  await db.query("INSERT INTO tickets(id,tenant_id,project_id,company_id,requester_id,workflow_variant,status,craft,description) VALUES($1,$2,$3,$4,$5,'STANDARD_APPROVAL','DRAFT','Survey','Retained draft')",[draft,tenant,project,company,requester]);
  const period=randomUUID();await db.query("INSERT INTO project_recommissioning(id,tenant_id,project_id,replacement_admin_id,initiated_by,reason,archived_evidence) VALUES($1,$2,$3,$4,$4,'Owned reopening reason','{\"original\":true}')",[period,tenant,reopening,central]);
  const original=(await db.query('SELECT to_jsonb(r) AS row FROM project_recommissioning r WHERE id=$1',[period])).rows[0].row;
  async function transaction<T>(fn:()=>Promise<T>){await db.query('BEGIN');try{await acquireTenantLifecycleLock(db,tenant,'EXCLUSIVE');const result=await fn();await db.query('COMMIT');return result;}catch(e){await db.query('ROLLBACK');throw e;}}
  async function preview(id=project){return transaction(()=>repo.preview(db,auth,id));}
  async function perform(id:UUID,command:PreparationCancellationCommand,key=randomUUID()){return transaction(async()=>{await authorizePreparationCancellationCommand(repo,db,auth,id,command);return executeIdempotentHttpMutation(db,{tenantId:tenant,actorId:central,endpoint:'/api/projects/'+id+'/preparation-cancellation',idempotencyKey:key},command,async()=>({status:200,body:await cancelProjectPreparation(repo,db,auth,id,command)}));});}
  const initial=await preview();assert.equal(initial.work[0]?.id,draft);assert.equal(initial.blockers.length,1);checks+=2;
  await assert.rejects(()=>transaction(()=>repo.preview(db,{...auth,tenantId:foreign},project)),{name:'NotFoundError'});checks++;
  await assert.rejects(()=>transaction(()=>cancelProjectPreparation(repo,db,{...auth,userId:requester},project,{action:'START',snapshot:initial.snapshot,reason:'Not authorized to cancel',confirmed:true})),{name:'ForbiddenError'});checks++;
  const start:PreparationCancellationCommand={action:'START',snapshot:initial.snapshot,reason:'Preparation is no longer required',confirmed:true},key=randomUUID();
  await db.query("CREATE FUNCTION cancellation_audit_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'owned cancellation audit failure'; END $$");await db.query('CREATE TRIGGER cancellation_audit_fault BEFORE INSERT ON administrative_events FOR EACH ROW EXECUTE FUNCTION cancellation_audit_fault()');
  await assert.rejects(()=>perform(project,start,key),/owned cancellation audit failure/);
  assert.equal((await db.query('SELECT count(*)::int n FROM project_preparation_cancellations')).rows[0].n,0);assert.equal((await db.query('SELECT count(*)::int n FROM api_idempotency')).rows[0].n,0);checks+=2;
  await db.query('DROP TRIGGER cancellation_audit_fault ON administrative_events');
  const started=await perform(project,start,key);assert.deepEqual(await perform(project,start,key),{...started,replayed:true});checks++;
  await assert.rejects(()=>perform(project,{...start,reason:'Different reviewed reason'},key),{code:'IDEMPOTENCY_KEY_REUSE_MISMATCH'});checks++;
  const pending=await preview();assert.ok(pending.cancellationId);assert.notEqual(pending.snapshot,initial.snapshot);checks+=2;
  for(const path of ['complete','requester-cancel','draft'])await transaction(()=>assertRecommissioningMutation(db,tenant,project,'/api/tickets/'+draft+'/'+path));checks+=3;
  for(const path of ['start','assign','submit']){await assert.rejects(()=>transaction(()=>assertRecommissioningMutation(db,tenant,project,'/api/tickets/'+draft+'/'+path)),{code:'PROJECT_PREPARATION_CANCELLING'});checks++;}
  await assert.rejects(()=>transaction(()=>assertRecommissioningMutation(db,tenant,project,'/api/tickets/'+randomUUID()+'/complete')),{code:'PROJECT_PREPARATION_CANCELLING'});checks++;
  await assert.rejects(()=>transaction(()=>assertPreparationNotCancelling(db,tenant,project)),{code:'PROJECT_PREPARATION_CANCELLING'});checks++;
  await assert.rejects(()=>perform(project,{...start,action:'FINISH',snapshot:pending.snapshot}),{code:'PREPARATION_CANCELLATION_BLOCKED'});checks++;
  // Resolve only this owned draft; actual HTTP workflow journeys are separately verified.
  await db.query('UPDATE tickets SET draft_deleted_at=NOW(),row_version=row_version+1 WHERE id=$1',[draft]);
  const ready=await preview();assert.deepEqual(ready.blockers,[]);checks++;
  await assert.rejects(()=>perform(project,{...start,action:'FINISH',snapshot:pending.snapshot}),{code:'STALE_PREPARATION_CANCELLATION'});checks++;
  const finish={...start,action:'FINISH' as const,snapshot:ready.snapshot},finishKey=randomUUID();
  await db.query('CREATE TRIGGER cancellation_audit_fault BEFORE INSERT ON administrative_events FOR EACH ROW EXECUTE FUNCTION cancellation_audit_fault()');await assert.rejects(()=>perform(project,finish,finishKey),/owned cancellation audit failure/);
  assert.equal((await db.query('SELECT status FROM projects WHERE id=$1',[project])).rows[0].status,'SETUP');assert.equal((await db.query('SELECT completed_at FROM project_preparation_cancellations WHERE project_id=$1',[project])).rows[0].completed_at,null);assert.equal((await db.query('SELECT count(*)::int n FROM api_idempotency WHERE idempotency_key=$1',[finishKey])).rows[0].n,0);checks+=3;
  await db.query('DROP TRIGGER cancellation_audit_fault ON administrative_events');const ended=await perform(project,finish,finishKey);assert.deepEqual(await perform(project,finish,finishKey),{...ended,replayed:true});checks++;
  assert.equal((await db.query('SELECT status FROM projects WHERE id=$1',[project])).rows[0].status,'ARCHIVED');assert.equal((await db.query('SELECT description FROM tickets WHERE id=$1',[draft])).rows[0].description,'Retained draft');checks+=2;
  await assert.rejects(()=>perform(project,start,key),{code:'STALE_PREPARATION_CANCELLATION'});await assert.rejects(()=>transaction(()=>assertRecommissioningMutation(db,tenant,project,'/api/tickets/'+draft+'/draft')),{code:'PROJECT_ARCHIVED'});checks+=2;
  const rp=await preview(reopening),rs={...start,snapshot:rp.snapshot};await perform(reopening,rs);const rr=await preview(reopening),rf={...finish,snapshot:rr.snapshot};
  await db.query('CREATE TRIGGER cancellation_audit_fault BEFORE INSERT ON administrative_events FOR EACH ROW EXECUTE FUNCTION cancellation_audit_fault()');await assert.rejects(()=>perform(reopening,rf),/owned cancellation audit failure/);assert.equal((await db.query('SELECT cancelled_at FROM project_recommissioning WHERE id=$1',[period])).rows[0].cancelled_at,null);checks++;
  await db.query('DROP TRIGGER cancellation_audit_fault ON administrative_events');await perform(reopening,rf);
  const closed=(await db.query("SELECT to_jsonb(r)-'cancelled_at'-'cancelled_by' AS row,cancelled_at,cancelled_by FROM project_recommissioning r WHERE id=$1",[period])).rows[0];delete original.cancelled_at;delete original.cancelled_by;assert.deepEqual(closed.row,original);assert.ok(closed.cancelled_at);assert.equal(closed.cancelled_by,central);checks+=3;
  await assert.rejects(()=>db.query("UPDATE project_recommissioning SET reason='rewritten' WHERE id=$1",[period]),/immutable/);await assert.rejects(()=>db.query('DELETE FROM project_preparation_cancellations WHERE project_id=$1',[reopening]),/cannot be removed/);checks+=2;
  assert.equal((await new SqlRecommissionRepository().preview(db,auth,reopening)).periodId,null);checks++;
  await db.query("INSERT INTO project_recommissioning(id,tenant_id,project_id,replacement_admin_id,initiated_by,reason,archived_evidence) VALUES($1,$2,$3,$4,$4,'Next separately governed period','{}')",[randomUUID(),tenant,reopening,central]);checks++;
  assert.equal((await db.query("SELECT count(*)::int n FROM administrative_events WHERE event_type IN('project.preparation_cancellation_started','project.preparation_cancelled')")).rows[0].n,4);checks++;
  await db.query("UPDATE projects SET archived_at=archived_at+interval '1 second' WHERE id=$1",[project]);await assert.rejects(()=>perform(project,finish,finishKey),{code:'STALE_PREPARATION_CANCELLATION'});checks++;
  // Observe a real tenant-row lock wait, then verify current eligibility after release.
  const waiting=await pg.connect();
  try{
   await waiting.query('SET search_path TO "'+schema+'",public');await waiting.query('BEGIN');const waiterPid=(await waiting.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
   await db.query('BEGIN');await acquireTenantLifecycleLock(db,tenant,'EXCLUSIVE');
   const lock=acquireTenantLifecycleLock(waiting,tenant,'EXCLUSIVE');let blocked=false;
   for(let attempt=0;attempt<100;attempt++){if((await db.query('SELECT cardinality(pg_blocking_pids($1)) AS n',[waiterPid])).rows[0].n>0){blocked=true;break;}await new Promise(resolve=>setTimeout(resolve,10));}
   assert.ok(blocked,'Observed tenant-row barrier wait');checks++;
   await db.query('UPDATE users SET session_version=session_version+1 WHERE id=$1',[central]);await db.query('COMMIT');await lock;
   await assert.rejects(()=>authorizePreparationCancellationCommand(repo,waiting,auth,project,finish),{name:'UnauthorizedError'});checks++;
  }finally{await waiting.query('ROLLBACK');waiting.release();}
await assert.rejects(()=>perform(project,finish,finishKey),{name:'UnauthorizedError'});checks++;
  console.log('Preparation cancellation PostgreSQL checks passed: '+checks+'; fresh owned schema '+schema);
 }finally{db.release();await pg.end();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
