import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { getPool } from '@/lib/db';
import { signToken } from '@/lib/auth';
import { getTicketRouteContext } from '@/lib/ticket-route-helpers';
import { buildVisibilityClause } from '@/lib/ticket-visibility-clause';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { createDirectAssignmentTicket } from '@/modules/ticket/application/create-direct-assignment-ticket';
import { requestFieldCancel } from '@/modules/ticket/application/request-field-cancel';
import type { ITicketRepository } from '@/modules/ticket/application/ports';
import type { Ticket } from '@/modules/ticket/domain/types';
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';

const id = (n: number) => `84000000-0000-4000-8000-${String(n).padStart(12,'0')}` as UUID;
const tenantId=id(1),projectId=id(2),actorId=id(3),ticketId=id(4),chiefId=id(5),teammateId=id(6),areaId=id(7);

test('FILE-001 resolver and SQL-time fence both require a current tenant/project crew link; own work is independent', async () => {
  let sql = '', params: unknown[] = [];
  const db: DbClient = { async query<T extends object>(query: string, values: unknown[] = []) {
    sql=query;params=values; return {rows: [] as T[]};
  }};
  assert.equal(await new TicketRepository().findPartyChiefForInstrumentMan(db,tenantId,projectId,actorId),null);
  assert.match(sql,/deactivated_at IS NULL/);assert.deepEqual(params,[tenantId,projectId,actorId]);
  for (const partyChiefId of [chiefId,undefined]) {
    const clause=buildVisibilityClause({actorId,actorRole:'INSTRUMENT_MAN',companyId:id(8),partyChiefId},3);
    assert.match(clause.sql,/t\.assigned_instrument_man_id = \$4 OR/);
    assert.match(clause.sql,/cr\.tenant_id = t\.tenant_id AND cr\.project_id = t\.project_id/);
    assert.match(clause.sql,/cr\.party_chief_id = \$3 AND cr\.instrument_man_id = \$4/);
    assert.match(clause.sql,/cr\.deactivated_at IS NULL/);
    assert.deepEqual(clause.params,[partyChiefId ?? null,actorId]);
  }
});

test('AUTH-001 direct assignment refuses absent/currently revoked authority before numbering or writes', async () => {
  const input={tenantId,projectId,actorId,aorNodeId:areaId,requesterId:id(9),actorRole:'SURVEY_SUPERINTENDENT' as const,
    assignedPartyChiefId:chiefId,assignedInstrumentManId:teammateId,ticketType:'LAYOUT' as const,
    craft:'',description:'Synthetic work',requestedDate:new Date('2026-10-15')};
  for (const authority of [undefined,async () => false]) {
    let writes=0;
    const repo={lockDirectAssignmentAuthority:authority,nextSequence:async()=>{writes++;return 1;},save:async()=>{writes++;}} as unknown as ITicketRepository;
    await assert.rejects(createDirectAssignmentTicket(repo,{query:async()=>{writes++;return {rows:[]};}},input),ForbiddenError);
    assert.equal(writes,0);
  }
});

test('AUTH-001 authority SQL locks active leadership, project, hierarchy and current individual scope', async () => {
  const calls: Array<{sql:string;params:unknown[]}> = [];
  const db: DbClient={async query<T extends object>(sql:string,params:unknown[]=[]){
    calls.push({sql,params});
    return {rows:(calls.length===1 ? [{role:'SURVEY_SUPERINTENDENT'}] : calls.length===2 ? [{id:areaId},{id:id(10)}] : [{id:id(11)}]) as T[]};
  }};
  assert.equal(await new TicketRepository().lockDirectAssignmentAuthority(db,{tenantId,projectId,actorId,actorRole:'SURVEY_SUPERINTENDENT',aorNodeId:areaId,sessionVersion:2}),true);
  const [lead,nodes,grant]=calls;assert.ok(lead&&nodes&&grant);
  assert.match(lead.sql,/p\.status='ACTIVE'/);assert.match(lead.sql,/FOR SHARE OF p,pm,u,c/);
  assert.deepEqual(lead.params,[tenantId,projectId,actorId,'SURVEY_SUPERINTENDENT',2]);
  assert.match(nodes.sql,/WITH RECURSIVE ancestors/);assert.match(nodes.sql,/retired_at IS NULL/);
  assert.match(grant.sql,/tenant_id=\$1 AND project_id=\$2 AND user_id=\$3/);
  assert.match(grant.sql,/deactivated_at IS NULL[\s\S]*FOR SHARE/);
  assert.deepEqual(grant.params,[tenantId,projectId,actorId,[areaId,id(10)]]);
});

