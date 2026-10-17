import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {runLifecycleSchemaAcceptance} from './account-offboarding-postgres';
import {TenancyRepository} from '../../src/modules/tenancy/infrastructure/tenancy.repository';
import {NotificationRepository} from '../../src/modules/notification/infrastructure';
import {TicketRepository} from '../../src/modules/ticket/infrastructure/ticket.repository';
import {buildVisibilityClause} from '../../src/lib/ticket-visibility-clause';
import type {UUID} from '../../src/shared/types';
runLifecycleSchemaAcceptance(async(db,f)=>{
  let checks=0;
  const membership=(await db.query('SELECT * FROM project_memberships WHERE project_id=$1 AND user_id=$2',[f.project,f.subject])).rows[0];
  await db.query('UPDATE project_memberships SET access_disabled_at=NOW(),access_disabled_by=$3 WHERE project_id=$1 AND user_id=$2',[f.project,f.subject,f.actor]);
  const before=(await db.query('SELECT row_to_json(pm) AS state FROM project_memberships pm WHERE project_id=$1 AND user_id=$2',[f.project,f.subject])).rows[0].state;
  await assert.rejects(new TenancyRepository().saveMembership(db,{
    id:randomUUID() as UUID,tenantId:f.tenant as UUID,projectId:f.project as UUID,
    userId:f.subject as UUID,role:'VIEWER',createdAt:new Date(),
  }),{type:'ConflictError'});
  assert.deepEqual((await db.query('SELECT row_to_json(pm) AS state FROM project_memberships pm WHERE project_id=$1 AND user_id=$2',[f.project,f.subject])).rows[0].state,before);checks++;
  const notifications=new NotificationRepository();
  await assert.rejects(notifications.reassignOrphanWorkflowTicket(db,{
    tenantId:f.tenant as UUID,ticketId:randomUUID() as UUID,expectedRowVersion:0,
    fallbackProjectAdminId:f.actor as UUID,assignedPartyChiefOrphaned:true,
    assignedInstrumentManOrphaned:false,surveyLeadOrphaned:true,
  }),/retired/);checks++;
  const area=randomUUID(),level=randomUUID();
  await db.query("INSERT INTO aor_levels(id,tenant_id,project_id,depth,label) VALUES($1,$2,$3,0,'Area')",[level,f.tenant,f.project]);
  await db.query("INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,name,code) VALUES($1,$2,$3,$4,'Synthetic Area','SYN')",[area,f.tenant,f.project,level]);
  await db.query("UPDATE tickets SET aor_node_id=$2,ticket_type='LAYOUT',requested_date=CURRENT_DATE WHERE tenant_id=$1",[f.tenant,area]);
  await db.query("UPDATE tickets SET status='ASSIGNED',assigned_party_chief_id=$2 WHERE tenant_id=$1",[f.tenant,f.subject]);
  const orphans=await notifications.listOrphanWorkflowCandidates(db);
  assert.equal(orphans.length,1);assert.equal(orphans[0]!.assignedPartyChiefOrphaned,true);checks++;
  const original=(await db.query('SELECT * FROM tickets WHERE tenant_id=$1',[f.tenant])).rows[0];
  assert.equal(original.assigned_party_chief_id,f.subject);checks++;
  await db.query("UPDATE tickets SET status='DRAFT' WHERE tenant_id=$1",[f.tenant]);
  for(const actorRole of ['SURVEY_MANAGER','VIEWER','CAD_LEAD','CAD_TECHNICIAN'] as const){
    const clause=buildVisibilityClause({actorRole,actorId:f.actor as UUID,companyId:original.company_id},2);
    assert.equal((await db.query('SELECT t.id FROM tickets t WHERE t.tenant_id=$1 '+clause.sql,[f.tenant,...clause.params])).rows.length,0);checks++;
    const owner=buildVisibilityClause({actorRole,actorId:f.subject as UUID,companyId:original.company_id},2);
    assert.equal((await db.query('SELECT t.id FROM tickets t WHERE t.tenant_id=$1 '+owner.sql,[f.tenant,...owner.params])).rows.length,1);checks++;
  }
  assert.equal(await new TicketRepository().isActiveProjectMemberWithRole(db,f.tenant as UUID,f.project as UUID,f.subject as UUID,['SURVEY_MANAGER']),false);checks++;
  assert.equal(membership.role,'SURVEY_MANAGER');
  console.log('Phase5 review PostgreSQL checks passed: '+checks);
}).catch(error=>{console.error(error);process.exitCode=1;});