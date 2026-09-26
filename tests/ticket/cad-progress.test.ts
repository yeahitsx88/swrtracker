import assert from 'node:assert/strict';
import test from 'node:test';
import { progressCad, type CadProgressPort } from '@/modules/ticket/application/progress-cad';
import type { ITicketRepository, VisibilityScope } from '@/modules/ticket/application/ports';
import type { Ticket } from '@/modules/ticket/domain/types';
import type { DbClient, UUID } from '@/shared/types';
import { ConflictError, ForbiddenError, NotFoundError } from '@/shared/errors';
const id='00000000-0000-0000-0000-000000000001' as UUID;
const actor:VisibilityScope={actorId:id,actorRole:'CAD_TECHNICIAN',companyId:id,companyType:'GC'};
const params={tenantId:id,ticketId:id,actor,action:'START' as const};
const ticket={id,tenantId:id,projectId:id,status:'COMPLETED'} as Ticket;
const tickets={findById:async()=>ticket,findByIdInternal:async()=>ticket,findActiveProjectCrewBuild:async()=> 'FULL'} as unknown as ITicketRepository;
test('assigned CAD user starts work and submits QA without completing or changing field state',async()=>{
  const writes:string[]=[];
  const db:DbClient={async query(_sql,values){assert.equal(values?.[4],'cad.status_changed');writes.push('audit');return {rows:[]};}};
  let status:'NOT_STARTED'|'IN_PROGRESS'|'QA_PENDING'='NOT_STARTED';
  const cad:CadProgressPort={lock:async()=>[{id,status,assignedTo:id,completedAt:null}],
    advance:async(_db,tenant,key,user,from,to)=>{assert.equal(tenant,id);assert.equal(key,id);assert.equal(user,id);assert.equal(from,status);status=to;writes.push(to);return true;}};
  assert.equal((await progressCad(tickets,cad,db,params)).status,'IN_PROGRESS');
  assert.equal((await progressCad(tickets,cad,db,{...params,action:'SUBMIT_QA'})).status,'QA_PENDING');
  assert.deepEqual(writes,['IN_PROGRESS','audit','QA_PENDING','audit']);
  assert.equal(ticket.status,'COMPLETED');
  await assert.rejects(progressCad(tickets,cad,db,{...params,action:'SUBMIT_QA'}),ConflictError);
});
test('CAD progression rejects wrong actor, invisible ticket, inactive project and invalid states before writes',async()=>{
  const db:DbClient={async query(){throw new Error('Unexpected write');}};
  const record={id,status:'NOT_STARTED' as const,assignedTo:id,completedAt:null};
  const cad:CadProgressPort={lock:async()=>[record],advance:async()=>{throw new Error('Unexpected write');}};
  for(const actorRole of ['REQUESTER','SURVEY_MANAGER','TENANT_ADMIN'] as const)await assert.rejects(progressCad(tickets,cad,db,{...params,actor:{...actor,actorRole}}),ForbiddenError);
  await assert.rejects(progressCad({...tickets,findById:async()=>null},cad,db,params),NotFoundError);
  await assert.rejects(progressCad({...tickets,findActiveProjectCrewBuild:async()=>null},cad,db,params),ConflictError);
  await assert.rejects(progressCad(tickets,{...cad,lock:async()=>[{...record,assignedTo:null}]},db,params),ForbiddenError);
  for(const status of ['NOT_REQUIRED','IN_PROGRESS','QA_PENDING','COMPLETE'] as const)await assert.rejects(progressCad(tickets,{...cad,lock:async()=>[{...record,status}]},db,params),ConflictError);
  await assert.rejects(progressCad(tickets,cad,db,{...params,action:'SUBMIT_QA'}),ConflictError);
  await assert.rejects(progressCad(tickets,{...cad,lock:async()=>[]},db,params),NotFoundError);
  await assert.rejects(progressCad(tickets,{...cad,lock:async()=>[record,record]},db,params),ConflictError);
  await assert.rejects(progressCad(tickets,{...cad,advance:async()=>false},db,params),ConflictError);
});
