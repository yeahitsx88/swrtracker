import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Client } from 'pg';
import { ForbiddenError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import { listAuditLog, type AuditLogPort } from '@/modules/audit/application/audit-log';
import { AuditLogRepository } from '@/modules/audit/infrastructure/audit-log.repository';

const id=()=>randomUUID() as UUID;
test('audit log requires tenant admin before reading and validates bounded filters',async()=>{
  const query={tenantId:id(),userId:id(),limit:20,offset:0};
  let reads=0;
  const repo:AuditLogPort={async list(){reads++;return [];}};
  const db={async query(){return {rows:[{role:'REQUESTER'}]};}} as unknown as DbClient;
  await assert.rejects(listAuditLog(repo,db,query),ForbiddenError);
  assert.equal(reads,0);
  const admin={async query(){return {rows:[{role:'TENANT_ADMIN'}]};}} as unknown as DbClient;
  for(const invalid of [{limit:0},{limit:101},{offset:-1},{offset:1.5},{eventType:''},
    {from:'2026-09-01'},{from:'2026-02-30T00:00:00Z'},
    {from:'2026-09-02T00:00:00Z',until:'2026-09-01T00:00:00Z'}]){
    await assert.rejects(listAuditLog(repo,admin,{...query,...invalid}),ValidationError);
  }
  assert.equal(reads,0);
  assert.deepEqual(await listAuditLog(repo,admin,{...query,from:'2026-09-01T00:00:00Z',until:'2026-09-02T00:00:00.000Z'}),{events:[],hasMore:false});
});

test('PostgreSQL audit log includes ticket and tenant events with scoped filters and stable pages',
  {skip:!process.env.DATABASE_URL},async()=>{
  const db=new Client({connectionString:process.env.DATABASE_URL});
  await db.connect();await db.query('BEGIN');
  try{
    const tenant=id(),foreign=id(),company=id(),foreignCompany=id(),admin=id(),actor=id(),outsider=id();
    const project=id(),otherProject=id(),foreignProject=id(),ticket=id(),flag=id();
    const ticketEvent=id(),tenantEvent=id(),generalEvent=id(),outsideEvent=id();
    await db.query("INSERT INTO tenants(id,name) VALUES($1,'Audit'),($2,'Foreign')",[tenant,foreign]);
    await db.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$3,'Audit GC','GC'),($2,$4,'Foreign GC','GC')",[company,foreignCompany,tenant,foreign]);
    await db.query(`INSERT INTO users(id,tenant_id,company_id,email,name) VALUES
      ($1,$4,$6,'audit-admin@example.test','Admin'),($2,$4,$6,'audit-actor@example.test','Historical actor'),
      ($3,$5,$7,'audit-foreign@example.test','Foreign actor')`,[admin,actor,outsider,tenant,foreign,company,foreignCompany]);
    await db.query("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'TENANT_ADMIN')",[tenant,admin]);
    await db.query(`INSERT INTO projects(id,tenant_id,name,status) VALUES
      ($1,$4,'Archived audit project','ARCHIVED'),($2,$4,'Other project','ACTIVE'),($3,$5,'Foreign project','ACTIVE')`,
      [project,otherProject,foreignProject,tenant,foreign]);
    await db.query(`INSERT INTO tickets(id,tenant_id,project_id,company_id,requester_id,status,workflow_variant)
      VALUES($1,$2,$3,$4,$5,'DRAFT','STANDARD_APPROVAL')`,[ticket,tenant,project,company,actor]);
    await db.query(`INSERT INTO help_flags(id,tenant_id,project_id,raised_by,level,status,affected_ticket_ids)
      VALUES($1,$2,$3,$4,2,'ACTIVE','{}')`,[flag,tenant,otherProject,actor]);
    await db.query(`INSERT INTO ticket_events(id,tenant_id,ticket_id,actor_id,event_type,payload,created_at)
      VALUES($1,$3,$4,$5,'ticket.draft_saved',$6,'2026-09-01T12:00:00Z'),
        ($2,$3,NULL,$5,'help_flag.raised',$7,'2026-09-02T12:00:00Z')`,
      [ticketEvent,generalEvent,tenant,ticket,actor,{description:'Full payload, including "quotes"',nested:{value:42}},
        {flagId:flag,projectId:otherProject,level:2}]);
    await db.query(`INSERT INTO tenant_events(id,tenant_id,actor_id,event_type,payload,created_at)
      VALUES($1,$3,$5,'project.archived',$7,'2026-09-01T12:00:00Z'),
        ($2,$4,$6,'project.archived',$8,'2026-09-03T12:00:00Z')`,
      [tenantEvent,outsideEvent,tenant,foreign,admin,outsider,{projectId:project},{projectId:foreignProject}]);
    const repo=new AuditLogRepository(),query={tenantId:tenant,userId:admin,limit:2,offset:0};
    const first=await listAuditLog(repo,db,query),last=await listAuditLog(repo,db,{...query,offset:2});
    assert.equal(first.hasMore,true);assert.equal(last.hasMore,false);
    const all=[...first.events,...last.events];
    assert.equal(all.length,3);assert.equal(new Set(all.map(e=>e.id)).size,3);
    assert.equal(all[0]?.id,generalEvent);
    assert.deepEqual(all.slice(1).map(e=>e.id),[ticketEvent,tenantEvent].sort().reverse());
    assert.ok(all.every(e=>e.id!==outsideEvent));
    const saved=all.find(e=>e.id===ticketEvent)!;
    assert.equal(saved.projectName,'Archived audit project');assert.equal(saved.actorName,'Historical actor');
    assert.equal(saved.source,'ticket');assert.deepEqual(saved.payload,{description:'Full payload, including "quotes"',nested:{value:42}});
    assert.equal(all.find(e=>e.id===tenantEvent)?.source,'tenant');
    assert.equal(all[0]?.ticketId,null);assert.equal(all[0]?.projectId,otherProject);
    assert.equal((await listAuditLog(repo,db,{...query,projectId:project})).events.length,2);
    assert.deepEqual((await listAuditLog(repo,db,{...query,projectId:foreignProject})).events,[]);
    assert.deepEqual((await listAuditLog(repo,db,{...query,eventType:'project.archived',actorId:admin})).events.map(e=>e.id),[tenantEvent]);
    assert.deepEqual((await listAuditLog(repo,db,{...query,eventType:'%'})).events,[]);
    assert.deepEqual((await listAuditLog(repo,db,{...query,from:'2026-09-02T12:00:00Z',until:'2026-09-03T00:00:00Z'})).events.map(e=>e.id),[generalEvent]);
    assert.equal((await listAuditLog(repo,db,{...query,until:'2026-09-02T12:00:00Z'})).events.length,2);
    await assert.rejects(listAuditLog(repo,db,{...query,userId:actor}),ForbiddenError);
    await assert.rejects(listAuditLog(repo,db,{...query,tenantId:foreign}),ForbiddenError);
    assert.deepEqual(await repo.list(db,{...query,userId:actor}),[]);
    assert.deepEqual(await repo.list(db,{...query,tenantId:foreign}),[]);
    await db.query('UPDATE users SET deactivated_at=NOW() WHERE id=$1',[actor]);
    assert.equal((await listAuditLog(repo,db,{...query,eventType:'ticket.draft_saved'})).events[0]?.actorName,'Historical actor');
    // Purged drafts retain their events even though no ticket row can be joined.
    await db.query("UPDATE tickets SET draft_deleted_at=NOW()-INTERVAL '31 days',draft_deleted_reason='REQUESTER_DELETED' WHERE id=$1",[ticket]);
    await db.query('INSERT INTO ticket_draft_tombstones(ticket_id,tenant_id) VALUES($1,$2)',[ticket,tenant]);
    await db.query('DELETE FROM tickets WHERE id=$1',[ticket]);
    await db.query('SET CONSTRAINTS ALL IMMEDIATE');
    const retained=await listAuditLog(repo,db,{...query,eventType:'ticket.draft_saved'});
    assert.equal(retained.events[0]?.ticketId,ticket);
    assert.deepEqual(retained.events[0]?.payload,saved.payload);
    assert.equal(retained.events[0]?.projectId,project);
    assert.ok((await listAuditLog(repo,db,{...query,projectId:project})).events.some(e=>e.id===ticketEvent));
    await db.query('UPDATE users SET deactivated_at=NOW() WHERE id=$1',[admin]);
    await assert.rejects(listAuditLog(repo,db,query),ForbiddenError);
    assert.deepEqual(await repo.list(db,query),[]);
  }finally{await db.query('ROLLBACK');await db.end();}
});
