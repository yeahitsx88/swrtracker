import assert from 'node:assert/strict';
import test from 'node:test';
import { canActivateCad, getCadOptions } from '@/modules/ticket/application/cad-options';
import { listCadAssignees, type CadAssigneesPort } from '@/modules/tenancy/application/cad-assignees';
import type { ITicketRepository, VisibilityScope } from '@/modules/ticket/application/ports';
import type { Ticket } from '@/modules/ticket/domain/types';
import type { DbClient, UUID } from '@/shared/types';
import { ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
const id='00000000-0000-0000-0000-000000000001' as UUID;
const actor:VisibilityScope={actorId:id,actorRole:'CAD_LEAD',companyId:id,companyType:'GC'};
const ticket={id,tenantId:id,projectId:id,companyId:id,status:'COMPLETED'} as Ticket;
const tickets={findById:async()=>ticket,findActiveProjectCrewBuild:async()=> 'FULL'} as unknown as ITicketRepository;
const db:DbClient={async query(){throw new Error('Unexpected query');}};
const summary={status:'NOT_REQUIRED' as const,assignedTo:null,reviewedBy:null,completedAt:null};
const cad={find:async()=>[summary]};
const params={tenantId:id,ticketId:id,actor,search:'  Jo  ',limit:1,offset:0};
test('CAD options authorize ticket and constrain candidate scope before paging',async()=>{
  let reads=0;
  const candidates:CadAssigneesPort={list:async(_db,query)=>{
    reads++;assert.deepEqual(query,{tenantId:id,projectId:id,ticketCompanyId:id,search:'Jo',limit:2,offset:0});
    return [{id,name:'Jo'},{id,name:'John'}];}};
  await assert.rejects(getCadOptions({...tickets,findById:async()=>null},cad,candidates,db,params),NotFoundError);
  await assert.rejects(getCadOptions(tickets,cad,candidates,db,{...params,actor:{...actor,actorRole:'CAD_TECHNICIAN'}}),ForbiddenError);
  assert.equal(reads,0);
  assert.deepEqual(await getCadOptions(tickets,cad,candidates,db,params),{candidates:[{id,name:'Jo'}],hasMore:true});
  for(const overrides of [{limit:0},{limit:101},{offset:-1},{offset:0.5},{search:'x'.repeat(201)}])
    await assert.rejects(listCadAssignees(candidates,db,{tenantId:id,projectId:id,ticketCompanyId:id,search:'',limit:1,offset:0,...overrides}),ValidationError);
  assert.equal(reads,1);
});
test('CAD activation hint hides invalid states, wrong roles, company mismatch and inactive projects',async()=>{
  assert.equal(await canActivateCad(tickets,db,ticket,summary,actor),true);
  for(const actorRole of ['CAD_TECHNICIAN','TENANT_ADMIN','SURVEY_MANAGER','REQUESTER'] as const)
    assert.equal(await canActivateCad(tickets,db,ticket,summary,{...actor,actorRole}),false);
  for(const status of ['DRAFT','REJECTED','REQUESTER_CANCELED','FIELD_CANCELED','SURVEY_CANCELED'] as const)
    assert.equal(await canActivateCad(tickets,db,{...ticket,status},summary,actor),false);
  for(const status of ['NOT_STARTED','IN_PROGRESS','QA_PENDING','COMPLETE'] as const)
    assert.equal(await canActivateCad(tickets,db,ticket,{...summary,status},actor),false);
  assert.equal(await canActivateCad(tickets,db,ticket,{...summary,assignedTo:id},actor),false);
  assert.equal(await canActivateCad(tickets,db,ticket,null,actor),false);
  assert.equal(await canActivateCad(tickets,db,ticket,summary,{...actor,companyType:'SUBCONTRACTOR',companyId:'other' as UUID}),false);
  assert.equal(await canActivateCad({...tickets,findActiveProjectCrewBuild:async()=>null},db,ticket,summary,actor),false);
  await assert.rejects(canActivateCad({...tickets,findActiveProjectCrewBuild:async()=>{throw new Error('offline');}},db,ticket,summary,actor),/offline/);
});
