/** Rollback-only real-PostgreSQL checks against the explicitly identified local demo. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { createTicket } from '@/modules/ticket/application/create-ticket';
import { submitTicket } from '@/modules/ticket/application/submit-ticket';
import { approveTicket } from '@/modules/ticket/application/approve-ticket';
import { assignTicket } from '@/modules/ticket/application/assign-ticket';
import { startTicket } from '@/modules/ticket/application/start-ticket';
import { completeTicket } from '@/modules/ticket/application/complete-ticket';
import { reportFieldInability } from '@/modules/ticket/application/field-inability';
import { returnTicketForCorrection } from '@/modules/ticket/application/return-ticket-for-correction';
import { updateRequesterTicket } from '@/modules/ticket/application/update-requester-ticket';
import { requesterCancel } from '@/modules/ticket/application/requester-cancel';
import type { DbClient, UUID } from '@/shared/types';

async function main() {
  if(process.env.SWR_SABINE_ROLLBACK_SMOKE !== '1') throw new Error('SWR_SABINE_ROLLBACK_SMOKE=1 required');
  const config=JSON.parse(readFileSync('.data/sabine/runtime.json','utf8')) as {DATABASE_URL:string};
  const manifest=JSON.parse(readFileSync('.data/sabine/manifest.json','utf8')) as {tenantId:UUID;liveProjectId:UUID};
  const url=new URL(config.DATABASE_URL);
  assert.equal(url.hostname,'127.0.0.1'); assert.equal(url.port,'15488'); assert.equal(url.pathname,'/swr_sabine_simulation');
  const pool=new Pool({connectionString:config.DATABASE_URL});
  const db=await pool.connect();
  const createdIds: UUID[]=[];
  try {
    assert.equal((await db.query('SELECT current_database() AS name')).rows[0].name,'swr_sabine_simulation');
    await db.query('BEGIN');
    await db.query("SET LOCAL statement_timeout='10s'");
    const tenantId=manifest.tenantId, projectId=manifest.liveProjectId;
    const users=(await db.query<{id:UUID;email:string;company_id:UUID}>('SELECT id,email,company_id FROM users WHERE tenant_id=$1',[tenantId])).rows;
    const person=(email:string) => { const u=users.find(u=>u.email===`${email}@sabine.example`); assert.ok(u); return u; };
    const requester=person('requester0'), other=person('requester1'), manager=person('manager'), chief=person('chief1'), im=person('im1.1');
    const area=(await db.query<{id:UUID}>('SELECT id FROM aor_nodes WHERE tenant_id=$1 AND project_id=$2 ORDER BY code LIMIT 1',[tenantId,projectId])).rows[0]!;
    const department=(await db.query<{id:UUID}>('SELECT id FROM departments WHERE tenant_id=$1 AND project_id=$2 LIMIT 1',[tenantId,projectId])).rows[0]!;
    const repo=new TicketRepository();
    const draft=async()=>{
      const t=await createTicket(repo,db,{tenantId,projectId,aorNodeId:area.id,departmentId:department.id,companyId:requester.company_id,requesterId:requester.id,ticketType:'LAYOUT',workflowVariant:'STANDARD_APPROVAL',craft:'',fieldContact:'Rollback test contact',description:'Rollback-only Sabine workflow test',requestedDate:new Date(Date.now()+7*86400000)});
      createdIds.push(t.id); return t;
    };
    const t=await draft();
    const target={tenantId,ticketId:t.id};
    const submit=()=>submitTicket(repo,db,{...target,actorId:requester.id,actorRole:'REQUESTER',departmentId:department.id});
    const approve=()=>approveTicket(repo,db,{...target,actorId:manager.id,actorRole:'SURVEY_MANAGER'});
    await assert.rejects(approve(),{name:'ConflictError'});
    const first=await submit();
    assert.ok(first.ticketNumber);
    await assert.rejects(approveTicket(repo,db,{...target,actorId:requester.id,actorRole:'REQUESTER'}),{name:'ForbiddenError'});
    await assert.rejects(approveTicket(repo,db,{...target,tenantId:randomUUID() as UUID,actorId:manager.id,actorRole:'SURVEY_MANAGER'}),{name:'NotFoundError'});
    assert.equal(await repo.findById(db,tenantId,t.id,{actorId:other.id,actorRole:'REQUESTER',projectId,companyId:other.company_id,companyType:'GC'}),null);
    assert.equal(await repo.findById(db,randomUUID() as UUID,t.id,{actorId:manager.id,actorRole:'SURVEY_MANAGER',projectId,companyId:manager.company_id,companyType:'GC'}),null);

    // Simulate audit persistence failure after the state write, then exercise the
    // caller's required transaction rollback. Do not alter any database schema.
    await db.query('SAVEPOINT audit_failure');
    const failAudit:DbClient={query:async <T extends object>(sql:string,params?:unknown[])=>{
      if(/INSERT\s+INTO\s+ticket_events/i.test(sql)) throw new Error('Injected audit persistence failure');
      return db.query<T>(sql,params);
    }};
    await assert.rejects(approveTicket(repo,failAudit,{...target,actorId:manager.id,actorRole:'SURVEY_MANAGER'}),/Injected audit persistence failure/);
    await db.query('ROLLBACK TO SAVEPOINT audit_failure');
    assert.equal((await repo.findByIdInternal(db,tenantId,t.id))!.status,'SUBMITTED');
    assert.equal((await db.query("SELECT count(*)::int AS n FROM ticket_events WHERE tenant_id=$1 AND ticket_id=$2 AND event_type='ticket.approved'",[tenantId,t.id])).rows[0].n,0);
    await approve();
    const assign=()=>assignTicket(repo,db,{...target,actorId:manager.id,actorRole:'SURVEY_MANAGER',assignedPartyChiefId:chief.id,assignedInstrumentManId:im.id,surveyLeadId:manager.id});
    await assign();
    await assert.rejects(startTicket(repo,db,{...target,actorId:person('im1.2').id,actorRole:'INSTRUMENT_MAN'}),{name:'ForbiddenError'});
    await startTicket(repo,db,{...target,actorId:im.id,actorRole:'INSTRUMENT_MAN'});
    const pending=await reportFieldInability(repo,db,{...target,actorId:im.id,actorRole:'INSTRUMENT_MAN',reason:'Simulation: work area not ready'});
    assert.equal(pending.fieldValidationReviewerId,chief.id);
    await assert.rejects(returnTicketForCorrection(repo,db,{...target,actorId:person('chief2').id,actorRole:'PARTY_CHIEF',reason:'Wrong reviewer',origin:'FIELD_INABILITY'}),{name:'ForbiddenError'});
    await returnTicketForCorrection(repo,db,{...target,actorId:chief.id,actorRole:'PARTY_CHIEF',reason:'Simulation: revise work limits',origin:'FIELD_INABILITY'});
    await assert.rejects(updateRequesterTicket(repo,db,{...target,actorId:other.id,actorRole:'REQUESTER',changes:{description:'Not my request'}}),{name:'ForbiddenError'});
    await updateRequesterTicket(repo,db,{...target,actorId:requester.id,actorRole:'REQUESTER',changes:{description:'Simulation: corrected work limits'}});
    const second=await submit();
    assert.equal(second.id,first.id); assert.equal(second.ticketNumber,first.ticketNumber);
    assert.equal(second.returnCycle,1); assert.equal(second.firstSubmittedAt?.getTime(),first.firstSubmittedAt?.getTime());
    await approve(); await assign();
    await startTicket(repo,db,{...target,actorId:im.id,actorRole:'INSTRUMENT_MAN'});
    assert.equal((await completeTicket(repo,db,{...target,actorId:im.id,actorRole:'INSTRUMENT_MAN'})).status,'COMPLETED');
    await assert.rejects(requesterCancel(repo,db,{...target,actorId:requester.id,actorRole:'REQUESTER'}),{name:'ConflictError'});
    const cancel=await draft();
    await submitTicket(repo,db,{tenantId,ticketId:cancel.id,actorId:requester.id,actorRole:'REQUESTER',departmentId:department.id});
    await assert.rejects(requesterCancel(repo,db,{tenantId,ticketId:cancel.id,actorId:other.id,actorRole:'REQUESTER'}),{name:'ForbiddenError'});
    assert.equal((await requesterCancel(repo,db,{tenantId,ticketId:cancel.id,actorId:requester.id,actorRole:'REQUESTER'})).status,'REQUESTER_CANCELED');
    const events=(await db.query<{event_type:string}>('SELECT event_type FROM ticket_events WHERE tenant_id=$1 AND ticket_id=$2',[tenantId,t.id])).rows.map(r=>r.event_type);
    assert.equal(events.filter(e=>e==='ticket.approved').length,2);
    assert.equal(events.filter(e=>e==='ticket.completed').length,1);
    assert.ok((await db.query('SELECT 1 FROM notification_outbox WHERE tenant_id=$1 AND ticket_id=$2',[tenantId,t.id])).rowCount!>0);
    await db.query('ROLLBACK');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM tickets WHERE tenant_id=$1 AND id=ANY($2::uuid[])',[tenantId,createdIds])).rows[0].n,0);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM ticket_events WHERE tenant_id=$1 AND ticket_id=ANY($2::uuid[])',[tenantId,createdIds])).rows[0].n,0);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM notification_outbox WHERE tenant_id=$1 AND ticket_id=ANY($2::uuid[])',[tenantId,createdIds])).rows[0].n,0);
    console.log('Sabine rollback smoke passed: same-record correction, direct completion, cancellation, permissions, tenant scope, injected audit failure rollback; no test rows retained.');
  } catch(error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); await pool.end(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
