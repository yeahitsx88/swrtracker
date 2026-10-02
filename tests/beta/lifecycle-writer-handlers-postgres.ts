import {handleOffboarding} from '../../src/app/api/accounts/[userId]/offboarding/handler';
import {POST as resolveReview} from '../../src/app/api/accounts/offboarding-reviews/[reviewId]/route';
import {POST as setAdmin} from '../../src/app/api/projects/[projectId]/administrators/route';
import {POST as registerCompany} from '../../src/app/api/projects/[projectId]/companies/route';
import {PATCH as selectTemplate} from '../../src/app/api/projects/[projectId]/template/route';
import assert from 'node:assert/strict';
import {Pool,type PoolClient} from 'pg';
import {randomUUID} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import {NextRequest} from 'next/server';
import {getPool} from '../../src/lib/db';
import {signToken,sessionTokenHash} from '../../src/lib/auth';
import {acquireTenantLifecycleLock} from '../../src/lib/tenant-lifecycle-lock';
import {handlePostSurveyStaffing,handlePatchSurveyStaffing} from '../../src/app/api/projects/[projectId]/survey/staffing/handler';
import {handlePostSurveyTeam,handlePatchSurveyRole,handleDeleteSurveyTeam} from '../../src/app/api/projects/[projectId]/survey/teams/handler';
import {handlePostProtectedObligations} from '../../src/app/api/projects/[projectId]/survey/protected-obligations/handler';
import {handlePatchSuperintendentArea} from '../../src/app/api/projects/[projectId]/survey/staffing/superintendent-area-handler';
import {POST as operateNotifications} from '../../src/app/api/projects/[projectId]/notifications/route';
import {POST as addProjectMember} from '../../src/app/api/projects/[projectId]/members/route';
import {POST as grantTenantRole,DELETE as removeTenantRole} from '../../src/app/api/tenant-memberships/route';
import {POST as moveWorkforce} from '../../src/app/api/projects/[projectId]/survey/workforce/route';
import {handlePostDepartments} from '../../src/app/api/projects/[projectId]/departments/handler';
import {handlePostProjectActivation} from '../../src/app/api/projects/[projectId]/activate/handler';
import {handlePostProjectArchive} from '../../src/app/api/projects/[projectId]/archive/handler';
import {handlePostAorAssignments,handleDeleteAorAssignments} from '../../src/app/api/projects/[projectId]/aor/assignments/handler';
import {handlePatchProjectRequestConfig} from '../../src/app/api/projects/[projectId]/request-config/handler';
import {handlePostDepartmentTitles} from '../../src/app/api/projects/[projectId]/departments/[departmentId]/titles/handler';
import {handlePostDepartmentMembers,handlePatchDepartmentMembers} from '../../src/app/api/projects/[projectId]/departments/[departmentId]/members/handler';
import {POST as createAor} from '../../src/app/api/projects/[projectId]/aor/route';
import {POST as inviteUser} from '../../src/app/api/projects/[projectId]/invites/route';
import {POST as grantCompanyAuthority} from '../../src/app/api/projects/[projectId]/company-authority/route';
import {DELETE as revokeCompanyAuthority} from '../../src/app/api/projects/[projectId]/company-authority/[grantId]/route';
import {POST as addWhitelist,DELETE as removeWhitelist} from '../../src/app/api/projects/[projectId]/whitelist/route';
import {POST as createCompany} from '../../src/app/api/companies/route';
import {handlePostProject} from '../../src/app/api/projects/post-handler';
import {handlePostProjectTemplates} from '../../src/app/api/project-templates/handler';
import {PATCH as updateTemplate,DELETE as deleteTemplate} from '../../src/app/api/project-templates/[templateId]/route';
import {POST as startTicket} from '../../src/app/api/tickets/[ticketId]/start/route';
import {POST as createTicket} from '../../src/app/api/tickets/route';
import {DELETE as deleteDraft} from '../../src/app/api/tickets/[ticketId]/draft/route';
import {handlePostTicketAttachments,handleDownloadTicketAttachment} from '../../src/app/api/tickets/[ticketId]/attachments/handler';
import {getTicketRouteContext,withTicketMutation} from '../../src/lib/ticket-route-helpers';
import {TicketRepository} from '../../src/modules/ticket/infrastructure/ticket.repository';
import {AttachmentRepository,validateAttachmentObjectMetadata} from '../../src/modules/attachment/infrastructure';
import type {UUID} from '../../src/shared/types';

