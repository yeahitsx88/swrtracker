import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {runLifecycleSchemaAcceptance} from './account-offboarding-postgres';
import {TicketRepository} from '../../src/modules/ticket/infrastructure/ticket.repository';
import {assignTicket} from '../../src/modules/ticket/application/assign-ticket';
import {createDirectAssignmentTicket} from '../../src/modules/ticket/application/create-direct-assignment-ticket';
import type {UUID} from '../../src/shared/types';

runLifecycleSchemaAcceptance(async(db,f)=>{
 const repo=new TicketRepository(),company=randomUUID(),chief=randomUUID(),im=randomUUID(),requester=randomUUID();let checks=0;
 await db.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'Retained subcontractor','SUBCONTRACTOR')",[company,f.tenant]);
 for(const [id,role] of [[chief,'PARTY_CHIEF'],[im,'INSTRUMENT_MAN'],[requester,'REQUESTER']]){
  await db.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,'Retained role','fixture')",[id,f.tenant,company,id+'@example.test']);
  await db.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)',[f.project,id,role]);
 }
 assert.equal(await repo.isActiveProjectMemberWithRole(db,f.tenant as UUID,f.project as UUID,chief as UUID,['PARTY_CHIEF']),false);checks++;
 assert.equal(await repo.isActiveProjectMemberWithRole(db,f.tenant as UUID,f.project as UUID,im as UUID,['INSTRUMENT_MAN']),false);checks++;
 assert.equal(await repo.isActiveProjectMemberWithRole(db,f.tenant as UUID,f.project as UUID,requester as UUID,['REQUESTER']),true);checks++;
 const gc=(await db.query('SELECT company_id FROM users WHERE id=$1',[f.subject])).rows[0].company_id;
 const ticket=randomUUID(),area=randomUUID(),department=randomUUID();
 const level=randomUUID();
 await db.query("INSERT INTO aor_levels(id,tenant_id,project_id,depth,label) VALUES($1,$2,$3,0,'Area')",[level,f.tenant,f.project]);
 await db.query("INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,code,name) VALUES($1,$2,$3,$4,'ELIG','Eligibility Area')",[area,f.tenant,f.project,level]);
 await db.query("INSERT INTO tickets(id,tenant_id,project_id,company_id,requester_id,aor_node_id,ticket_type,requested_date,workflow_variant,status,craft,description) VALUES($1,$2,$3,$4,$5,$6,'LAYOUT',NOW(),'STANDARD_APPROVAL','APPROVED','Survey','Eligibility fixture')",[ticket,f.tenant,f.project,gc,requester,area]);
 await db.query("INSERT INTO departments(id,tenant_id,project_id,name,manager_title,created_by) VALUES($1,$2,$3,'Eligibility department','Manager',$4)",[department,f.tenant,f.project,f.subject]);
 const actor={tenantId:f.tenant as UUID,projectId:f.project as UUID,actorId:f.subject as UUID,actorRole:'SURVEY_MANAGER' as const};
 for(const crew of [{assignedPartyChiefId:chief as UUID,assignedInstrumentManId:null},{assignedPartyChiefId:null,assignedInstrumentManId:im as UUID}]){
  await assert.rejects(assignTicket(repo,db,{...actor,ticketId:ticket as UUID,...crew,surveyLeadId:actor.actorId}),/must be an active/);checks++;
 }
 for(const crew of [{assignedPartyChiefId:chief as UUID,assignedInstrumentManId:im as UUID},{assignedPartyChiefId:null,assignedInstrumentManId:im as UUID}]){
  await assert.rejects(createDirectAssignmentTicket(repo,db,{...actor,aorNodeId:area as UUID,requesterId:requester as UUID,...crew,departmentId:department as UUID,ticketType:'LAYOUT',craft:'Survey',description:'Synthetic direct assignment',requestedDate:new Date()}),/must be an active/);checks++;
 }
 assert.equal((await db.query('SELECT status,assigned_party_chief_id,assigned_instrument_man_id FROM tickets WHERE id=$1',[ticket])).rows[0].status,'APPROVED');checks++;
 assert.equal((await db.query('SELECT count(*)::int n FROM ticket_assignment_history WHERE ticket_id=$1',[ticket])).rows[0].n,0);checks++;
 for(const type of ['GC','OWNER_REP']){
  await db.query('UPDATE companies SET type=$2 WHERE id=$1',[company,type]);
  assert.equal(await repo.isActiveProjectMemberWithRole(db,f.tenant as UUID,f.project as UUID,chief as UUID,['PARTY_CHIEF']),true);checks++;
  assert.equal(await repo.isActiveProjectMemberWithRole(db,f.tenant as UUID,f.project as UUID,im as UUID,['INSTRUMENT_MAN']),true);checks++;
 }
 console.log('Ticket assignee eligibility PostgreSQL checks passed: '+checks);
}).catch(error=>{console.error(error);process.exitCode=1;});
