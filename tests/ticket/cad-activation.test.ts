import assert from 'node:assert/strict';
import test from 'node:test';
import { activateCad, type CadActivationPort } from '@/modules/ticket/application/activate-cad';
import type { ITicketRepository, VisibilityScope } from '@/modules/ticket/application/ports';
import type { Ticket } from '@/modules/ticket/domain/types';
import type { DbClient, UUID } from '@/shared/types';
import { ConflictError, ForbiddenError, NotFoundError } from '@/shared/errors';
const id='00000000-0000-0000-0000-000000000001' as UUID;
const other='00000000-0000-0000-0000-000000000002' as UUID;
const actor:VisibilityScope={actorId:id,actorRole:'CAD_LEAD',companyId:id,companyType:'GC'};
const params={tenantId:id,ticketId:id,actor,assigneeId:other};
const ticket={id,tenantId:id,projectId:id,companyId:id,status:'COMPLETED'} as Ticket;
const tickets={findById:async()=>ticket,findByIdInternal:async()=>ticket,findActiveProjectCrewBuild:async()=> 'FULL',
  isProjectAssignee:async()=>true,findUserCompanyInfo:async()=>({companyId:id,companyType:'GC'})} as unknown as ITicketRepository;
const record={id,status:'NOT_REQUIRED' as const,assignedTo:null,completedAt:null};
test('CAD Lead activates and assigns work before emitting the transition event',async()=>{
  const writes:string[]=[];
  const db:DbClient={async query(_sql,values){assert.equal(values?.[4],'cad.status_changed');
    assert.deepEqual(JSON.parse(String(values?.[5])),{oldStatus:'NOT_REQUIRED',newStatus:'NOT_STARTED',assignedTo:other});
    writes.push('audit');return {rows:[]};}};
  const cad:CadActivationPort={lock:async()=>[record],activate:async(_db,tenant,key,user)=>{
    assert.equal(tenant,id);assert.equal(key,id);assert.equal(user,other);writes.push('activate');return true;}};
  assert.deepEqual(await activateCad(tickets,cad,db,params),{status:'NOT_STARTED',assignedTo:other,completedAt:null});
  assert.deepEqual(writes,['activate','audit']);assert.equal(ticket.status,'COMPLETED');
  const leadOnly={...tickets,isProjectAssignee:async(_db:DbClient,t:UUID,p:UUID,u:UUID,role:string)=>{
    assert.deepEqual([t,p,u],[id,id,other]);return role==='CAD_LEAD';}};
  await activateCad(leadOnly,cad,db,params);
});
test('CAD activation rejects invisible tickets, invalid states and inaccessible assignees without mutation',async()=>{
  const db:DbClient={async query(){throw new Error('Unexpected write');}};
  const cad:CadActivationPort={lock:async()=>[record],activate:async()=>{throw new Error('Unexpected write');}};
  for(const actorRole of ['CAD_TECHNICIAN','SURVEY_MANAGER','TENANT_ADMIN','REQUESTER'] as const)
    await assert.rejects(activateCad(tickets,cad,db,{...params,actor:{...actor,actorRole}}),ForbiddenError);
  await assert.rejects(activateCad({...tickets,findById:async()=>null},cad,db,params),NotFoundError);
  await assert.rejects(activateCad({...tickets,findActiveProjectCrewBuild:async()=>null},cad,db,params),ConflictError);
  for(const status of ['DRAFT','REJECTED','REQUESTER_CANCELED','FIELD_CANCELED','SURVEY_CANCELED'] as const)
    await assert.rejects(activateCad({...tickets,findByIdInternal:async()=>({...ticket,status})},cad,db,params),ConflictError);
  for(const status of ['NOT_STARTED','IN_PROGRESS','QA_PENDING','COMPLETE'] as const)
    await assert.rejects(activateCad(tickets,{...cad,lock:async()=>[{...record,status}]},db,params),ConflictError);
  await assert.rejects(activateCad(tickets,{...cad,lock:async()=>[{...record,assignedTo:other}]},db,params),ConflictError);
  await assert.rejects(activateCad(tickets,{...cad,lock:async()=>[]},db,params),NotFoundError);
  await assert.rejects(activateCad(tickets,{...cad,lock:async()=>[record,record]},db,params),ConflictError);
  await assert.rejects(activateCad({...tickets,isProjectAssignee:async()=>false},cad,db,params),ForbiddenError);
  await assert.rejects(activateCad({...tickets,findUserCompanyInfo:async()=>null},cad,db,params),ForbiddenError);
  await assert.rejects(activateCad({...tickets,findUserCompanyInfo:async()=>({companyId:other,companyType:'SUBCONTRACTOR'})},cad,db,params),ForbiddenError);
  await assert.rejects(activateCad(tickets,{...cad,activate:async()=>false},db,params),ConflictError);
});
