import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {pruneTenantObservations,pruneExpiredRequestObservations} from '../../src/modules/support/infrastructure/observation-retention';
import type {DbClient,UUID} from '../../src/shared/types';

async function main(){
 const url=new URL(process.env.DATABASE_URL??'');assert.equal(process.env.SWR_TEAM_POSTGRES,'1');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15489');assert.equal(url.pathname,'/swr_team_isolated');
 const schema='reconcile_retention_'+randomUUID().replaceAll('-',''),root=new Pool({connectionString:url.href});url.searchParams.set('options','-c search_path='+schema+',public');const pool=new Pool({connectionString:url.href,max:4}),checks:string[]=[];
 const check=(value:unknown,label:string)=>{assert(value,label);checks.push(label);};
 try{
  await root.query('CREATE SCHEMA "'+schema+'"');
  for(const file of(await readdir('db/migrations')).filter(n=>n.endsWith('.sql')).sort())await pool.query(await readFile('db/migrations/'+file,'utf8'));
  const tenants=[randomUUID(),randomUUID()] as UUID[],projects=[randomUUID(),randomUUID()],users=[randomUUID(),randomUUID()];
  for(let i=0;i<2;i++){
   const company=randomUUID();await pool.query("INSERT INTO tenants(id,name) VALUES($1,'Owned retention')",[tenants[i]]);await pool.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'Owned GC','GC')",[company,tenants[i]]);await pool.query("INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,'Owned retention','ACTIVE','MEDIUM')",[projects[i],tenants[i]]);await pool.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,'Owned user','fixture')",[users[i],tenants[i],company,users[i]+'@example.invalid']);
   const ticket=randomUUID();await pool.query("INSERT INTO tickets(id,tenant_id,project_id,company_id,requester_id,workflow_variant,status,craft,description) VALUES($1,$2,$3,$4,$5,'STANDARD_APPROVAL','DRAFT','Survey','Retained witness')",[ticket,tenants[i],projects[i],company,users[i]]);await pool.query("INSERT INTO ticket_events(tenant_id,ticket_id,actor_id,event_type,payload) VALUES($1,$2,$3,'ticket.created','{}')",[tenants[i],ticket,users[i]]);await pool.query("INSERT INTO project_support_tickets(tenant_id,project_id,requester_id,subject,description) VALUES($1,$2,$3,'Retained support','Retained conversation witness')",[tenants[i],projects[i],users[i]]);
  }
  const cutoff=new Date('2026-10-02T12:00:00.000Z'),count=async(t:UUID)=>(await pool.query('SELECT count(*)::int n FROM project_request_observations WHERE tenant_id=$1',[t])).rows[0].n;
  for(let i=0;i<2;i++)await pool.query("INSERT INTO project_request_observations(tenant_id,project_id,actor_id,route,method,status,duration_ms,correlation_id,observed_at) SELECT $1,$2,$3,'/owned/[id]','GET',200,1,gen_random_uuid(),$4::timestamptz-interval '1 millisecond' FROM generate_series(1,$5)",[tenants[i],projects[i],users[i],cutoff,i===0?2300:3]);
  await pool.query("INSERT INTO project_request_observations(tenant_id,project_id,actor_id,route,method,status,duration_ms,correlation_id,observed_at) SELECT $1,$2,$3,'/boundary','GET',200,1,gen_random_uuid(),at FROM unnest(ARRAY[$4::timestamptz,$4::timestamptz+interval '1 millisecond']) at",[tenants[0],projects[0],users[0],cutoff]);
  const witness=async()=>{const rows=[];for(const table of ['tickets','ticket_events','attachments','administrative_events','project_support_tickets','project_support_messages'])rows.push((await pool.query('SELECT to_jsonb(t) row FROM '+table+' t ORDER BY to_jsonb(t)::text')).rows);return createHash('sha256').update(JSON.stringify(rows)).digest('hex');};const before=await witness();
  const left=await pool.connect(),right=await pool.connect();try{
   await left.query('BEGIN');await right.query('BEGIN');const batches=await Promise.all([pruneTenantObservations(left as unknown as DbClient,tenants[0]!,cutoff),pruneTenantObservations(right as unknown as DbClient,tenants[0]!,cutoff)]);check(batches.every(n=>n===1000),'Concurrent workers each respect 1000-row tenant batch and skip locked rows');await left.query('COMMIT');await right.query('COMMIT');
  }finally{left.release();right.release();}
  check(await count(tenants[0]!)===302,'Concurrent batches leave exactly 300 expired plus two retained boundaries');check(await count(tenants[1]!)===3,'Tenant batch cannot delete foreign observations');
  const db=await pool.connect();try{await db.query('BEGIN');check(await pruneTenantObservations(db as unknown as DbClient,tenants[0]!,cutoff)===300,'Next cycle removes remaining expired rows');check(await pruneTenantObservations(db as unknown as DbClient,tenants[0]!,cutoff)===0,'Repeat deletion is idempotent');await db.query('COMMIT');}finally{db.release();}
  check(await count(tenants[0]!)===2,'Exactly seven days and newer observations survive cutoff');check(await witness()===before,'Requests, events, files, administrative evidence and support records unchanged');
  const blocker=await pool.connect();try{await blocker.query('BEGIN');await blocker.query('SELECT id FROM tenants WHERE id=$1 FOR UPDATE',[tenants[1]]);await pruneExpiredRequestObservations(pool);check(await count(tenants[1]!)===3,'Lifecycle-lock timeout preserves expired rows for retry');await blocker.query('ROLLBACK');}finally{blocker.release();}
  await pruneExpiredRequestObservations(pool);check(await count(tenants[1]!)===0,'Next cycle retries failed tenant maintenance');check(await witness()===before,'Worker-cycle maintenance preserves retained domain records');
  for(const file of ['src/workers/notification-worker.ts','src/workers/notification-worker-loop.ts'])check((await readFile(file,'utf8')).includes('await pruneExpiredRequestObservations(pool)'),'Retention wired into '+file);
  await pool.query(await readFile('db/migrations/045_request_observation_retention.sql','utf8'));check(Boolean((await pool.query("SELECT to_regclass('project_request_observations_retention') index")).rows[0].index),'Retention index reapplication is repeatable');
  await writeFile('audits/alpha1-reconciliation/retention.json',JSON.stringify({checks,fixtureKind:'new owned schema; current clean install through045',retainedWitness:before},null,2)+'\n');console.log('Observation retention: '+checks.length+' checks');
 }finally{await pool.end();await root.query('DROP SCHEMA "'+schema+'" CASCADE');await root.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
