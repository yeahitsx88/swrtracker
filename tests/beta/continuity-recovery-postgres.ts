import {inUnitRequestScope} from '../setup/unit-request-scope';
// Reuse the disposable lifecycle schema; no retained rehearsal/production writes.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import bcrypt from 'bcrypt';
import {NextRequest} from 'next/server';
import {runLifecycleSchemaAcceptance} from './account-offboarding-postgres';
import {getPool} from '../../src/lib/db';
import {signToken,requireActiveAuth} from '../../src/lib/auth';
import {GET as previewMoveHandler,POST as moveHandler} from '../../src/app/api/projects/[projectId]/survey/reorganization/route';
import {GET as listAdministratorsHandler,POST as administratorsHandler} from '../../src/app/api/projects/[projectId]/administrators/route';
import {POST as grantCompanyHandler} from '../../src/app/api/projects/[projectId]/company-authority/route';
import {DELETE as revokeCompanyHandler} from '../../src/app/api/projects/[projectId]/company-authority/[grantId]/route';
import {handleGetProjects} from '../../src/app/api/projects/get-handler';
import {handlePostForgotPassword} from '../../src/app/api/auth/forgot-password/handler';
import {handlePostResetPassword} from '../../src/app/api/auth/reset-password/handler';
import {handlePostLogin} from '../../src/app/api/auth/login/handler';
import {dispatchPasswordResetEmails} from '../../src/modules/identity/infrastructure/password-reset-email-outbox';
import {assertCentralITRemovalSafe} from '../../src/modules/tenancy/application/tenant-continuity';
import {GET as managerPreviewHandler,POST as appointManagerHandler} from '../../src/app/api/projects/[projectId]/survey/manager-handover/route';
import {handleOffboarding} from '../../src/app/api/accounts/[userId]/offboarding/handler';
import type {UUID} from '../../src/shared/types';
const previewMove=inUnitRequestScope(previewMoveHandler);
const move=inUnitRequestScope(moveHandler);
const listAdministrators=inUnitRequestScope(listAdministratorsHandler);
const administrators=inUnitRequestScope(administratorsHandler);
const grantCompany=inUnitRequestScope(grantCompanyHandler);
const revokeCompany=inUnitRequestScope(revokeCompanyHandler);
const managerPreview=inUnitRequestScope(managerPreviewHandler);
const appointManager=inUnitRequestScope(appointManagerHandler);
const evidence:{name:string;pass:boolean}[]=[];
async function main(){
await runLifecycleSchemaAcceptance(async(db,f)=>{
 await db.query(await readFile('db/migrations/032_administrative_events.sql','utf8'));
 await db.query('UPDATE users SET deactivated_at=NULL,deactivated_by=NULL,session_version=1 WHERE tenant_id=$1',[f.tenant]);
 await db.query("UPDATE project_memberships SET role='SURVEY_MANAGER',access_disabled_at=NULL,access_disabled_by=NULL WHERE project_id=$1 AND user_id=$2",[f.project,f.actor]);
 await db.query("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'TENANT_ADMIN')",[f.tenant,f.actor]);
 const company=(await db.query('SELECT company_id FROM users WHERE id=$1',[f.actor])).rows[0].company_id;
 const app=getPool(),oldQuery=app.query,oldConnect=app.connect,oldEnv={JWT_SECRET:process.env.JWT_SECRET,EMAIL_WEBHOOK_URL:process.env.EMAIL_WEBHOOK_URL,APP_BASE_URL:process.env.APP_BASE_URL};
 process.env.JWT_SECRET='continuity-acceptance-20261002-secure-long-key';process.env.APP_BASE_URL='http://localhost:3116';
 let failAudit=false,requestNumber=0;
 app.query=db.query.bind(db) as typeof app.query;
 app.connect=(async()=>{const name=`continuity_request_${++requestNumber}`;return {query:async(sql:string,params?:unknown[])=>{
  if(sql==='BEGIN')return db.query(`SAVEPOINT ${name}`);if(sql==='COMMIT')return db.query(`RELEASE SAVEPOINT ${name}`);if(sql==='ROLLBACK')return db.query(`ROLLBACK TO SAVEPOINT ${name}`);
  if(failAudit&&sql.includes('INSERT INTO survey_staffing_events'))throw Error('Synthetic coordinated audit failure');return db.query(sql,params);
 },release:()=>{}};}) as typeof app.connect;
 const check=(name:string)=>{evidence.push({name,pass:true});console.log('PASS '+name);};
 const req=(path:string,body?:unknown,user=f.actor,key=randomUUID(),version=1)=>new NextRequest('http://localhost'+path,{method:body===undefined?'GET':'POST',headers:{cookie:'swr_session='+signToken(user as UUID,f.tenant as UUID,version),'content-type':'application/json','Idempotency-Key':key},body:body===undefined?undefined:JSON.stringify(body)});
 const expect=async(r:Response,status=200)=>{assert.equal(r.status,status,JSON.stringify(await r.clone().json()));return r.json();};
 const ctx={params:Promise.resolve({projectId:f.project})},base=`/api/projects/${f.project}/survey/reorganization`;
 const person=async(role:string,name:string)=>{const id=randomUUID();await db.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,$5,'fixture')",[id,f.tenant,company,id+'@example.test',name]);await db.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)',[f.project,id,role]);return id;};
 const chiefA=await person('PARTY_CHIEF','Chief A'),chiefB=await person('PARTY_CHIEF','Chief B'),im=await person('INSTRUMENT_MAN','Instrument A'),superA=await person('SURVEY_SUPERINTENDENT','Superintendent A'),superB=await person('SURVEY_SUPERINTENDENT','Superintendent B');
 const level=randomUUID(),areaA=randomUUID(),areaB=randomUUID();
 await db.query("INSERT INTO aor_levels(id,tenant_id,project_id,depth,label) VALUES($1,$2,$3,0,'Area')",[level,f.tenant,f.project]);
 for(const [area,code] of [[areaA,'A'],[areaB,'B']])await db.query('INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,name,code) VALUES($1,$2,$3,$4,$5,$5)',[area,f.tenant,f.project,level,code]);
 for(const [user,area] of [[chiefA,areaA],[chiefB,areaB],[superA,areaA],[superB,areaA],[superB,areaB]])await db.query('INSERT INTO aor_assignments(tenant_id,project_id,user_id,aor_node_id) VALUES($1,$2,$3,$4)',[f.tenant,f.project,user,area]);
 for(const [chief,area,superintendent] of [[chiefA,areaA,superA],[chiefB,areaB,superB]])await db.query('INSERT INTO survey_reporting_links(tenant_id,project_id,party_chief_id,aor_node_id,superintendent_id,assigned_by) VALUES($1,$2,$3,$4,$5,$6)',[f.tenant,f.project,chief,area,superintendent,f.actor]);
 await db.query('INSERT INTO crew_rosters(tenant_id,project_id,party_chief_id,instrument_man_id) VALUES($1,$2,$3,$4)',[f.tenant,f.project,chiefA,im]);
 const teamA=randomUUID(),teamB=randomUUID();
 for(const [id,chief,area] of [[teamA,chiefA,areaA],[teamB,chiefB,areaB]]){await db.query('INSERT INTO survey_teams(id,tenant_id,project_id,name,aor_node_id,lead_user_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,f.tenant,f.project,id,area,chief,f.actor]);await db.query('INSERT INTO survey_team_members(tenant_id,project_id,team_id,user_id) VALUES($1,$2,$3,$4)',[f.tenant,f.project,id,chief]);}
 // Current complete coverage is separate from the retained legacy primary Area.
 // Destination B also covers A, retaining the active assignment in A unchanged.
 for(const [team,areas] of [[teamA,[areaA]],[teamB,[areaA,areaB]]] as const)for(const area of areas)await db.query('INSERT INTO survey_team_areas(tenant_id,project_id,team_id,area_id) VALUES($1,$2,$3,$4)',[f.tenant,f.project,team,area]);
 await db.query('INSERT INTO survey_team_members(tenant_id,project_id,team_id,user_id) VALUES($1,$2,$3,$4)',[f.tenant,f.project,teamA,im]);
 const work=randomUUID();await db.query("INSERT INTO tickets(id,tenant_id,project_id,company_id,requester_id,workflow_variant,status,craft,description,aor_node_id,assigned_party_chief_id,assigned_instrument_man_id,ticket_type,requested_date) VALUES($1,$2,$3,$4,$5,'STANDARD_APPROVAL','IN_PROGRESS','Survey','Active continuity fixture',$6,$7,$8,'LAYOUT',CURRENT_DATE)",[work,f.tenant,f.project,company,f.subject,areaA,chiefA,im]);
 await db.query("INSERT INTO ticket_events(ticket_id,tenant_id,actor_id,event_type,payload) VALUES($1,$2,$3,'ticket.in_progress','{}')",[work,f.tenant,im]);
 const hash=async(tables:string[])=>{const records=[];for(const table of tables)records.push((await db.query(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows);return createHash('sha256').update(JSON.stringify(records)).digest('hex');};
 const history=()=>hash(['tickets','ticket_events','attachments','ticket_assignment_history']);
 const before=await history();
 const selection={kind:'CREW',partyChiefId:chiefA,areaId:areaA,superintendentId:superB};
 const preview=async(input:Record<string,unknown>,user=f.actor)=>(await expect(await previewMove(req(base+'?'+new URLSearchParams(Object.entries(input).map(([k,v])=>[k,String(v)])),undefined,user),ctx))).preview;
 const command=(input:Record<string,unknown>,snapshot:string)=>({...input,snapshot,reason:'Confirmed realistic staffing rotation',confirmed:true});
 const capture:Record<string,unknown>[]=[];const server=createServer(async(r,res)=>{let body='';for await(const chunk of r)body+=chunk;capture.push(JSON.parse(body));res.writeHead(200);res.end('{}');});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');process.env.EMAIL_WEBHOOK_URL=`http://127.0.0.1:${address.port}`;
 try{
  const p=await preview(selection);assert.equal(p.activeWork,1);assert.deepEqual(p.blockers,[]);const body=command(selection,p.snapshot),key=randomUUID();await expect(await move(req(base,body,f.actor,key),ctx));
  assert.equal((await db.query('SELECT superintendent_id FROM survey_reporting_links WHERE party_chief_id=$1 AND deactivated_at IS NULL',[chiefA])).rows[0].superintendent_id,superB);assert.equal(await history(),before);check('Chief move with active work preserves crew, recorded assignments and history');
  const events=await hash(['survey_staffing_events']);await expect(await move(req(base,body,f.actor,key),ctx));assert.equal(await hash(['survey_staffing_events']),events);check('Exact reorganization retry creates no duplicate event');
  await expect(await move(req(base,body),ctx),409);check('Stale roster preview rejects a distinct command');
  const implicit=await preview({...selection,areaId:areaB});assert.ok(implicit.blockers.some((x:string)=>x.includes('explicit destination named team')));await expect(await move(req(base,command({...selection,areaId:areaB},implicit.snapshot)),ctx),409);check('Superseded implicit Area movement is refused without changing history');
  const blocked=await preview({...selection,areaId:areaB,destinationTeamId:teamB});assert.ok(blocked.blockers.some((x:string)=>x.includes('open crew requests')));await expect(await move(req(base,command({...selection,areaId:areaB,destinationTeamId:teamB},blocked.snapshot)),ctx),409);check('Intact crew Area change blocks unresolved active work');
  const instrument={kind:'INSTRUMENT_MAN',instrumentManId:im,partyChiefId:chiefB,destinationTeamId:teamB};let ip=await preview(instrument);await expect(await move(req(base,command(instrument,ip.snapshot)),ctx));
  assert.equal((await db.query('SELECT party_chief_id FROM crew_rosters WHERE instrument_man_id=$1',[im])).rows[0].party_chief_id,chiefB);assert.equal((await db.query('SELECT team_id FROM survey_team_members WHERE user_id=$1 AND deactivated_at IS NULL',[im])).rows[0].team_id,teamB);assert.equal(await history(),before);check('Instrument Man moves roster and named team atomically while active assigned work stays recorded');
  ip=await preview({...instrument,partyChiefId:chiefA,destinationTeamId:teamA});await expect(await move(req(base,command({...instrument,partyChiefId:chiefA,destinationTeamId:teamA},ip.snapshot)),ctx));check('Consecutive Instrument Man movements remain coherent');
  const rollbackPreview=await preview(instrument),beforeRollback=await hash(['crew_rosters','survey_teams','survey_team_members','survey_staffing_events','api_idempotency']);failAudit=true;await expect(await move(req(base,command(instrument,rollbackPreview.snapshot)),ctx),500);failAudit=false;assert.equal(await hash(['crew_rosters','survey_teams','survey_team_members','survey_staffing_events','api_idempotency']),beforeRollback);check('Audit failure rolls back roster, named teams, events and retry ledger');
  await expect(await move(req(base,command(instrument,rollbackPreview.snapshot),chiefA),ctx),403);check('Chief cannot invoke Manager reorganization');
  const foreignCtx={params:Promise.resolve({projectId:f.foreignProject})};await expect(await previewMove(req(base+'?'+new URLSearchParams(selection)),foreignCtx),403);check('Cross-tenant project is inaccessible');
  await db.query('UPDATE users SET session_version=2 WHERE id=$1',[f.actor]);await expect(await move(req(base,command(instrument,rollbackPreview.snapshot)),ctx),401);await db.query('UPDATE users SET session_version=1 WHERE id=$1',[f.actor]);check('Revoked Manager session cannot reuse a staffing command');
  // Resolve only synthetic work. Decision51/54 replaced the historical implicit
  // Area/team rewrite with an explicit destination and preserved team coverage.
  // A separate current source lead prevents stranding the retained source team.
  const sourceLead=await person('PARTY_CHIEF','Retained source team lead');
  await db.query('INSERT INTO survey_team_members(tenant_id,project_id,team_id,user_id) VALUES($1,$2,$3,$4)',[f.tenant,f.project,teamA,sourceLead]);
  await db.query('UPDATE survey_teams SET lead_user_id=$2,row_version=row_version+1 WHERE id=$1',[teamA,sourceLead]);
  const coverageBefore=await hash(['survey_team_areas']);
  await db.query("UPDATE tickets SET status='COMPLETED',completed_at=NOW() WHERE id=$1",[work]);const resolvedHistory=await history();const relocation={...selection,areaId:areaB,destinationTeamId:teamB};const rp=await preview(relocation);await expect(await move(req(base,command(relocation,rp.snapshot)),ctx));
  assert.equal((await db.query('SELECT aor_node_id FROM survey_teams WHERE id=$1',[teamA])).rows[0].aor_node_id,areaA);assert.equal(await hash(['survey_team_areas']),coverageBefore);assert.equal((await db.query('SELECT team_id FROM survey_team_members WHERE user_id=$1 AND deactivated_at IS NULL',[chiefA])).rows[0].team_id,teamB);assert.equal((await db.query('SELECT aor_node_id FROM aor_assignments WHERE user_id=$1 AND deactivated_at IS NULL',[chiefA])).rows[0].aor_node_id,areaB);assert.equal(await history(),resolvedHistory);check('Resolved explicit crew transfer changes individual Area/reporting/membership while preserving complete team coverage and history');
  // Discovery reproduces the reported archived launcher state without rewriting history.
  await db.query("UPDATE projects SET status='ARCHIVED' WHERE id=$1",[f.project]);const discovered=await expect(await handleGetProjects(req('/api/projects')));assert.equal(discovered.projects.find((p:{id:string})=>p.id===f.project).status,'ARCHIVED');await expect(await move(req(base,command(instrument,rollbackPreview.snapshot)),ctx),409);await db.query("UPDATE projects SET status='ACTIVE' WHERE id=$1",[f.project]);check('Archived history remains discoverable; organizational mutation stays blocked');
  // Reach the candidate beyond the old fixed100 limit.
  for(let n=0;n<102;n++)await person('REQUESTER',`Candidate ${String(n).padStart(3,'0')}`);const late=await person('REQUESTER','Zoe Zimmerman');const page=await expect(await listAdministrators(req(`/api/projects/${f.project}/administrators?limit=100&offset=100`),ctx));assert.ok(page.administrators.some((p:{userId:string})=>p.userId===late));check('Project Admin candidate beyond100 is reachable through bounded pages');
  const central=randomUUID();await db.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,'Central recovery','fixture')",[central,f.tenant,company,central+'@example.test']);await db.query("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'TENANT_ADMIN')",[f.tenant,central]);
  await expect(await administrators(req('/admin',{userId:f.actor,enabled:false,confirmed:true},central),ctx));await expect(await administrators(req('/admin',{userId:late,enabled:true,confirmed:true},central),ctx));check('Central IT without a project membership recovers the final Project Admin vacancy');
  const subCompany=randomUUID(),sub=randomUUID();await db.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'Synthetic subcontractor','SUBCONTRACTOR')",[subCompany,f.tenant]);await db.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,'Subcontractor','fixture')",[sub,f.tenant,subCompany,sub+'@example.test']);await db.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'REQUESTER')",[f.project,sub]);
  const companyKey=randomUUID(),grant=await expect(await grantCompany(req('/company',{userId:sub},central,companyKey),ctx),201);await expect(await grantCompany(req('/company',{userId:sub},central,companyKey),ctx),201);const revokeKey=randomUUID(),revokeReq=()=>new NextRequest('http://localhost/company',{method:'DELETE',headers:{cookie:'swr_session='+signToken(central as UUID,f.tenant as UUID,1),'Idempotency-Key':revokeKey}});const grantCtx={params:Promise.resolve({projectId:f.project,grantId:grant.grant.id})};await expect(await revokeCompany(revokeReq(),grantCtx));await expect(await revokeCompany(revokeReq(),grantCtx));check('Company View batch retry preserves exactly one grant/revoke transition');
  // Existing password reset, real encrypted outbox and loopback mail capture.
  const resetUser=late,oldPassword='Synthetic-Original-Password-42',newPassword='Synthetic-Recovered-Password-42';await db.query('UPDATE users SET password_hash=$2 WHERE id=$1',[resetUser,await bcrypt.hash(oldPassword,12)]);const email=(await db.query('SELECT email FROM users WHERE id=$1',[resetUser])).rows[0].email;
  const forgot=(tenantId:string,email:string)=>handlePostForgotPassword(new NextRequest('http://localhost/api/auth/forgot-password',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tenantId,email})}));
  const reset=(token:string,password=newPassword)=>handlePostResetPassword(new NextRequest('http://localhost/api/auth/reset-password',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token,newPassword:password})}));
  const login=(password:string)=>handlePostLogin(new NextRequest('http://localhost/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tenantId:f.tenant,email,password})}));
  const resetHistory=await history(),oldCookie='swr_session='+signToken(resetUser as UUID,f.tenant as UUID,1);
  assert.deepEqual(await expect(await forgot(f.tenant,email)),await expect(await forgot(f.tenant,'unknown@synthetic.example.test')));assert.deepEqual(await expect(await forgot(randomUUID(),email)),{success:true});check('Known, unknown and unknown-tenant recovery requests use the same public response');
  assert.equal(await dispatchPasswordResetEmails(db),1);assert.equal(capture.length,1);const message=capture[0]!;assert.deepEqual(message.to,[email]);const token=new URL(String(message.text).split(' ').at(-1)!).searchParams.get('token')!;assert.match(token,/^[a-f0-9]{64}$/);assert.equal((await db.query('SELECT encrypted_payload FROM password_reset_email_outbox WHERE status=\'SENT\'')).rows[0].encrypted_payload,null);check('Single-use random token delivered to recorded email through encrypted outbox; payload erased after capture');
  await expect(await reset('malformed-token'),400);await expect(await reset(token));await expect(await reset(token),400);await expect(await login(oldPassword),401);await expect(await login(newPassword));await assert.rejects(requireActiveAuth(new NextRequest('http://localhost/api/projects',{headers:{cookie:oldCookie}})));assert.equal(await history(),resetHistory);check('Reset rejects malformed/reused tokens, replaces password, revokes old session and retains history');
  assert.equal((await db.query("SELECT count(*)::int AS n FROM administrative_events WHERE subject_user_id=$1 AND event_type='password.reset_completed'",[resetUser])).rows[0].n,1);check('Reset completion audit is durable and contains no password or bearer token');
  await db.query('DELETE FROM auth_password_reset_rate_limits');await expect(await forgot(f.tenant,email));await expect(await forgot(f.tenant,email));await expect(await forgot(f.tenant,email));await expect(await forgot(f.tenant,email));assert.equal((await db.query('SELECT count(*)::int AS n FROM password_reset_email_outbox WHERE status=\'PENDING\'')).rows[0].n,1);check('Cooldown and account throttle suppress duplicate reset issuance without public account enumeration');
  assert.equal(await dispatchPasswordResetEmails(db),1);const expiredToken=new URL(String(capture.at(-1)!.text).split(' ').at(-1)!).searchParams.get('token')!;await db.query('UPDATE password_reset_tokens SET expires_at=NOW()-interval \'1 minute\' WHERE user_id=$1 AND used_at IS NULL',[resetUser]);await expect(await reset(expiredToken),400);check('Expired token cannot reset the account');
  await db.query('DELETE FROM auth_password_reset_rate_limits');await expect(await forgot(f.tenant,email));assert.equal(await dispatchPasswordResetEmails(db),1);const disabledToken=new URL(String(capture.at(-1)!.text).split(' ').at(-1)!).searchParams.get('token')!;await db.query('UPDATE users SET deactivated_at=NOW(),deactivated_by=$2 WHERE id=$1',[resetUser,central]);await expect(await reset(disabledToken),400);await expect(await forgot(f.tenant,email));await expect(await login(newPassword),401);check('Disabled account cannot use an outstanding token, receive a new token, or renew login');
  for(const [departingUser,label] of ([[superB,'Superintendent'],[chiefA,'Party Chief']] as const)){const departureScope={kind:'PROJECT_ACCESS' as const,projectId:f.project as UUID};const dutyPreview=(await expect(await handleOffboarding(req('/offboard',undefined,central),departureScope,departingUser))).preview;assert.ok(dutyPreview.blockerTotal>0);await expect(await handleOffboarding(req('/offboard',{scope:departureScope,subjectUserId:departingUser,snapshot:dutyPreview.snapshot,reason:'Departure requires resolved duties',confirmed:true},central),departureScope,departingUser),409);check(label+' departure blocks unresolved reporting, coverage, crew or team duties');}
  // Actual Central IT departure and final-administrator continuity.
  const departingVersion=Number((await db.query('SELECT session_version FROM users WHERE id=$1',[f.actor])).rows[0].session_version);const departingSession=req('/projects',undefined,f.actor,randomUUID(),departingVersion);await requireActiveAuth(departingSession);const scope={kind:'TENANT_ACCOUNT' as const};const cp=(await expect(await handleOffboarding(req('/offboard',undefined,central),scope,f.actor))).preview;assert.deepEqual(cp.blockers,[]);await expect(await handleOffboarding(req('/offboard',{scope,subjectUserId:f.actor,snapshot:cp.snapshot,reason:'Administrator departure confirmed',confirmed:true},central),scope,f.actor));await assert.rejects(requireActiveAuth(departingSession));check('Tenant Admin departure with an eligible successor revokes previous session');
  await assert.rejects(assertCentralITRemovalSafe(db,f.tenant as UUID,central as UUID),/active eligible Central IT administrator/);check('Last eligible Tenant Admin cannot be removed or demoted without a successor');
  const localScope={kind:'PROJECT_ACCESS' as const,projectId:f.project as UUID};const lastManager=(await expect(await handleOffboarding(req('/offboard',undefined,central),localScope,f.subject))).preview;assert.ok(lastManager.blockers.some((b:{code:string})=>b.code==='LAST_SURVEY_MANAGER'));check('Final actual Survey Manager removal remains blocked');
  const appointment={outgoingUserId:f.subject,incomingUserId:superA,coverageUserId:superB};const managerPath='/api/projects/'+f.project+'/survey/manager-handover';
  const protectedId=randomUUID();await db.query("INSERT INTO project_responsibility_grants(id,tenant_id,project_id,aor_node_id,user_id,responsibility,granted_by) VALUES($1,$2,$3,$4,$5,'SURVEY_REVIEWER',$6)",[protectedId,f.tenant,f.project,areaA,superA,central]);const protectedPreview=(await expect(await managerPreview(req(managerPath+'?'+new URLSearchParams(appointment),undefined,central),ctx))).preview;assert.ok(protectedPreview.blockers.length>0);await db.query('UPDATE project_responsibility_grants SET revoked_at=NOW(),revoked_by=$2 WHERE id=$1',[protectedId,central]);check('Manager appointment refuses unresolved protected obligations');
  const managerState=(await expect(await managerPreview(req(managerPath+'?'+new URLSearchParams(appointment),undefined,central),ctx))).preview;const appointmentHistory=await history(),appointmentBody={...appointment,snapshot:managerState.snapshot,reason:'Confirmed successor before termination',confirmed:true},appointmentKey=randomUUID();const appointed=await expect(await appointManager(req(managerPath,appointmentBody,central,appointmentKey),ctx));assert.equal(await history(),appointmentHistory);
  const appointmentEvidence=await hash(['administrative_events','api_idempotency','project_memberships','aor_assignments','survey_reporting_links']);
  assert.deepEqual(await expect(await appointManager(req(managerPath,appointmentBody,central,appointmentKey),ctx)),appointed);assert.equal(await hash(['administrative_events','api_idempotency','project_memberships','aor_assignments','survey_reporting_links']),appointmentEvidence);check('Manager recorded retry preserves result after incoming subject promotion');
  await db.query('SAVEPOINT manager_lifecycle_probes');
  try{
   await db.query("UPDATE projects SET status='ARCHIVED' WHERE tenant_id=$1 AND id=$2",[f.tenant,f.project]);
   await expect(await appointManager(req(managerPath,appointmentBody,central,appointmentKey),ctx),409);check('Archived Manager retry refuses recorded result before replay');
   await db.query("UPDATE projects SET status='SETUP' WHERE tenant_id=$1 AND id=$2",[f.tenant,f.project]);
   assert.deepEqual(await expect(await appointManager(req(managerPath,appointmentBody,central,appointmentKey),ctx)),appointed);check('Ordinary editable Setup preserves current-authorized exact Manager retry');
   await db.query("INSERT INTO project_preparation_cancellations(id,tenant_id,project_id,started_by,reason,reviewed_evidence) VALUES($1,$2,$3,$4,'Owned lifecycle cancellation witness','{}')",[randomUUID(),f.tenant,f.project,central]);
   for(const response of [await managerPreview(req(managerPath+'?'+new URLSearchParams(appointment),undefined,central),ctx),await appointManager(req(managerPath,appointmentBody,central,appointmentKey),ctx),await appointManager(req(managerPath,appointmentBody,central),ctx)])assert.equal((await expect(response,409)).error.code,'PROJECT_PREPARATION_CANCELLING');
   assert.equal(await history(),appointmentHistory);assert.equal(await hash(['administrative_events','api_idempotency','project_memberships','aor_assignments','survey_reporting_links']),appointmentEvidence);check('Cancelling preparation blocks Manager preview fresh command and exact replay with no organizational or audit effects');
  }finally{await db.query('ROLLBACK TO SAVEPOINT manager_lifecycle_probes');await db.query('RELEASE SAVEPOINT manager_lifecycle_probes');}
  assert.deepEqual(await expect(await appointManager(req(managerPath,appointmentBody,central,appointmentKey),ctx)),appointed);check('Current editable project retry remains available after isolated lifecycle probes');
  assert.equal((await db.query('SELECT role FROM project_memberships WHERE user_id=$1',[superA])).rows[0].role,'SURVEY_MANAGER');const departing=(await expect(await handleOffboarding(req('/offboard',undefined,central),localScope,f.subject))).preview;assert.deepEqual(departing.blockers,[]);await expect(await handleOffboarding(req('/offboard',{scope:localScope,subjectUserId:f.subject,snapshot:departing.snapshot,reason:'Survey Manager departure confirmed',confirmed:true},central),localScope,f.subject));check('Guarded successor appointment permits separate Manager departure and preserves history');
  const sole=new NextRequest('http://localhost/api/offboard',{headers:{cookie:'swr_session='+signToken(central as UUID,f.tenant as UUID,1)}});await expect(await handleOffboarding(sole,scope,central),403);check('Remaining Tenant Admin cannot self-disable');
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));app.query=oldQuery;app.connect=oldConnect;for(const [key,value]of Object.entries(oldEnv)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
await writeFile('.local-continuity-acceptance.json',JSON.stringify({at:new Date().toISOString(),scope:'Disposable PostgreSQL lifecycle fixture; retained Northbank untouched',checks:evidence},null,2)+'\n');
console.log(`Continuity/recovery checks passed: ${evidence.length}`);

}
main().catch(error=>{console.error(error);process.exitCode=1;});
