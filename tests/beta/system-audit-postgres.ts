import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {appendAuditEvent} from '../../src/modules/audit/infrastructure/audit.repository';
import {listTicketHistory} from '../../src/modules/ticket/infrastructure/ticket-history.repository';
import type {UUID} from '../../src/shared/types';
async function main(){
 const url=new URL(process.env.DATABASE_URL??'');assert.equal(process.env.SWR_TEAM_POSTGRES,'1');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15489');assert.equal(url.pathname,'/swr_team_isolated');
 const schema='system_audit_'+randomUUID().replaceAll('-',''),pg=new Pool({connectionString:url.href}),db=await pg.connect();let created=false,checks=0;
 const tenant=randomUUID() as UUID,foreign=randomUUID() as UUID,company=randomUUID(),project=randomUUID(),human=randomUUID() as UUID,ticket=randomUUID() as UUID,event=randomUUID();
 try{
  await db.query('BEGIN');await db.query('CREATE SCHEMA "'+schema+'"');created=true;await db.query('SET search_path TO "'+schema+'",public');
  for(const name of(await readdir('db/migrations')).filter(x=>x.endsWith('.sql')&&x<'043_').sort())await db.query(await readFile('db/migrations/'+name,'utf8'));
  await db.query('BEGIN');
  await db.query("INSERT INTO tenants(id,name) VALUES($1,'Owned system audit'),($2,'Owned foreign system audit')",[tenant,foreign]);
  await db.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'Owned GC','GC')",[company,tenant]);
  await db.query("INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,'Owned audit project','ACTIVE','FULL')",[project,tenant]);
  await db.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,'Historical human','fixture')",[human,tenant,company,human+'@example.test']);
  await db.query("INSERT INTO tickets(id,tenant_id,project_id,company_id,requester_id,workflow_variant,status,craft,description) VALUES($1,$2,$3,$4,$5,'STANDARD_APPROVAL','DRAFT','Survey','Historical source')",[ticket,tenant,project,company,human]);
  await db.query("INSERT INTO ticket_events(id,tenant_id,ticket_id,actor_id,event_type,payload) VALUES($1,$2,$3,$4,'ticket.created','{\"retained\":true}')",[event,tenant,ticket,human]);
  const before=(await db.query('SELECT to_jsonb(e) AS row FROM ticket_events e WHERE id=$1',[event])).rows[0].row;
  const migration=await readFile('db/migrations/043_system_audit_identity.sql','utf8');await db.query(migration);await db.query(migration);
  const after=(await db.query("SELECT to_jsonb(e)-'actor_kind' AS row,actor_kind FROM ticket_events e WHERE id=$1",[event])).rows[0];assert.deepEqual(after.row,before);assert.equal(after.actor_kind,'USER');checks+=2;
  const users=(await db.query('SELECT count(*)::int n FROM users')).rows[0].n;
  await appendAuditEvent(db,{tenantId:tenant,ticketId:ticket,actorId:null,actorKind:'SYSTEM',eventType:'approver.timeout_unlocked',payload:{hoursElapsed:24}});
  assert.equal((await db.query('SELECT count(*)::int n FROM users')).rows[0].n,users);checks++;
  const system=(await db.query("SELECT e.*,t.project_id FROM ticket_events e JOIN tickets t ON t.tenant_id=e.tenant_id AND t.id=e.ticket_id WHERE e.actor_kind='SYSTEM'")).rows[0];assert.equal(system.actor_id,null);assert.equal(system.tenant_id,tenant);assert.equal(system.ticket_id,ticket);assert.equal(system.project_id,project);assert.ok(system.created_at);checks+=5;
  const history=await listTicketHistory(db,tenant,ticket);assert.deepEqual(history.find(e=>e.id===system.id)?.actor,{id:null,name:'SWRTracker System',kind:'SYSTEM'});assert.equal(history.find(e=>e.id===event)?.actor?.name,'Historical human');assert.equal((await listTicketHistory(db,foreign,ticket)).length,0);checks+=3;
  const invalid=async(sql:string,args:unknown[],code:string)=>{await db.query('SAVEPOINT refusal');let caught:unknown;try{await db.query(sql,args);}catch(e){caught=e;}await db.query('ROLLBACK TO SAVEPOINT refusal');assert.equal((caught as {code:string})?.code,code);checks++;};
  await invalid("INSERT INTO ticket_events(tenant_id,ticket_id,actor_id,actor_kind,event_type) VALUES($1,$2,$3,'SYSTEM','workflow.orphan_escalation')",[tenant,ticket,human],'23514');
  await invalid("INSERT INTO ticket_events(tenant_id,ticket_id,actor_id,actor_kind,event_type) VALUES($1,$2,NULL,'USER','ticket.created')",[tenant,ticket],'23514');
  await invalid("INSERT INTO ticket_events(tenant_id,ticket_id,actor_id,actor_kind,event_type) VALUES($1,$2,NULL,'SYSTEM','workflow.orphan_escalation')",[foreign,ticket],'23503');
  await invalid("UPDATE ticket_events SET actor_kind='SYSTEM',actor_id=NULL WHERE id=$1",[event],'55000');
  const witness=(await db.query('SELECT description,row_version FROM tickets WHERE id=$1',[ticket])).rows[0];
  await db.query("CREATE FUNCTION audit_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'owned audit append failure'; END $$");await db.query('CREATE TRIGGER audit_fault BEFORE INSERT ON ticket_events FOR EACH ROW EXECUTE FUNCTION audit_fault()');
  await db.query('SAVEPOINT atomic_effect');await db.query("UPDATE tickets SET description='Changed only if audited',row_version=row_version+1 WHERE id=$1",[ticket]);
  await assert.rejects(()=>appendAuditEvent(db,{tenantId:tenant,ticketId:ticket,actorId:null,actorKind:'SYSTEM',eventType:'workflow.orphan_escalation',payload:{}}),/owned audit append failure/);await db.query('ROLLBACK TO SAVEPOINT atomic_effect');
  assert.deepEqual((await db.query('SELECT description,row_version FROM tickets WHERE id=$1',[ticket])).rows[0],witness);assert.equal((await db.query("SELECT count(*)::int n FROM ticket_events WHERE actor_kind='SYSTEM'")).rows[0].n,1);checks+=2;
  console.log('System audit PostgreSQL migration/history/isolation/rollback checks passed: '+checks);
 }finally{await db.query('ROLLBACK');if(created)assert.match(schema,/^system_audit_[a-f0-9]{32}$/);db.release();await pg.end();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