async function main(){
 const url=new URL(process.env.DATABASE_URL??'');
 assert.equal(process.env.SWR_TEAM_POSTGRES,'1');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15489');assert.equal(url.pathname,'/swr_team_isolated');
 const schema='offboarding_writers_'+randomUUID().replaceAll('-','');
 assert.match(schema,/^offboarding_writers_[a-f0-9]{32}$/);
 const setup=new Pool({connectionString:url.href,max:1});
 let created=false,pg:Pool|undefined,a:PoolClient|undefined,b:PoolClient|undefined,checks=0;
 const oldSecret=process.env.JWT_SECRET;process.env.JWT_SECRET='writer-family-synthetic-secret';
 const applicationPool=getPool(),oldQuery=applicationPool.query,oldConnect=applicationPool.connect;
 try{
  const db=await setup.connect();
  try{
   await db.query('BEGIN');await db.query('CREATE SCHEMA "'+schema+'"');
   await db.query('SET LOCAL search_path TO "'+schema+'",public');
   for(const migration of (await readdir('db/migrations')).filter(name=>name.endsWith('.sql')&&name<'033_').sort())await db.query(await readFile('db/migrations/'+migration,'utf8'));
   await db.query('COMMIT');created=true;
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
  pg=new Pool({connectionString:url.href,max:5,options:'-c search_path='+schema+',public'});
  const tenant=randomUUID() as UUID,project=randomUUID() as UUID,company=randomUUID() as UUID,actor=randomUUID() as UUID,admin=randomUUID() as UUID;
  await pg.query("INSERT INTO tenants(id,name) VALUES($1,'Writer race fixture')",[tenant]);
  await pg.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'Race GC','GC')",[company,tenant]);
  await pg.query("INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,'Race project','ACTIVE','FULL')",[project,tenant]);
  for(const user of [actor,admin])await pg.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,'Race user','fixture')",[user,tenant,company,user+'@example.test']);
  await pg.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'SURVEY_MANAGER')",[project,actor]);
  await pg.query("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'TENANT_ADMIN')",[tenant,admin]);
  await pg.query("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'TENANT_ADMIN')",[tenant,actor]);
  const ticket=randomUUID();
  await pg.query("INSERT INTO tickets(id,tenant_id,project_id,company_id,requester_id,workflow_variant,status,craft,description) VALUES($1,$2,$3,$4,$5,'STANDARD_APPROVAL','DRAFT','Survey','Writer race ticket')",[ticket,tenant,project,company,actor]);
  for(const state of ['QUEUED','FAILED'])await pg.query("INSERT INTO notification_outbox(tenant_id,ticket_id,recipient_user_id,event_type,payload,idempotency_key,delivery_state) VALUES($1,$2,$3,'SUBMITTED','{}',$4,$5)",[tenant,ticket,actor,'synthetic-'+state,state]);
  a=await pg.connect();b=await pg.connect();
  const holder=a,waiter=b,holderPid=(await a.query('SELECT pg_backend_pid() AS pid')).rows[0].pid,waiterPid=(await b.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  const queries:string[]=[];
  applicationPool.query=pg.query.bind(pg) as typeof applicationPool.query;
  applicationPool.connect=(async()=>({query:async(sql:string,params?:unknown[])=>{
    queries.push(sql);const result=await waiter.query(sql,params);
    if(sql==='BEGIN')await waiter.query('SET LOCAL statement_timeout=6000');
    return result;
  },release:()=>{}})) as typeof applicationPool.connect;
  const nextId=()=>randomUUID(),snapshot='a'.repeat(32),chief=nextId(),im=nextId(),area=nextId(),superintendent=nextId(),link=nextId();
  let storageReads=0;
  const stagedObjects=new Set<string>();
  const uploadDeps={getTicketRouteContext,withTicketMutation,createTicketRepo:()=>new TicketRepository(),
   createAttachmentRepo:()=>new AttachmentRepository(),validateAttachmentMetadata:validateAttachmentObjectMetadata,
   createStorage:()=>({write:async()=>{const storageKey=nextId();stagedObjects.add(storageKey);return{storageKey,contentSha256:'a'.repeat(64)};},
    read:async()=>{storageReads++;return Buffer.from('synthetic bytes');},remove:async(key:string)=>{stagedObjects.delete(key);}})};
  const cases=[
   {name:'project-access-disable',method:'POST',handler:(req:NextRequest)=>handleOffboarding(req,{kind:'PROJECT_ACCESS',projectId:project},chief),mode:'EXCLUSIVE',body:{scope:{kind:'PROJECT_ACCESS',projectId:project},subjectUserId:chief,reason:'Confirmed synthetic disable',snapshot:'a'.repeat(64),confirmed:true}},
   {name:'tenant-account-disable',method:'POST',handler:(req:NextRequest)=>handleOffboarding(req,{kind:'TENANT_ACCOUNT'},chief),mode:'EXCLUSIVE',body:{scope:{kind:'TENANT_ACCOUNT'},subjectUserId:chief,reason:'Confirmed synthetic disable',snapshot:'a'.repeat(64),confirmed:true}},
   {name:'central-review-resolution',method:'POST',handler:resolveReview,mode:'EXCLUSIVE',body:{reviewId:link,disposition:'NO_FURTHER_ACTION',reason:'Synthetic review decision',tenantEventId:null,snapshot:'a'.repeat(64),confirmed:true}},
   {name:'project-admin-grant',method:'POST',handler:setAdmin,mode:'EXCLUSIVE',body:{userId:chief,enabled:true,confirmed:true}},
   {name:'project-company-register',method:'POST',handler:registerCompany,mode:'EXCLUSIVE',body:{name:'Scoped company',type:'GC',confirmed:true}},
   {name:'project-template-select',method:'PATCH',handler:selectTemplate,mode:'EXCLUSIVE',body:{templateId:chief,confirmed:true}},
   {name:'project-member-add',method:'POST',handler:addProjectMember,mode:'EXCLUSIVE',body:{userId:chief,role:'REQUESTER'}},
   {name:'tenant-role-grant',method:'POST',handler:(req:NextRequest)=>grantTenantRole(req),mode:'EXCLUSIVE',body:{userId:chief,role:'BILLING_VIEWER'}},
   {name:'tenant-role-remove',method:'DELETE',handler:(req:NextRequest)=>removeTenantRole(req),mode:'EXCLUSIVE',body:{userId:chief}},
   {name:'notification-capture',method:'POST',handler:operateNotifications,mode:'SHARED',body:{action:'capture'}},
   {name:'notification-retry',method:'POST',handler:operateNotifications,mode:'SHARED',body:{action:'retry-failed'}},
   {name:'staffing-role-and-links',method:'POST',handler:handlePostSurveyStaffing,mode:'EXCLUSIVE',body:{expectedSnapshot:snapshot,partyChiefId:chief,areaId:area,superintendentId:superintendent,instrumentManIds:[im],confirmRoleChanges:true}},
   {name:'staffing-unlink',method:'PATCH',handler:handlePatchSurveyStaffing,mode:'EXCLUSIVE',body:{action:'unlink',kind:'roster',linkId:link,partyChiefId:chief,expectedSnapshot:snapshot,confirmUnlink:true}},
   {name:'team-save',method:'POST',handler:handlePostSurveyTeam,mode:'SHARED',body:{name:'Race team',areaId:area,leadUserId:chief,memberIds:[chief,im]}},
   {name:'team-role',method:'PATCH',handler:handlePatchSurveyRole,mode:'EXCLUSIVE',body:{action:'set-role',userId:chief,role:'INSTRUMENT_MAN',expectedRole:'REQUESTER',expectedRoleVersion:1,confirmRoleChanges:true}},
   {name:'team-delete',method:'DELETE',handler:handleDeleteSurveyTeam,mode:'SHARED',body:{teamId:nextId(),expectedVersion:1,confirmDelete:true}},
   {name:'protected-review-handover',method:'POST',handler:handlePostProtectedObligations,mode:'EXCLUSIVE',body:{userId:superintendent,grantId:nextId(),replacementUserId:nextId(),expectedSnapshot:snapshot,confirmResolution:true,coverageMode:'reuse'}},
   {name:'superintendent-area-unlink',method:'PATCH',handler:handlePatchSuperintendentArea,mode:'EXCLUSIVE',body:{action:'unlink-superintendent-area',superintendentId:superintendent,linkId:link,replacementUserId:nextId(),replacementGrantId:nextId(),replacementAssignmentId:nextId(),expectedSnapshot:snapshot,confirmUnlink:true}},
   {name:'workforce-roster-move',method:'POST',handler:moveWorkforce,mode:'EXCLUSIVE',body:{instrumentManId:im,partyChiefId:chief,expectedSnapshot:snapshot}},
   {name:'department-create',method:'POST',handler:handlePostDepartments,mode:'EXCLUSIVE',body:{name:'Race department',managerTitle:'Race manager'}},
   {name:'project-activate',method:'POST',handler:handlePostProjectActivation,mode:'EXCLUSIVE',body:{acknowledgeWarnings:true}},
   {name:'project-archive',method:'POST',handler:handlePostProjectArchive,mode:'EXCLUSIVE',body:{}},
   {name:'area-user-assignment',method:'POST',handler:handlePostAorAssignments,mode:'EXCLUSIVE',body:{kind:'USER',userId:chief,aorNodeId:area}},
   {name:'area-assignment-end',method:'DELETE',handler:handleDeleteAorAssignments,mode:'EXCLUSIVE',body:{kind:'USER',assignmentId:link}},
   {name:'request-config',method:'PATCH',handler:handlePatchProjectRequestConfig,mode:'EXCLUSIVE',body:{leadTimeEnforcementEnabled:true,leadTimeDays:2,maxAttachmentsPerTicket:null}},
   {name:'department-title',method:'POST',handler:handlePostDepartmentTitles,mode:'EXCLUSIVE',body:{title:'Race title',defaultPriority:'NORMAL',assignmentLayer:'DIRECT'}},
   {name:'department-member',method:'POST',handler:handlePostDepartmentMembers,mode:'EXCLUSIVE',body:{userId:chief}},
   {name:'department-member-title',method:'PATCH',handler:handlePatchDepartmentMembers,mode:'EXCLUSIVE',body:{kind:'ASSIGN_TITLE',userId:chief,title:'Race title'}},
   {name:'area-level',method:'POST',handler:createAor,mode:'EXCLUSIVE',body:{kind:'LEVEL',depth:0,label:'Area'}},
   {name:'invite-user',method:'POST',handler:inviteUser,mode:'EXCLUSIVE',body:{companyId:company,email:'invite@example.test'}},
   {name:'company-authority-grant',method:'POST',handler:grantCompanyAuthority,mode:'EXCLUSIVE',body:{userId:chief}},
   {name:'company-authority-revoke',method:'DELETE',handler:revokeCompanyAuthority,mode:'EXCLUSIVE',body:{}},
   {name:'whitelist-add',method:'POST',handler:addWhitelist,mode:'EXCLUSIVE',body:{email:'allow@example.test'}},
   {name:'whitelist-remove',method:'DELETE',handler:removeWhitelist,mode:'EXCLUSIVE',body:{email:'allow@example.test'}},
   {name:'company-create',method:'POST',handler:(req:NextRequest)=>createCompany(req),mode:'EXCLUSIVE',body:{name:'Company',type:'SUBCONTRACTOR'}},
   {name:'project-create',method:'POST',handler:(req:NextRequest)=>handlePostProject(req),mode:'EXCLUSIVE',body:{name:'Project',crewBuild:'SLIM'}},
   {name:'template-create',method:'POST',handler:(req:NextRequest)=>handlePostProjectTemplates(req),mode:'EXCLUSIVE',body:{name:'Template',crewBuild:'SLIM',aorDepth:1,aorLevelLabels:['Area'],disciplineGroups:[]}},
   {name:'template-update',method:'PATCH',handler:updateTemplate,mode:'EXCLUSIVE',body:{name:'Template',crewBuild:'SLIM',aorDepth:1,aorLevelLabels:['Area'],disciplineGroups:[]}},
   {name:'template-delete',method:'DELETE',handler:deleteTemplate,mode:'EXCLUSIVE',body:{}},
   {name:'ticket-start',method:'POST',handler:startTicket,mode:'SHARED',body:{}},
   {name:'ticket-create',method:'POST',handler:(req:NextRequest)=>createTicket(req),mode:'SHARED',body:{projectId:project,aorNodeId:area,ticketType:'LAYOUT',fieldContact:'Contact',description:'Race ticket',requestedDate:'2026-10-20',workflowVariant:'DIRECT_ASSIGNMENT',requesterId:chief,assignedInstrumentManId:im}},
   {name:'attachment-upload-keyed',method:'POST',handler:(req:NextRequest)=>handlePostTicketAttachments(req,{params:Promise.resolve({ticketId:ticket})},uploadDeps),mode:'SHARED',multipart:true,keyed:true,body:{}},
   {name:'attachment-upload-unkeyed',method:'POST',handler:(req:NextRequest)=>handlePostTicketAttachments(req,{params:Promise.resolve({ticketId:ticket})},uploadDeps),mode:'SHARED',multipart:true,keyed:false,body:{}},
   {name:'attachment-download',method:'GET',handler:(req:NextRequest)=>handleDownloadTicketAttachment(req,{params:Promise.resolve({ticketId:ticket,attachmentId:link})}),mode:'SHARED',body:{}},
   {name:'draft-delete',method:'DELETE',handler:deleteDraft,mode:'SHARED',body:{expectedVersion:0}},
  ] as const;
  const ctx={params:Promise.resolve({ticketId:ticket,projectId:project,departmentId:nextId(),grantId:nextId(),templateId:nextId(),reviewId:link})};
  const rowsBefore=async()=>{
   const state:Record<string,unknown>={};
   for(const table of ['api_idempotency','account_lifecycle_events','account_offboarding_reviews','administrative_notification_outbox','project_admin_grants','project_companies','survey_staffing_events','access_grant_events','administrative_events','aor_assignments','crew_rosters','survey_teams','survey_team_members','project_memberships','projects','departments','aor_nodes','aor_levels','companies','project_templates','priority_whitelist','invites','company_authority_grants','tickets','ticket_events','attachments','notification_outbox']){
    state[table]=(await pg!.query('SELECT to_jsonb(t) AS row FROM '+table+' t ORDER BY to_jsonb(t)::text')).rows;
   }return state;
  };
  const attachmentRaces=cases.filter(item=>item.name.startsWith('attachment-')||item.name.startsWith('notification-')).flatMap(item=>
   (['VERSION','LOGOUT'] as const).map(revocation=>({...item,name:item.name+'-'+revocation.toLowerCase(),revocation})));
  for(const item of [...cases,...attachmentRaces]){
   // Reset only this owned synthetic actor between distinct race scenarios.
   await pg.query('UPDATE users SET session_version=1,deactivated_at=NULL,deactivated_by=NULL WHERE id=$1',[actor]);
   const before=await rowsBefore();queries.length=0;
   await holder.query('BEGIN');await holder.query('SET LOCAL statement_timeout=6000');await acquireTenantLifecycleLock(holder,tenant,'EXCLUSIVE');
   const token=signToken(actor,tenant,1);
   const headers:Record<string,string>={cookie:'swr_session='+token};
   let body:FormData|string|undefined;
   if('multipart' in item){const form=new FormData();form.set('file',new File(['synthetic bytes'],'instructions.txt',{type:'text/plain'}));form.set('purpose','REQUEST_INSTRUCTION');body=form;if(item.keyed)headers['idempotency-key']=nextId();}
   else if(item.method!=='GET'){headers['content-type']='application/json';headers['idempotency-key']=nextId();body=JSON.stringify(item.body);}
   const request=new NextRequest('http://localhost/api/projects/'+project+'/'+item.name,{method:item.method,headers,body});
   const pending=item.handler(request,ctx);
   const deadline=Date.now()+3000;let waited=false;
   while(Date.now()<deadline){if((await pg.query('SELECT $2::int=ANY(pg_blocking_pids($1::int)) AS blocked',[waiterPid,holderPid])).rows[0].blocked){waited=true;break;}await new Promise(resolve=>setTimeout(resolve,10));}
   if(!waited){await holder.query('ROLLBACK');const response=await pending;throw Error(item.name+' did not wait for tenant; response '+response.status);}
   checks++;
   if('revocation' in item&&item.revocation==='LOGOUT')await holder.query("INSERT INTO revoked_auth_sessions(token_hash,tenant_id,user_id,expires_at) VALUES($1,$2,$3,now()+interval '8 hours')",[sessionTokenHash(token),tenant,actor]);
   else if('revocation' in item&&item.revocation==='VERSION')await holder.query('UPDATE users SET session_version=session_version+1 WHERE id=$1',[actor]);
   else await holder.query('UPDATE users SET session_version=session_version+1,deactivated_at=now(),deactivated_by=$2 WHERE id=$1',[actor,admin]);
   await holder.query('COMMIT');
   const response=await pending;assert.equal(response.status,401,item.name);checks++;
   assert.deepEqual(await rowsBefore(),before,item.name+' must preserve domain/replay/audit state');checks++;
   assert.ok(queries.some(sql=>sql.includes('FROM tenants')&&sql.endsWith(item.mode==='EXCLUSIVE'?'FOR UPDATE':'FOR SHARE')),item.name+' lock mode');checks++;
   assert.equal(queries.some(sql=>sql.includes('api_idempotency')),false,item.name+' must reject before replay');checks++;
   if(item.name.startsWith('attachment-')){assert.equal(queries.some(sql=>/FROM attachments|INSERT INTO attachments/.test(sql)),false,item.name+' rejects before attachment data');checks++;}
   if('revocation' in item&&item.revocation==='LOGOUT')await pg.query('DELETE FROM revoked_auth_sessions WHERE token_hash=$1',[sessionTokenHash(token)]);
  }
  assert.equal(stagedObjects.size,0,'revoked uploads clean staged objects');checks++;
  assert.equal(storageReads,0,'revoked downloads never read bytes');checks++;
  await pg.query('UPDATE users SET session_version=1,deactivated_at=NULL,deactivated_by=NULL WHERE id=$1',[actor]);
  await pg.query("UPDATE projects SET status='SETUP' WHERE id=$1",[project]);
  await pg.query("CREATE FUNCTION reject_metadata_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$");
  await pg.query('CREATE TRIGGER reject_metadata_audit BEFORE INSERT ON administrative_events FOR EACH ROW EXECUTE FUNCTION reject_metadata_audit()');
  const beforeFailure=await rowsBefore();
  const departmentRequest=()=>new NextRequest('http://localhost/api/projects/'+project+'/departments',{method:'POST',headers:{cookie:'swr_session='+signToken(actor,tenant,1),'content-type':'application/json'},body:JSON.stringify({name:'Atomic department',managerTitle:'Manager'})});
  assert.equal((await handlePostDepartments(departmentRequest(),ctx)).status,500,'audit failure must roll back setup mutation');checks++;
  assert.deepEqual(await rowsBefore(),beforeFailure,'audit failure preserves setup and audit state');checks++;
  await pg.query('DROP TRIGGER reject_metadata_audit ON administrative_events');
  assert.equal((await handlePostDepartments(departmentRequest(),ctx)).status,201);checks++;
  const events=(await pg.query("SELECT * FROM administrative_events WHERE event_type='project.configuration_changed' AND project_id=$1",[project])).rows;
  assert.equal(events.length,1);checks++;
  assert.equal(events[0].actor_id,actor);checks++;
  // Current operators retain both actions, with durable state scoped to this project.
  const notificationRequest=(action:string)=>new NextRequest('http://localhost/api/projects/'+project+'/notifications',{method:'POST',headers:{cookie:'swr_session='+signToken(actor,tenant,1),'content-type':'application/json'},body:JSON.stringify({action})});
  const captured=await operateNotifications(notificationRequest('capture'),ctx);
  assert.equal(captured.status,200);checks++;
  assert.equal((await captured.json()).updatedCount,1);checks++;
  const retried=await operateNotifications(notificationRequest('retry-failed'),ctx);
  assert.equal(retried.status,200);checks++;
  assert.equal((await retried.json()).updatedCount,1);checks++;
  const deliveryRows=(await pg.query('SELECT idempotency_key,delivery_state,attempt_count FROM notification_outbox ORDER BY idempotency_key')).rows;
  assert.deepEqual(deliveryRows,[{idempotency_key:'synthetic-FAILED',delivery_state:'QUEUED',attempt_count:0},{idempotency_key:'synthetic-QUEUED',delivery_state:'CAPTURED',attempt_count:1}]);checks++;
  const deliveryBefore=await rowsBefore();
  const foreignCtx={params:Promise.resolve({projectId:nextId()})};
  assert.equal((await operateNotifications(notificationRequest('capture'),foreignCtx)).status,404);checks++;
  assert.deepEqual(await rowsBefore(),deliveryBefore);checks++;
  // Permission-only changes must be reread even when the bearer version is unchanged.
  await pg.query('DELETE FROM tenant_memberships WHERE user_id=$1',[actor]);
  for(const action of ['capture','retry-failed'])for(const change of ['LOCAL_DISABLE','ROLE_LOSS']){
   await pg.query("UPDATE project_memberships SET role='SURVEY_MANAGER',access_disabled_at=NULL,access_disabled_by=NULL WHERE user_id=$1 AND project_id=$2",[actor,project]);
   const beforeDelivery:unknown[]=(await pg.query('SELECT to_jsonb(o) AS row FROM notification_outbox o ORDER BY id')).rows;
   await holder.query('BEGIN');await acquireTenantLifecycleLock(holder,tenant,'EXCLUSIVE');
   const pending=operateNotifications(notificationRequest(action),ctx);
   let blocked=false;const deadline=Date.now()+3000;
   while(Date.now()<deadline){if((await pg.query('SELECT $2::int=ANY(pg_blocking_pids($1::int)) AS blocked',[waiterPid,holderPid])).rows[0].blocked){blocked=true;break;}await new Promise(resolve=>setTimeout(resolve,10));}
   if(!blocked){await holder.query('ROLLBACK');const response=await pending;throw Error(action+' authority race did not wait; response '+response.status);}checks++;
   if(change==='LOCAL_DISABLE')await holder.query('UPDATE project_memberships SET access_disabled_at=now(),access_disabled_by=$3 WHERE user_id=$1 AND project_id=$2',[actor,project,admin]);
   else await holder.query("UPDATE project_memberships SET role='REQUESTER' WHERE user_id=$1 AND project_id=$2",[actor,project]);
   await holder.query('COMMIT');
   assert.equal((await pending).status,403,action+' '+change+' denies before delivery-state mutation');checks++;
   assert.deepEqual((await pg.query('SELECT to_jsonb(o) AS row FROM notification_outbox o ORDER BY id')).rows,beforeDelivery);checks++;
  }
  await pg.query("UPDATE project_memberships SET role='SURVEY_MANAGER',access_disabled_at=NULL,access_disabled_by=NULL WHERE user_id=$1 AND project_id=$2",[actor,project]);
  await pg.query("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'TENANT_ADMIN')",[tenant,actor]);
  // Positive upload/replay and download share the real coordinated transaction.
  await pg.query("UPDATE projects SET status='ACTIVE' WHERE id=$1",[project]);
  const uploadArea=randomUUID(),uploadLevel=randomUUID();
  await pg.query("INSERT INTO aor_levels(id,tenant_id,project_id,depth,label) VALUES($1,$2,$3,0,'Area')",[uploadLevel,tenant,project]);
  await pg.query("INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,name,code) VALUES($1,$2,$3,$4,'Synthetic Area','SYN')",[uploadArea,tenant,project,uploadLevel]);
  await pg.query("UPDATE tickets SET status='ASSIGNED',aor_node_id=$2,ticket_type='LAYOUT',requested_date='2026-10-20' WHERE id=$1",[ticket,uploadArea]);
  const uploadRequest=()=>{
   const form=new FormData();form.set('file',new File(['synthetic bytes'],'instructions.txt',{type:'text/plain'}));form.set('purpose','FIELD_SUPPORT');
   return new NextRequest('http://localhost/api/tickets/'+ticket+'/attachments',{method:'POST',headers:{cookie:'swr_session='+signToken(actor,tenant,1),'idempotency-key':'positive-upload'},body:form});
  };
  const attachmentParams={params:Promise.resolve({ticketId:ticket})};
  const uploaded=await handlePostTicketAttachments(uploadRequest(),attachmentParams,uploadDeps);
  assert.equal(uploaded.status,201);checks++;
  const saved=(await uploaded.json()).attachment;
  assert.equal((await handlePostTicketAttachments(uploadRequest(),attachmentParams,uploadDeps)).status,201);checks++;
  assert.equal(stagedObjects.size,1,'replay removes only duplicate staged bytes');checks++;
  const attachmentRows=(await pg.query('SELECT * FROM attachments')).rows;
  assert.equal(attachmentRows.length,1);checks++;assert.equal(attachmentRows[0].uploaded_by,actor);checks++;
  const downloadDeps={getTicketRouteContext,withTicketMutation,createTicketRepo:()=>new TicketRepository(),
   findAttachment:async(tid:string,ticketId:string,file:string,db:import('../../src/shared/types').DbClient)=>
    (await db.query<NonNullable<Awaited<ReturnType<import('../../src/app/api/tickets/[ticketId]/attachments/handler').TicketAttachmentDownloadDeps['findAttachment']>>>>('SELECT * FROM attachments WHERE tenant_id=$1 AND ticket_id=$2 AND id=$3',[tid,ticketId,file])).rows[0]??null,
   createStorage:uploadDeps.createStorage};
  const downloadRequest=()=>new NextRequest('http://localhost/api/tickets/'+ticket+'/attachments/'+saved.id,{headers:{cookie:'swr_session='+signToken(actor,tenant,1)}});
  const downloadParams={params:Promise.resolve({ticketId:ticket,attachmentId:saved.id})};
  const downloaded=await handleDownloadTicketAttachment(downloadRequest(),downloadParams,downloadDeps);
  assert.equal(downloaded.status,200);checks++;assert.equal(await downloaded.text(),'synthetic bytes');checks++;
  const downloadEvents=(await pg.query("SELECT * FROM ticket_events WHERE event_type='attachment.downloaded'")).rows;
  assert.equal(downloadEvents.length,1);checks++;assert.equal(downloadEvents[0].actor_id,actor);checks++;
  // Audit failure rejects the download response, without returning buffered bytes.
  await pg.query('CREATE TRIGGER reject_file_audit BEFORE INSERT ON ticket_events FOR EACH ROW EXECUTE FUNCTION reject_metadata_audit()');
  const beforeDownloadFailure=await rowsBefore();
  const failedDownload=await handleDownloadTicketAttachment(downloadRequest(),downloadParams,downloadDeps);
  assert.equal(failedDownload.status,500);checks++;
  assert.notEqual(await failedDownload.text(),'synthetic bytes');checks++;
  assert.deepEqual(await rowsBefore(),beforeDownloadFailure);checks++;
  await pg.query('DROP TRIGGER reject_file_audit ON ticket_events');
  console.log('Actual lifecycle writer handler PostgreSQL checks passed: '+checks);
 }finally{
  applicationPool.query=oldQuery;applicationPool.connect=oldConnect;
  if(a){await a.query('ROLLBACK');a.release();}if(b){await b.query('ROLLBACK');b.release();}
  if(pg)await pg.end();
  if(created){assert.match(schema,/^offboarding_writers_[a-f0-9]{32}$/);await setup.query('DROP SCHEMA "'+schema+'" CASCADE');}
  await setup.end();if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
