import { activateCad } from '@/modules/ticket/application/activate-cad';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { signOffCad, type CadReviewPort } from '@/modules/ticket/application/sign-off-cad';
import { progressCad } from '@/modules/ticket/application/progress-cad';
import { CadReviewRepository } from '@/modules/ticket/infrastructure/cad-review.repository';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import type { ITicketRepository, VisibilityScope } from '@/modules/ticket/application/ports';
import type { Ticket } from '@/modules/ticket/domain/types';
import type { DbClient, UUID } from '@/shared/types';
import { ConflictError, ForbiddenError, NotFoundError } from '@/shared/errors';
const id=()=>randomUUID() as UUID;
const tenant=id(),project=id(),key=id(),user=id(),company=id();
const actor:VisibilityScope={actorId:user,actorRole:'CAD_LEAD',companyId:company,companyType:'GC'};
const params={tenantId:tenant,ticketId:key,actor};
const ticket={id:key,tenantId:tenant,projectId:project,status:'COMPLETED'} as Ticket;

test('CAD sign-off is lead-only, requires visibility and pending QA, and writes both events',async()=>{
  const events:string[]=[];
  const db:DbClient={async query(_sql,values){events.push(String(values?.[4]));return {rows:[]};}};
  const tickets={findById:async()=>ticket,findByIdInternal:async()=>ticket,
    findActiveProjectCrewBuild:async()=> 'FULL'} as unknown as ITicketRepository;
  const record={id:id(),status:'QA_PENDING' as const,completedAt:null};
  const cad:CadReviewPort={lock:async()=>[record],complete:async()=>{events.push('complete');return true;}};
  for(const actorRole of ['CAD_TECHNICIAN','SURVEY_MANAGER','TENANT_ADMIN','REQUESTER'] as const)await assert.rejects(signOffCad(tickets,cad,db,{...params,actor:{...actor,actorRole}}),ForbiddenError);
  await assert.rejects(signOffCad({...tickets,findById:async()=>null},cad,db,params),NotFoundError);
  await assert.rejects(signOffCad({...tickets,findActiveProjectCrewBuild:async()=>null},cad,db,params),ConflictError);
  for(const status of ['NOT_REQUIRED','NOT_STARTED','IN_PROGRESS','COMPLETE'] as const)await assert.rejects(signOffCad(tickets,{...cad,lock:async()=>[{...record,status}]},db,params),ConflictError);
  await assert.rejects(signOffCad(tickets,{...cad,lock:async()=>[]},db,params),NotFoundError);
  await assert.rejects(signOffCad(tickets,{...cad,lock:async()=>[record,record]},db,params),ConflictError);
  assert.deepEqual(events,[]);
  const result=await signOffCad(tickets,cad,db,params);
  assert.equal(result.status,'COMPLETE');assert.ok(result.completedAt instanceof Date);
  assert.deepEqual(events,['complete','cad.status_changed','cad.qa_signed_off']);
  await assert.rejects(signOffCad(tickets,{...cad,complete:async()=>false},db,params),ConflictError);
});

