import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { getCadSummary, canSignOffCad, getCadProgressAction } from '@/modules/ticket/application/cad-summary';
import { CadSummaryRepository } from '@/modules/ticket/infrastructure/cad-summary.repository';
import type { ITicketRepository, VisibilityScope } from '@/modules/ticket/application/ports';
import type { Ticket } from '@/modules/ticket/domain/types';
import type { DbClient, UUID } from '@/shared/types';
import { ConflictError, NotFoundError } from '@/shared/errors';
const id=()=>randomUUID() as UUID;
const tenant=id(),ticketId=id();
const actor:VisibilityScope={actorId:id(),actorRole:'CAD_TECHNICIAN',companyId:id(),companyType:'GC'};
const params={tenantId:tenant,ticketId,actor};
const db:DbClient={async query(){throw new Error('Unexpected query');}};

test('CAD sign-off capability requires lead, pending review, same-company visibility and active project',async()=>{
  const tickets={findActiveProjectCrewBuild:async()=> 'FULL'} as unknown as ITicketRepository;
  const ticket={tenantId:tenant,projectId:id(),companyId:actor.companyId} as Ticket;
  const lead={...actor,actorRole:'CAD_LEAD' as const};
  const pending={status:'QA_PENDING' as const,assignedTo:null,reviewedBy:null,completedAt:null};
  assert.equal(await canSignOffCad(tickets,db,ticket,pending,lead),true);
  for(const actorRole of ['CAD_TECHNICIAN','SURVEY_MANAGER','TENANT_ADMIN','REQUESTER'] as const)assert.equal(await canSignOffCad(tickets,db,ticket,pending,{...lead,actorRole}),false);
  for(const status of ['NOT_REQUIRED','NOT_STARTED','IN_PROGRESS','COMPLETE'] as const)assert.equal(await canSignOffCad(tickets,db,ticket,{...pending,status},lead),false);
  assert.equal(await canSignOffCad(tickets,db,ticket,null,lead),false);
  assert.equal(await canSignOffCad(tickets,db,ticket,pending,{...lead,companyType:'SUBCONTRACTOR',companyId:id()}),false);
  assert.equal(await canSignOffCad({...tickets,findActiveProjectCrewBuild:async()=>null},db,ticket,pending,lead),false);
  await assert.rejects(canSignOffCad({...tickets,findActiveProjectCrewBuild:async()=>{throw new Error('offline');}},db,ticket,pending,lead),/offline/);
});

test('CAD summary authorizes ticket visibility before retrieving CAD and detects duplicate records',async()=>{
  let reads=0;
  const cad={async find(_db:DbClient,tenantId:UUID,key:UUID){assert.equal(tenantId,tenant);assert.equal(key,ticketId);reads++;return [{status:'QA_PENDING' as const,assignedTo:null,reviewedBy:null,completedAt:null}];}};
  const hidden={findById:async()=>null} as unknown as ITicketRepository;
  await assert.rejects(getCadSummary(hidden,cad,db,params),NotFoundError);assert.equal(reads,0);
  const visible={findById:async(_db:DbClient,t:UUID,key:UUID,scope:VisibilityScope)=>{
    assert.equal(t,tenant);assert.equal(key,ticketId);assert.equal(scope,actor);return {id:ticketId} as Ticket;
  }} as unknown as ITicketRepository;
  assert.deepEqual(await getCadSummary(visible,cad,db,params),{status:'QA_PENDING',assignedTo:null,reviewedBy:null,completedAt:null});
  assert.equal(await getCadSummary(visible,{find:async()=>[]},db,params),null);
  await assert.rejects(getCadSummary(visible,{find:async()=>[{status:'NOT_REQUIRED',assignedTo:null,reviewedBy:null,completedAt:null},{status:'COMPLETE',assignedTo:null,reviewedBy:null,completedAt:new Date()}]},db,params),ConflictError);
  await assert.rejects(getCadSummary(visible,{find:async()=>{throw new Error('offline');}},db,params),/offline/);
});

