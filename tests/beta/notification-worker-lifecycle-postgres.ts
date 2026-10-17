import assert from 'node:assert/strict';
import {Pool,type PoolClient} from 'pg';
import {randomUUID} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import {getPool} from '../../src/lib/db';
import {acquireTenantLifecycleLock} from '../../src/lib/tenant-lifecycle-lock';
import {withTenantNotificationTransaction} from '../../src/lib/notification-worker-transaction';
import {runNotificationWorkerCycle} from '../../src/modules/notification/application/worker';
import {NotificationRepository} from '../../src/modules/notification/infrastructure';
import {PgBackgroundJobRunRepository} from '../../src/modules/notification/infrastructure/job-run.repository';
import type {NotificationMessage} from '../../src/modules/notification/application';
import type {UUID} from '../../src/shared/types';

async function main(){
 const url=new URL(process.env.DATABASE_URL??'');
 assert.equal(process.env.SWR_TEAM_POSTGRES,'1');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15489');assert.equal(url.pathname,'/swr_team_isolated');
 const schema='offboarding_worker_'+randomUUID().replaceAll('-','');
 assert.match(schema,/^offboarding_worker_[a-f0-9]{32}$/);
 const setup=new Pool({connectionString:url.href,max:1});
 const app=getPool(),oldQuery=app.query,oldConnect=app.connect;
 let created=false,pg:Pool|undefined,holder:PoolClient|undefined,waiter:PoolClient|undefined,checks=0;
 try{
  const db=await setup.connect();
  try{await db.query('BEGIN');await db.query('CREATE SCHEMA "'+schema+'"');await db.query('SET search_path TO "'+schema+'",public');
   for(const file of (await readdir('db/migrations')).filter(name=>name.endsWith('.sql')).sort())await db.query(await readFile('db/migrations/'+file,'utf8'));
   await db.query('COMMIT');created=true;
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
  pg=new Pool({connectionString:url.href,max:5,options:'-c search_path='+schema+',public'});
  const tenant=randomUUID() as UUID,project=randomUUID() as UUID,company=randomUUID() as UUID,recipient=randomUUID() as UUID,actor=randomUUID() as UUID,chief=randomUUID() as UUID;
  await pg.query("INSERT INTO tenants(id,name) VALUES($1,'Worker fixture')",[tenant]);
  await pg.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'Synthetic GC','GC')",[company,tenant]);
  await pg.query("INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,'Synthetic worker','ACTIVE','FULL')",[project,tenant]);
  for(const user of [recipient,actor,chief])await pg.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,'Synthetic user','fixture')",[user,tenant,company,user+'@example.invalid']);
  await pg.query("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'TENANT_ADMIN')",[tenant,recipient]);
  await pg.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'SURVEY_MANAGER'),($1,$3,'PARTY_CHIEF')",[project,recipient,chief]);
  await pg.query("INSERT INTO project_admin_grants(tenant_id,project_id,user_id,origin,granted_by) VALUES($1,$2,$3,'EXPLICIT',$4)",[tenant,project,recipient,actor]);
  await pg.query('UPDATE users SET deactivated_at=now(),deactivated_by=$2 WHERE id=$1',[chief,actor]);
  const area=randomUUID(),level=randomUUID();
  await pg.query("INSERT INTO aor_levels(id,tenant_id,project_id,depth,label) VALUES($1,$2,$3,0,'Area')",[level,tenant,project]);
  await pg.query("INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,name,code) VALUES($1,$2,$3,$4,'Synthetic Area','SYN')",[area,tenant,project,level]);
  holder=await pg.connect();waiter=await pg.connect();
  const h=holder,w=waiter,hpid=(await h.query('SELECT pg_backend_pid() AS pid')).rows[0].pid,wpid=(await w.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  const queries:string[]=[];
  app.query=pg.query.bind(pg) as typeof app.query;
  app.connect=(async()=>({query:async(sql:string,params?:unknown[])=>{queries.push(sql);const result=await w.query(sql,params);if(sql==='BEGIN')await w.query('SET LOCAL statement_timeout=6000');return result;},release:()=>{}})) as typeof app.connect;
  const now=new Date();const sent:NotificationMessage[]=[];
  const run=()=>runNotificationWorkerCycle({repo:new NotificationRepository(),transport:{send:async message=>{sent.push(message);}},db:app,runRepo:new PgBackgroundJobRunRepository(),now,withTenantLifecycle:withTenantNotificationTransaction});
  const domain=async()=>{const result:Record<string,unknown>={};for(const table of ['tickets','ticket_events','project_memberships','project_admin_grants','acting_grants'])result[table]=(await pg!.query('SELECT to_jsonb(t) AS row FROM '+table+' t ORDER BY to_jsonb(t)::text')).rows;return result;};
  for(const kind of ['timeout','vacancy','orphan'] as const){
   await pg.query('UPDATE users SET deactivated_at=NULL,deactivated_by=NULL,session_version=1 WHERE id=$1',[recipient]);
   await pg.query("UPDATE tickets SET status='DRAFT'");
   await pg.query('UPDATE acting_grants SET revoked_at=now(),revoked_by=$1 WHERE revoked_at IS NULL',[actor]);
   const ticket=randomUUID();
   if(kind==='vacancy')await pg.query("INSERT INTO acting_grants(tenant_id,project_id,user_id,role,trigger,granted_by,granted_reason,created_at) VALUES($1,$2,$3,'SURVEY_MANAGER','VACANCY','fixture','Synthetic vacancy',now()-interval '72 hours')",[tenant,project,recipient]);
   else await pg.query("INSERT INTO tickets(id,tenant_id,project_id,company_id,requester_id,aor_node_id,ticket_type,requested_date,workflow_variant,status,craft,description,submitted_at,assigned_party_chief_id,updated_at) VALUES($1,$2,$3,$4,$5,$6,'LAYOUT','2026-10-20','STANDARD_APPROVAL',$7,'Survey','Synthetic worker ticket',now()-interval '72 hours',$8,now()-interval '72 hours')",[ticket,tenant,project,company,actor,area,kind==='timeout'?'SUBMITTED':'ASSIGNED',kind==='orphan'?chief:null]);
   const before=await domain();sent.length=0;queries.length=0;
   await h.query('BEGIN');await acquireTenantLifecycleLock(h,tenant,'EXCLUSIVE');
   const pending=run();
   let blocked=false;const deadline=Date.now()+3000;
   while(Date.now()<deadline){if((await pg.query('SELECT $2::int=ANY(pg_blocking_pids($1::int)) AS blocked',[wpid,hpid])).rows[0].blocked){blocked=true;break;}await new Promise(resolve=>setTimeout(resolve,10));}
   if(!blocked){await h.query('ROLLBACK');await pending;throw Error(kind+' worker did not wait on tenant');}checks++;
   await h.query('UPDATE users SET deactivated_at=now(),deactivated_by=$2,session_version=session_version+1 WHERE id=$1',[recipient,actor]);await h.query('COMMIT');
   const result=await pending;assert.equal(sent.length,0,kind+' disabled recipient must not receive stale dispatch');checks++;
   assert.equal(result.warningCount+result.unlockedCount+result.vacancyCount+result.orphanEscalatedCount,0);checks++;
   assert.equal(result.orphanReassignedCount,0);checks++;
   assert.deepEqual(await domain(),before,kind+' preserves domain and audit');checks++;
   assert.ok(queries.some(sql=>sql.includes('FROM tenants')&&sql.endsWith('FOR SHARE')));checks++;
   const jobs:Array<{status:string}>=(await pg.query<{status:string}>('SELECT status FROM background_job_runs WHERE id=$1',[result.runId])).rows;assert.equal(jobs[0]!.status,'SUCCEEDED');checks++;
   // Existing eligible recipient remains a positive dispatch case; no duty assignment changes.
   await pg.query('UPDATE users SET deactivated_at=NULL,deactivated_by=NULL,session_version=1 WHERE id=$1',[recipient]);
   sent.length=0;const positive=await run();assert.equal(sent.length,1,kind+' eligible current recipient dispatches');checks++;
   assert.equal(sent[0]!.tenantId,tenant);checks++;assert.equal(sent[0]!.recipients.length,1,'combined Central/project admin recipient dedup');checks++;
   assert.equal(positive.orphanReassignedCount,0);checks++;
   if(kind!=='vacancy'){
    const events:Array<{actor_id:string|null;actor_kind:string;tenant_id:string;ticket_id:string;project_id:string;created_at:Date}>=(await pg.query('SELECT e.actor_id,e.actor_kind,e.tenant_id,e.ticket_id,e.created_at,t.project_id FROM ticket_events e JOIN tickets t ON t.tenant_id=e.tenant_id AND t.id=e.ticket_id WHERE e.tenant_id=$1 AND e.ticket_id=$2',[tenant,ticket])).rows;
    assert.equal(events.length,1);const recorded=events[0];assert.ok(recorded);assert.equal(recorded.actor_id,null);assert.equal(recorded.actor_kind,'SYSTEM');assert.equal(recorded.tenant_id,tenant);assert.equal(recorded.ticket_id,ticket);assert.equal(recorded.project_id,project);assert.ok(recorded.created_at);checks+=7;
   }
   if(kind==='orphan'){assert.equal((await pg.query('SELECT assigned_party_chief_id FROM tickets WHERE id=$1',[ticket])).rows[0].assigned_party_chief_id,chief);checks++;}
  }
  // Prove SQL partitioning against another tenant with all three candidate kinds.
  const foreign=randomUUID() as UUID,fp=randomUUID() as UUID,fc=randomUUID() as UUID,fu=randomUUID() as UUID,fd=randomUUID() as UUID,fa=randomUUID(),fl=randomUUID();
  await pg.query("INSERT INTO tenants(id,name) VALUES($1,'Foreign synthetic worker')",[foreign]);
  await pg.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'Foreign synthetic GC','GC')",[fc,foreign]);
  await pg.query("INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,'Foreign synthetic project','ACTIVE','FULL')",[fp,foreign]);
  for(const user of [fu,fd])await pg.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,'Foreign fixture','fixture')",[user,foreign,fc,user+'@example.invalid']);
  await pg.query('UPDATE users SET deactivated_at=now(),deactivated_by=$2 WHERE id=$1',[fd,fu]);
  await pg.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'SURVEY_MANAGER'),($1,$3,'PARTY_CHIEF')",[fp,fu,fd]);
  await pg.query("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'TENANT_ADMIN')",[foreign,fu]);
  await pg.query("INSERT INTO aor_levels(id,tenant_id,project_id,depth,label) VALUES($1,$2,$3,0,'Area')",[fl,foreign,fp]);
  await pg.query("INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,name,code) VALUES($1,$2,$3,$4,'Foreign Area','FSYN')",[fa,foreign,fp,fl]);
  for(const status of ['SUBMITTED','ASSIGNED'])await pg.query("INSERT INTO tickets(tenant_id,project_id,company_id,requester_id,aor_node_id,ticket_type,requested_date,workflow_variant,status,craft,description,submitted_at,assigned_party_chief_id,updated_at) VALUES($1,$2,$3,$4,$5,'LAYOUT','2026-10-20','STANDARD_APPROVAL',$6,'Survey','Foreign fixture',now()-interval '72 hours',$7,now()-interval '72 hours')",[foreign,fp,fc,fu,fa,status,status==='ASSIGNED'?fd:null]);
  await pg.query("INSERT INTO acting_grants(tenant_id,project_id,user_id,role,trigger,granted_by,granted_reason,created_at) VALUES($1,$2,$3,'SURVEY_MANAGER','VACANCY','fixture','Foreign vacancy',now()-interval '72 hours')",[foreign,fp,fu]);
  const repository=new NotificationRepository();
  for(const [all,bounded] of [
   [await repository.listApproverTimeoutCandidates(pg,now),await repository.listApproverTimeoutCandidates(pg,now,tenant)],
   [await repository.listVacancyEscalationCandidates(pg,now),await repository.listVacancyEscalationCandidates(pg,now,tenant)],
   [await repository.listOrphanWorkflowCandidates(pg),await repository.listOrphanWorkflowCandidates(pg,tenant)],
  ]){
   assert.ok(all!.some(candidate=>candidate.tenantId===foreign));checks++;
   assert.ok(bounded!.every(candidate=>candidate.tenantId===tenant));checks++;
  }
  console.log('Notification worker lifecycle PostgreSQL checks passed: '+checks);
 }finally{
  app.query=oldQuery;app.connect=oldConnect;
  if(holder){await holder.query('ROLLBACK');holder.release();}if(waiter){await waiter.query('ROLLBACK');waiter.release();}
  if(pg)await pg.end();
  if(created){assert.match(schema,/^offboarding_worker_[a-f0-9]{32}$/);await setup.query('DROP SCHEMA "'+schema+'" CASCADE');}await setup.end();
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