test('PostgreSQL CAD sign-off preserves field state and rolls back if the second audit event fails',
  {skip:!process.env.DATABASE_URL},async()=>{
    const db=new Client({connectionString:process.env.DATABASE_URL});await db.connect();await db.query('BEGIN');
    const node=id(),level=id();const tickets=new TicketRepository(),cad=new CadReviewRepository();
    try {
      await db.query("INSERT INTO tenants(id,name) VALUES($1,'CAD review')",[tenant]);
      await db.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'GC','GC')",[company,tenant]);
      await db.query("INSERT INTO projects(id,tenant_id,name,status) VALUES($1,$2,'CAD','ACTIVE')",[project,tenant]);
      await db.query("INSERT INTO users(id,tenant_id,company_id,email,name) VALUES($1,$2,$3,$4,'Lead')",[user,tenant,company,user+'@example.test']);
      await db.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'CAD_LEAD')",[project,user]);
      await db.query("INSERT INTO aor_levels(id,tenant_id,project_id,depth,label) VALUES($1,$2,$3,0,'Unit')",[level,tenant,project]);
      await db.query("INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,name,code) VALUES($1,$2,$3,$4,'Unit','U1')",[node,tenant,project,level]);
      await db.query(`INSERT INTO tickets(id,tenant_id,project_id,company_id,requester_id,aor_node_id,
        workflow_variant,status,ticket_number,ticket_type,craft,description,requested_date)
        VALUES($1,$2,$3,$4,$5,$6,'STANDARD_APPROVAL','COMPLETED','FSS-U1-CAD','AS_BUILT','CAD','Review',NOW())`,[key,tenant,project,company,user,node]);
      await db.query("INSERT INTO cad_work(tenant_id,ticket_id,cad_status) VALUES($1,$2,'QA_PENDING')",[tenant,key]);
      await assert.rejects(signOffCad(tickets,cad,db,{...params,tenantId:id()}),NotFoundError);
      await assert.rejects(signOffCad(tickets,cad,db,{...params,actor:{...actor,companyType:'SUBCONTRACTOR',companyId:id()}}),NotFoundError);
      await db.query('SAVEPOINT before_review');
      const failure:DbClient={async query(sql,values){
        if(values?.[4]==='cad.qa_signed_off')throw new Error('audit failed');
        return db.query(sql,values);
      }};
      await assert.rejects(signOffCad(tickets,cad,failure,params),/audit failed/);
      await db.query('ROLLBACK TO SAVEPOINT before_review');
      assert.equal((await cad.lock(db,tenant,key))[0]?.status,'QA_PENDING');
      assert.equal((await db.query('SELECT 1 FROM ticket_events WHERE tenant_id=$1 AND ticket_id=$2',[tenant,key])).rows.length,0);
      await db.query("UPDATE cad_work SET cad_status='NOT_REQUIRED' WHERE tenant_id=$1 AND ticket_id=$2",[tenant,key]);
      await db.query('SAVEPOINT before_activation');
      const activationFailure:DbClient={async query(sql,values){
        if(sql.includes('INSERT INTO ticket_events'))throw new Error('activation audit failed');
        return db.query(sql,values);
      }};
      await assert.rejects(activateCad(tickets,cad,activationFailure,{...params,assigneeId:user}),/activation audit failed/);
      await db.query('ROLLBACK TO SAVEPOINT before_activation');
      assert.equal((await cad.lock(db,tenant,key))[0]?.status,'NOT_REQUIRED');
      assert.equal((await cad.lock(db,tenant,key))[0]?.assignedTo,null);
      await assert.rejects(activateCad(tickets,cad,db,{...params,assigneeId:id()}),/active project CAD user/);
      await assert.rejects(activateCad(tickets,cad,db,{...params,tenantId:id(),assigneeId:user}),NotFoundError);
      await assert.rejects(activateCad(tickets,cad,db,{...params,actor:{...actor,companyType:'SUBCONTRACTOR',companyId:id()},assigneeId:user}),NotFoundError);
      await db.query('UPDATE users SET deactivated_at=NOW() WHERE tenant_id=$1 AND id=$2',[tenant,user]);
      await assert.rejects(activateCad(tickets,cad,db,{...params,assigneeId:user}),/active project CAD user/);
      await db.query('UPDATE users SET deactivated_at=NULL WHERE tenant_id=$1 AND id=$2',[tenant,user]);
      await db.query("UPDATE project_memberships SET role='VIEWER' WHERE project_id=$1 AND user_id=$2",[project,user]);
      await assert.rejects(activateCad(tickets,cad,db,{...params,assigneeId:user}),/active project CAD user/);
      await db.query("UPDATE project_memberships SET role='CAD_TECHNICIAN' WHERE project_id=$1 AND user_id=$2",[project,user]);
      await activateCad(tickets,cad,db,{...params,assigneeId:user});
      await db.query("UPDATE project_memberships SET role='CAD_LEAD' WHERE project_id=$1 AND user_id=$2",[project,user]);
      await assert.rejects(activateCad(tickets,cad,db,{...params,assigneeId:user}),ConflictError);
      await db.query('SAVEPOINT before_progress');
      const progressFailure:DbClient={async query(sql,values){
        if(sql.includes('INSERT INTO ticket_events'))throw new Error('progress audit failed');
        return db.query(sql,values);
      }};
      await assert.rejects(progressCad(tickets,cad,progressFailure,{...params,action:'START'}),/progress audit failed/);
      await db.query('ROLLBACK TO SAVEPOINT before_progress');
      assert.equal((await cad.lock(db,tenant,key))[0]?.status,'NOT_STARTED');
      await progressCad(tickets,cad,db,{...params,action:'START'});
      await progressCad(tickets,cad,db,{...params,action:'SUBMIT_QA'});
      await signOffCad(tickets,cad,db,params);
      const saved=(await db.query('SELECT cad_status,cad_reviewed_by,cad_completed_at FROM cad_work WHERE tenant_id=$1 AND ticket_id=$2',[tenant,key])).rows[0];
      assert.equal(saved.cad_status,'COMPLETE');assert.equal(saved.cad_reviewed_by,user);assert.ok(saved.cad_completed_at);
      assert.equal((await tickets.findByIdInternal(db,tenant,key))?.status,'COMPLETED');
      await assert.rejects(signOffCad(tickets,cad,db,params),ConflictError);
      assert.equal((await db.query('SELECT 1 FROM ticket_events WHERE tenant_id=$1 AND ticket_id=$2',[tenant,key])).rows.length,5);
    } finally {await db.query('ROLLBACK');await db.end();}
  });