test('PostgreSQL CAD summary is tenant/ticket scoped and returns recorded status and completion',
  {skip:!process.env.DATABASE_URL},async()=>{
    const client=new Client({connectionString:process.env.DATABASE_URL});await client.connect();await client.query('BEGIN');
    const project=id(),company=id(),user=id();
    try {
      await client.query("INSERT INTO tenants(id,name) VALUES($1,'CAD summary')",[tenant]);
      await client.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'GC','GC')",[company,tenant]);
      await client.query("INSERT INTO projects(id,tenant_id,name) VALUES($1,$2,'Project')",[project,tenant]);
      await client.query("INSERT INTO users(id,tenant_id,company_id,email,name) VALUES($1,$2,$3,$4,'CAD user')",[user,tenant,company,user+'@example.test']);
      await client.query("INSERT INTO tickets(id,tenant_id,project_id,company_id,requester_id,workflow_variant,status) VALUES($1,$2,$3,$4,$5,'STANDARD_APPROVAL','DRAFT')",[ticketId,tenant,project,company,user]);
      await client.query("INSERT INTO cad_work(ticket_id,tenant_id,cad_status,cad_completed_at) VALUES($1,$2,'COMPLETE','2026-09-25T12:00:00Z')",[ticketId,tenant]);
      const repo=new CadSummaryRepository();
      assert.deepEqual(await repo.find(client,tenant,ticketId),[{status:'COMPLETE',assignedTo:null,reviewedBy:null,completedAt:new Date('2026-09-25T12:00:00Z')}]);
      await client.query('UPDATE cad_work SET cad_assigned_to=$3,cad_reviewed_by=$3 WHERE tenant_id=$1 AND ticket_id=$2',[tenant,ticketId,user]);
      const saved=(await repo.find(client,tenant,ticketId))[0]!;
      assert.equal(saved.assignedTo,user);assert.equal(saved.reviewedBy,user);
      assert.deepEqual(await repo.find(client,id(),ticketId),[]);
      assert.deepEqual(await repo.find(client,tenant,id()),[]);
    } finally {await client.query('ROLLBACK');await client.end();}
  });


test('CAD progression controls follow assignment, role, status, company and project availability',async()=>{
  const tickets={findActiveProjectCrewBuild:async()=> 'FULL'} as unknown as ITicketRepository;
  const ticket={tenantId:tenant,projectId:id(),companyId:actor.companyId,status:'COMPLETED'} as Ticket;
  const cad={status:'NOT_STARTED' as const,assignedTo:actor.actorId,completedAt:null};
  for(const actorRole of ['CAD_TECHNICIAN','CAD_LEAD'] as const) {
    assert.equal(await getCadProgressAction(tickets,db,ticket,cad,{...actor,actorRole}),'START');
    assert.equal(await getCadProgressAction(tickets,db,ticket,{...cad,status:'IN_PROGRESS'},{...actor,actorRole}),'SUBMIT_QA');
  }
  for(const actorRole of ['SURVEY_MANAGER','TENANT_ADMIN','REQUESTER'] as const)
    assert.equal(await getCadProgressAction(tickets,db,ticket,cad,{...actor,actorRole}),null);
  for(const status of ['NOT_REQUIRED','QA_PENDING','COMPLETE'] as const)
    assert.equal(await getCadProgressAction(tickets,db,ticket,{...cad,status},actor),null);
  for(const assignedTo of [null,id()])
    assert.equal(await getCadProgressAction(tickets,db,ticket,{...cad,assignedTo},actor),null);
  assert.equal(await getCadProgressAction(tickets,db,ticket,null,actor),null);
  assert.equal(await getCadProgressAction(tickets,db,ticket,cad,{...actor,companyType:'SUBCONTRACTOR',companyId:id()}),null);
  assert.equal(await getCadProgressAction({...tickets,findActiveProjectCrewBuild:async()=>null},db,ticket,cad,actor),null);
  await assert.rejects(getCadProgressAction({...tickets,findActiveProjectCrewBuild:async()=>{throw new Error('offline');}},db,ticket,cad,actor),/offline/);
});
