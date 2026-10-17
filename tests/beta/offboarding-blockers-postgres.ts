import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {runLifecycleSchemaAcceptance} from './account-offboarding-postgres';
import {AccountOffboardingRepository} from '../../src/modules/identity/infrastructure/account-offboarding.repository';
import {acquireTenantLifecycleLock} from '../../src/lib/tenant-lifecycle-lock';
import {previewOffboarding,disableAccountAccess} from '../../src/modules/identity/application/account-offboarding';
import type {UUID} from '../../src/shared/types';

runLifecycleSchemaAcceptance(async(db,f)=>{
  const company=(await db.query('SELECT company_id FROM users WHERE id=$1',[f.subject])).rows[0].company_id;
  await db.query('UPDATE users SET deactivated_at=NULL,deactivated_by=NULL,session_version=1 WHERE tenant_id=$1',[f.tenant]);
  await db.query('UPDATE project_memberships SET access_disabled_at=NULL,access_disabled_by=NULL WHERE project_id=$1',[f.project]);
  await db.query("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'TENANT_ADMIN')",[f.tenant,f.actor]);
  const level=randomUUID(),area=randomUUID(),department=randomUUID(),legacy=randomUUID();
  await db.query("INSERT INTO aor_levels(id,tenant_id,project_id,depth,label) VALUES($1,$2,$3,0,'Area')",[level,f.tenant,f.project]);
  await db.query("INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,name,code) VALUES($1,$2,$3,$4,'Blocker Area','B')",[area,f.tenant,f.project,level]);
  await db.query("INSERT INTO departments(id,tenant_id,project_id,name,manager_title,created_by) VALUES($1,$2,$3,'Blocker department','Manager',$4)",[department,f.tenant,f.project,f.actor]);
  await db.query('INSERT INTO department_memberships(tenant_id,project_id,department_id,user_id) VALUES($1,$2,$3,$4)',[f.tenant,f.project,department,f.subject]);
  await db.query("INSERT INTO acting_grants(tenant_id,project_id,user_id,role,trigger,granted_by,granted_reason) VALUES($1,$2,$3,'SURVEY_MANAGER','VACANCY','fixture','Blocker evidence')",[f.tenant,f.project,f.subject]);
  await db.query("UPDATE project_memberships SET designated_acting_for='SURVEY_MANAGER' WHERE user_id=$1",[f.subject]);
  await db.query('INSERT INTO company_authority_grants(tenant_id,project_id,company_id,user_id,granted_by) VALUES($1,$2,$3,$4,$5)',[f.tenant,f.project,company,f.subject,f.actor]);
  await db.query('INSERT INTO help_flags(tenant_id,project_id,raised_by,level) VALUES($1,$2,$3,1)',[f.tenant,f.project,f.subject]);
  await db.query("INSERT INTO areas(id,project_id,tenant_id,name,code) VALUES($1,$2,$3,'Retained legacy Area','LEGACY')",[legacy,f.project,f.tenant]);
  await db.query('INSERT INTO area_memberships(project_id,user_id,area_id) VALUES($1,$2,$3)',[f.project,f.subject,legacy]);
  const ticket=randomUUID();
  await db.query("INSERT INTO tickets(id,tenant_id,project_id,company_id,requester_id,workflow_variant,status,craft,description,aor_node_id,ticket_type,requested_date,assigned_party_chief_id) VALUES($1,$2,$3,$4,$5,'STANDARD_APPROVAL','ASSIGNED','Survey','Live duty',$6,'TOPO','2026-10-01',$5)",[ticket,f.tenant,f.project,company,f.subject,area]);
  await db.query("INSERT INTO cad_work(ticket_id,tenant_id,cad_assigned_to,cad_status) VALUES($1,$2,$3,'QA_PENDING')",[ticket,f.tenant,f.subject]);
  const repo=new AccountOffboardingRepository(),auth={tenantId:f.tenant as UUID,userId:f.actor as UUID,sessionVersion:1};
  await acquireTenantLifecycleLock(db,auth.tenantId,'EXCLUSIVE');
  const scope={kind:'PROJECT_ACCESS' as const,projectId:f.project as UUID};
  const preview=await previewOffboarding(repo,db,auth,scope,f.subject as UUID);
  for(const code of ['DEPARTMENT_RELATIONSHIP','ACTING_GRANT','ACTING_DESIGNATION','COMPANY_AUTHORITY','HELP_FLAG','LEGACY_AREA_MEMBERSHIP','TICKET_DUTY','CAD_DUTY','LAST_SURVEY_MANAGER']) {
    assert.ok(preview.blockers.some(blocker=>blocker.code===code),code);
    console.log('PASS A11_live_'+code);
  }
  await assert.rejects(disableAccountAccess(repo,db,auth,{scope,subjectUserId:f.subject as UUID,snapshot:preview.snapshot,reason:'Confirmed blocker test',confirmed:true,idempotencyKey:randomUUID()}),{code:'OFFBOARDING_BLOCKED'});
  const before=(await db.query('SELECT to_jsonb(t) AS record FROM tickets t ORDER BY id')).rows;
  await db.query("UPDATE projects SET status='ARCHIVED' WHERE id=$1",[f.project]);
  const archived=await previewOffboarding(repo,db,auth,scope,f.subject as UUID);
  assert.deepEqual(archived.blockers,[]);
  await disableAccountAccess(repo,db,auth,{scope,subjectUserId:f.subject as UUID,snapshot:archived.snapshot,reason:'Confirmed archived removal',confirmed:true,idempotencyKey:randomUUID()});
  assert.deepEqual((await db.query('SELECT to_jsonb(t) AS record FROM tickets t ORDER BY id')).rows,before);
  console.log('PASS A39_archived_live_relationships_retained');
}).catch(error=>{console.error(error);process.exitCode=1;});