function ticket(variant: Ticket['workflowVariant'], assignedInstrumentManId: UUID | null): Ticket {
  const now=new Date('2026-10-01T00:00:00Z');
  return {id:ticketId,tenantId,projectId,aorNodeId:areaId,departmentId:null,companyId:id(8),ticketNumber:'FSS-A-00001',ticketType:'LAYOUT',
    requesterId:id(9),assignedPartyChiefId:chiefId,assignedInstrumentManId,surveyLeadId:id(10),workflowVariant:variant,status:'DELAYED',
    craft:'',description:'Synthetic delayed work',requestedDate:now,submittedAt:now,approvedAt:now,assignedAt:now,startedAt:now,
    pendingPcOutcome:null,pendingPcReason:null,surveyCancelRequestedBy:null,surveyCancelRequestedRole:null,surveyCancelReason:null,
    surveyCancelRequestedAt:null,completedAt:null,closedAt:null,rejectionReason:null,parentTicketId:null,priority:'NORMAL',
    prioritySetBy:null,prioritySetReason:null,rowVersion:2,createdAt:now,updatedAt:now};
}

test('REQ-001 readable teammate/null assignments cannot request cancellation; exact owner and leadership remain valid', async () => {
  for (const workflowVariant of ['STANDARD_APPROVAL','DIRECT_ASSIGNMENT'] as const) {
    for (const assignedInstrumentManId of [teammateId,null,actorId]) {
      let reads=0,writes=0,audits=0;
      const current=ticket(workflowVariant,assignedInstrumentManId);
      const repo={findById:async()=>{reads++;return current;},patchTicket:async()=>{writes++;}} as unknown as ITicketRepository;
      const db: DbClient={query:async()=>{audits++;return {rows:[]};}};
      const invoke=()=>requestFieldCancel(repo,db,{tenantId,ticketId,actorId,actorRole:'INSTRUMENT_MAN',reason:'Synthetic reason',
        visibility:{actorId,actorRole:'INSTRUMENT_MAN',companyId:id(8),partyChiefId:chiefId}});
      if (assignedInstrumentManId===actorId) {
        assert.equal((await invoke()).status,'PENDING_PC_APPROVAL');assert.equal(writes,1);assert.equal(audits,1);
      } else {await assert.rejects(invoke(),ForbiddenError);assert.equal(writes,0);assert.equal(audits,0);}
      assert.equal(reads,1,'authority must use the same read as transition');
    }
    const repo={findByIdInternal:async()=>ticket(workflowVariant,teammateId),patchTicket:async()=>{}} as unknown as ITicketRepository;
    for(const actorRole of ['SURVEY_MANAGER','SURVEY_SUPERINTENDENT','PARTY_CHIEF'] as const){
      assert.equal((await requestFieldCancel(repo,{query:async()=>({rows:[]})},{tenantId,ticketId,actorId,actorRole})).status,'PENDING_PC_APPROVAL');
    }
  }
});

test('REQ-001 invisibility, wrong role, invalid state and stale reassignment remain denied without audit', async () => {
  let audits=0;
  const db: DbClient={query:async()=>{audits++;return {rows:[]};}};
  const invoke=(current:Ticket|null,actorRole:'INSTRUMENT_MAN'|'REQUESTER',stale=false)=>requestFieldCancel({
    findByIdInternal:async()=>current,
    patchTicket:async()=>{if(stale)throw new ConflictError('Synthetic reassignment','STALE_TICKET');},
  } as unknown as ITicketRepository,db,{tenantId,ticketId,actorId,actorRole});
  await assert.rejects(invoke(null,'INSTRUMENT_MAN'),NotFoundError);
  await assert.rejects(invoke(ticket('STANDARD_APPROVAL',actorId),'REQUESTER'),ForbiddenError);
  await assert.rejects(invoke({...ticket('STANDARD_APPROVAL',actorId),status:'IN_PROGRESS'},'INSTRUMENT_MAN'));
  await assert.rejects(invoke(ticket('STANDARD_APPROVAL',actorId),'INSTRUMENT_MAN',true),ConflictError);
  assert.equal(audits,0);
});

test('AUTH-002 existing unassigned and absent requests both return NotFound; authentication/internal errors remain distinct', async () => {
  process.env.JWT_SECRET ??= 'synthetic-test-only';
  process.env.DATABASE_URL ??= 'postgres://test:test@127.0.0.1:1/test';
  const pool=getPool();const original=pool.query;
  const req=new NextRequest('http://localhost/api/tickets/'+ticketId,{headers:{cookie:`swr_session=${signToken(actorId,tenantId)}`}});
  try {
    for(const state of ['absent','unassigned','session','internal'] as const){
      pool.query=(async(sql:string)=>{
        if(sql.includes('FROM revoked_auth_sessions'))return {rows:[{revoked:false}]};
        if(sql.includes('SELECT project_id FROM tickets'))return {rows:state==='absent'?[]:[{project_id:projectId}]};
        if(sql.includes('FROM users'))return {rows:[{session_version:state==='session'?2:1,deactivated_at:null}]};
        if(state==='internal')throw new Error('Synthetic database failure');
        return {rows:[]};
      }) as typeof pool.query;
      const expected=state==='session'?UnauthorizedError:state==='internal'?Error:NotFoundError;
      await assert.rejects(getTicketRouteContext(req,ticketId),error=>{
        assert.ok(error instanceof expected);
        if(state==='absent'||state==='unassigned')assert.equal((error as Error).message,`Ticket ${ticketId} not found`);
        if(state==='internal')assert.equal((error as Error).message,'Synthetic database failure');
        return true;
      });
    }
  } finally {pool.query=original;}
});
