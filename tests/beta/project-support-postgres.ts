import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {runLifecycleSchemaAcceptance} from './account-offboarding-postgres';
import {createSupport,readSupport,supportDetail,updateSupport} from '../../src/modules/support/application/help-desk';
import {restoreProjectMember} from '../../src/modules/tenancy/application/restore-project-member';
import {setProjectAdministrator} from '../../src/modules/tenancy/application/project-administration';
import {lockDraftActor} from '../../src/modules/ticket/application/draft-access';
import {executeIdempotentHttpMutation} from '../../src/lib/idempotency';
import type {UUID} from '../../src/shared/types';
runLifecycleSchemaAcceptance(async(db,f)=>{
 await db.query(await readFile('db/migrations/032_administrative_events.sql','utf8'));
 const admin={tenantId:f.tenant as UUID,userId:f.actor as UUID,sessionVersion:1},project=f.project as UUID;
 const company=(await db.query('SELECT company_id FROM users WHERE id=$1',[f.actor])).rows[0].company_id;
 await db.query('INSERT INTO project_companies(tenant_id,project_id,company_id,associated_by) VALUES($1,$2,$3,$4)',[f.tenant,project,company,f.actor]);
 let checks=0;async function refuses(fn:()=>Promise<unknown>,type:string){await db.query('SAVEPOINT negative_support');try{await assert.rejects(fn,{type});}finally{await db.query('ROLLBACK TO SAVEPOINT negative_support');}checks++;}
 await refuses(()=>setProjectAdministrator(db,admin,project,f.subject as UUID,true),'ForbiddenError');
 const actors:Record<string,typeof admin>={};
 for(const role of ['SURVEY_MANAGER','SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN','REQUESTER','VIEWER']){
  const id=randomUUID() as UUID;await db.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,$5,'fixture')",[id,f.tenant,company,id+'@example.test',role]);await db.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)',[project,id,role]);actors[role]={...admin,userId:id};
 }
 let target:UUID|undefined;
 for(const [role,actor] of Object.entries(actors)){
  const ticket=await createSupport(db,actor,project,{subject:role+' assistance',description:'Please help investigate this synthetic issue.'});
  assert.equal((await readSupport(db,actor,project,0)).tickets.length,1);checks++;
  const ticketId=ticket.id as UUID;if(role==='REQUESTER')target=ticketId;
  await updateSupport(db,actor,project,ticketId,{version:1,message:'Additional reproduction details.'});checks++;
  await refuses(()=>updateSupport(db,actor,project,ticketId,{version:2,message:'Unauthorized status change.',status:'RESOLVED'}),'ForbiddenError');
  await refuses(()=>readSupport(db,actor,undefined,0),'ForbiddenError');
 }
 assert(target);
 await refuses(()=>supportDetail(db,actors.VIEWER!,project,target),'NotFoundError');
 await refuses(()=>createSupport(db,admin,f.foreignProject as UUID,{subject:'Foreign',description:'Cross-tenant request must fail.'}),'NotFoundError');
 const tickets=await readSupport(db,admin,project,0);assert.equal(tickets.tickets.length,6);assert.equal(tickets.canManage,true);checks++;
 const payload={version:2,message:'Escalating to Tenant Admin with the observed reference.',status:'ESCALATED'};
 const ledger={tenantId:admin.tenantId,actorId:admin.userId,endpoint:'support-fixture',idempotencyKey:randomUUID()};
 const update=()=>executeIdempotentHttpMutation(db,ledger,payload,async()=>({status:200,body:await updateSupport(db,admin,project,target!,payload)}));
 await update();assert.equal((await update()).replayed,true);assert.equal((await supportDetail(db,admin,project,target)).messages.length,2);checks++;
 await refuses(()=>updateSupport(db,admin,project,target!,payload),'ConflictError');
 await db.query("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'TENANT_ADMIN')",[f.tenant,f.actor]);
 assert.equal((await readSupport(db,admin,undefined,0)).tickets[0]!.status,'ESCALATED');checks++;
 await updateSupport(db,admin,project,target,{version:3,message:'Tenant investigation resolved the issue.',status:'RESOLVED'});checks++;
 const requester=actors.REQUESTER!;
 await db.query('UPDATE project_memberships SET access_disabled_at=now(),access_disabled_by=$3 WHERE project_id=$1 AND user_id=$2',[project,requester.userId,f.actor]);
 const stamp=(await db.query('SELECT access_disabled_at::text AS at FROM project_memberships WHERE project_id=$1 AND user_id=$2',[project,requester.userId])).rows[0].at;
 await refuses(()=>restoreProjectMember(db,admin,project,requester.userId,{sessionVersion:1,disabledAt:'stale',reason:'Confirmed return to this project.'}),'ConflictError');
 await restoreProjectMember(db,admin,project,requester.userId,{sessionVersion:1,disabledAt:stamp,reason:'Confirmed return to this project.'});
 assert.equal((await db.query('SELECT session_version FROM users WHERE id=$1',[requester.userId])).rows[0].session_version,2);checks++;
 await refuses(()=>restoreProjectMember(db,admin,project,requester.userId,{sessionVersion:1,disabledAt:stamp,reason:'Duplicate distinct restoration.'}),'ConflictError');
 await refuses(()=>restoreProjectMember(db,actors.VIEWER!,project,requester.userId,{sessionVersion:2,disabledAt:stamp,reason:'Forbidden access restoration.'}),'ForbiddenError');
 await db.query('UPDATE project_memberships SET access_disabled_at=now(),access_disabled_by=$3 WHERE project_id=$1 AND user_id=$2',[project,requester.userId,f.actor]);
 const archivedStamp=(await db.query('SELECT access_disabled_at::text AS at FROM project_memberships WHERE project_id=$1 AND user_id=$2',[project,requester.userId])).rows[0].at;
 await db.query("UPDATE projects SET status='ARCHIVED' WHERE id=$1",[project]);
 const beforeArchived=(await db.query('SELECT count(*)::int n FROM administrative_events')).rows[0].n;
 await refuses(()=>restoreProjectMember(db,admin,project,requester.userId,{sessionVersion:2,disabledAt:archivedStamp,reason:'Archived restoration must remain prohibited.'}),'ConflictError');
 assert.equal((await db.query('SELECT session_version FROM users WHERE id=$1',[requester.userId])).rows[0].session_version,2);checks++;
 assert.equal((await db.query('SELECT count(*)::int n FROM administrative_events')).rows[0].n,beforeArchived);checks++;
 await db.query("UPDATE projects SET status='ACTIVE' WHERE id=$1",[project]);
 const central=randomUUID() as UUID;await db.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,'Central only','fixture')",[central,f.tenant,company,central+'@example.test']);await db.query("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'TENANT_ADMIN')",[f.tenant,central]);
 // Decision23 requires an actual independent grant, even for Tenant Admin.
 await refuses(()=>lockDraftActor(db,{tenantId:admin.tenantId,projectId:project,actorId:central,sessionVersion:1},'PROJECT_ADMIN'),'ForbiddenError');
 await db.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'VIEWER')",[project,central]);
 await refuses(()=>lockDraftActor(db,{tenantId:admin.tenantId,projectId:project,actorId:central,sessionVersion:1},'PROJECT_ADMIN'),'ForbiddenError');
 await setProjectAdministrator(db,admin,project,central,true);
 assert.equal((await db.query('SELECT session_version FROM users WHERE id=$1',[central])).rows[0].session_version,2);checks++;
 await refuses(()=>lockDraftActor(db,{tenantId:admin.tenantId,projectId:project,actorId:central,sessionVersion:1},'PROJECT_ADMIN'),'ForbiddenError');
 await lockDraftActor(db,{tenantId:admin.tenantId,projectId:project,actorId:central,sessionVersion:2},'PROJECT_ADMIN');checks++;
 await refuses(()=>lockDraftActor(db,{tenantId:admin.tenantId,projectId:project,actorId:actors.SURVEY_MANAGER!.userId,sessionVersion:1},'PROJECT_ADMIN'),'ForbiddenError');
 const previous=(await db.query('SELECT count(*)::int n FROM project_support_tickets')).rows[0].n;
 await db.query('SAVEPOINT support_fault');await db.query(`CREATE FUNCTION fail_support_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='support.created' THEN RAISE EXCEPTION 'synthetic support audit failure'; END IF; RETURN NEW; END $$`);await db.query('CREATE TRIGGER support_audit_fault BEFORE INSERT ON administrative_events FOR EACH ROW EXECUTE FUNCTION fail_support_audit()');
 await assert.rejects(createSupport(db,admin,project,{subject:'Rollback assistance',description:'This record must roll back atomically.'}),/synthetic support audit failure/);await db.query('ROLLBACK TO SAVEPOINT support_fault');
 assert.equal((await db.query('SELECT count(*)::int n FROM project_support_tickets')).rows[0].n,previous);checks++;
 console.log('Project support PostgreSQL checks passed: '+checks);
}).catch(error=>{console.error(error);process.exitCode=1;});
