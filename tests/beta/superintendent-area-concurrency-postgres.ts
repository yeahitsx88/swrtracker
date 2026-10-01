import assert from 'node:assert/strict';
import {Pool,type PoolClient} from 'pg';
import {randomUUID} from 'node:crypto';
import type {UUID,DbClient} from '../../src/shared/types';
import {SuperintendentAreasPgRepository} from '../../src/modules/tenancy/infrastructure/superintendent-areas.repository';
import {unlinkSuperintendentArea} from '../../src/modules/tenancy/application/unlink-superintendent-area';
import {executeIdempotentHttpMutation} from '../../src/lib/idempotency';
import {SurveyStaffingPgRepository} from '../../src/modules/tenancy/infrastructure/survey-staffing.repository';
import {saveSurveyStaffing} from '../../src/modules/tenancy/application/save-survey-staffing';
import {unlinkSurveyStaffing} from '../../src/modules/tenancy/application/unlink-survey-staffing';
import {ProtectedObligationsPgRepository} from '../../src/modules/tenancy/infrastructure/protected-obligations.repository';
import {resolveSurveyReviewer} from '../../src/modules/tenancy/application/resolve-survey-reviewer';
import {TenancyRepository} from '../../src/modules/tenancy/infrastructure/tenancy.repository';
import {deactivateAorUserAssignment} from '../../src/modules/tenancy/application/assign-aor-user';
import {ConflictError} from '../../src/shared/errors';
const id=(n:number)=>`99010000-0000-4000-8000-${String(n).padStart(12,'0')}` as UUID;
const uuid=()=>randomUUID() as UUID;
async function main(){
 const url=new URL(process.env.DATABASE_URL??'');assert.equal(process.env.SWR_TEAM_POSTGRES,'1');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15489');assert.equal(url.pathname,'/swr_team_isolated');
 const pg=new Pool({connectionString:url.href,max:6}),repo=new SuperintendentAreasPgRepository(),staff=new SurveyStaffingPgRepository(),protectedRepo=new ProtectedObligationsPgRepository();let checks=0;
 const eq=(a:unknown,b:unknown,message?:string)=>{assert.deepEqual(a,b,message);checks++;};
 const auth={tenantId:id(1),userId:id(10),sessionVersion:1};
 const begin=async(db:PoolClient)=>{await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='5000ms'");};
 const capture=async<T>(promise:Promise<T>)=>{try{return{ok:true as const,value:await promise};}catch(error){return{ok:false as const,error};}};
 const waited=async(waiter:number,holder:number)=>{const deadline=Date.now()+2500;while(Date.now()<deadline){if((await pg.query('SELECT $2::int=ANY(pg_blocking_pids($1::int)) AS blocked',[waiter,holder])).rows[0].blocked){checks++;return;}await new Promise(r=>setTimeout(r,10));}throw Error('Expected actual PostgreSQL lock wait was not observed');};
 async function fixture(shared?:{subject:UUID;replacement:UUID;company:UUID}){
  const company=shared?.company??uuid(),project=uuid(),area=uuid(),child=uuid(),level=uuid(),sublevel=uuid(),assignment=uuid(),witness=uuid(),review=uuid(),chief=uuid(),successor=uuid(),subject=shared?.subject??uuid(),replacement=shared?.replacement??uuid();
  const db=await pg.connect();try{await begin(db);
   if(!shared)await db.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'Area unlink race GC','GC')",[company,id(1)]);
   if(!shared)for(const [user,name] of [[subject,'John'],[replacement,'Jason']] as const)await db.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,$5,'not-a-login-hash')",[user,id(1),company,user+'@example.test','Area unlink race '+name]);
   for(const [user,name] of [[chief,'Chief'],[successor,'Successor']] as const)await db.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,$5,'not-a-login-hash')",[user,id(1),company,user+'@example.test','Area unlink race '+name]);
   await db.query("INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,'Area unlink race disposable','ACTIVE','FULL')",[project,id(1)]);
   for(const [user,role] of [[id(10),'SURVEY_MANAGER'],[subject,'SURVEY_SUPERINTENDENT'],[replacement,'SURVEY_SUPERINTENDENT'],[chief,'PARTY_CHIEF'],[successor,'SURVEY_SUPERINTENDENT']] as const)await db.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)',[project,user,role]);
   await db.query("INSERT INTO aor_levels(id,tenant_id,project_id,depth,label) VALUES($1,$2,$3,0,'Area'),($4,$2,$3,1,'Subarea')",[level,id(1),project,sublevel]);
   await db.query("INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,parent_id,name,code) VALUES($1,$2,$3,$4,NULL,'Area1','A1'),($5,$2,$3,$6,$1,'Subarea','S1')",[area,id(1),project,level,child,sublevel]);
   for(const [row,user] of [[assignment,subject],[witness,replacement]] as const)await db.query('INSERT INTO aor_assignments(id,tenant_id,project_id,user_id,aor_node_id) VALUES($1,$2,$3,$4,$5)',[row,id(1),project,user,area]);
   await db.query("INSERT INTO project_responsibility_grants(id,tenant_id,project_id,user_id,aor_node_id,responsibility,granted_by) VALUES($1,$2,$3,$4,$5,'SURVEY_REVIEWER',$6)",[review,id(1),project,replacement,area,id(10)]);
   await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
  return{company,project,area,child,level,sublevel,assignment,witness,review,chief,successor,subject,replacement};
 }
 type Fixture=Awaited<ReturnType<typeof fixture>>;
 const input=async(f:Fixture)=>({action:'unlink-superintendent-area' as const,superintendentId:f.subject,linkId:f.assignment,replacementUserId:f.replacement,replacementGrantId:f.review,replacementAssignmentId:f.witness,expectedSnapshot:await repo.snapshot(pg,{tenantId:id(1),projectId:f.project},f.subject),confirmUnlink:true as const});
 const command=async(db:DbClient,f:Fixture,body:Awaited<ReturnType<typeof input>>,key:string,context?:Awaited<ReturnType<typeof repo.lockUnlinkContext>>)=>{const held=context??await repo.lockUnlinkContext(db,auth,f.project,body);return executeIdempotentHttpMutation(db,{tenantId:id(1),actorId:id(10),endpoint:`PATCH:/api/projects/${f.project}/survey/staffing:unlink-superintendent-area`,idempotencyKey:key},body,async()=>({status:200,body:await unlinkSuperintendentArea(repo,db,held,body)}));};
 const actor=(f:Fixture)=>({tenantId:id(1),projectId:f.project,actorId:id(10),actorRole:'SURVEY_MANAGER' as const,sessionVersion:1});
 const saveInput=async(f:Fixture)=>({expectedSnapshot:(await staff.snapshot(pg,id(1),f.project))!,partyChiefId:f.chief,areaId:f.area,superintendentId:f.subject,instrumentManIds:[],confirmRoleChanges:true});
 const handoverInput=async(f:Fixture)=>({userId:f.replacement,grantId:f.review,replacementUserId:f.successor,coverageMode:'assignAdditional' as const,coverageIntent:'PERMANENT' as const,confirmAdditionalCoverage:true as const,confirmResolution:true as const,expectedSnapshot:await protectedRepo.snapshot(pg,{tenantId:id(1),projectId:f.project},f.replacement)});
 const sessions=async<T>(fn:(a:PoolClient,b:PoolClient,aPid:number,bPid:number)=>Promise<T>)=>{const a=await pg.connect(),b=await pg.connect();try{const aPid=(await a.query('SELECT pg_backend_pid() AS pid')).rows[0].pid,bPid=(await b.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;await begin(a);await begin(b);return await fn(a,b,aPid,bPid);}finally{await a.query('ROLLBACK');await b.query('ROLLBACK');a.release();b.release();}};
 try{
  eq((await pg.query('SELECT name FROM tenants WHERE id=$1',[id(1)])).rows[0]?.name,'Superintendent Area unlink disposable');
  for(const writer of ['report-save','review-handover'] as const)for(const first of ['cleanup','writer'] as const){
   const f=await fixture(),body=await input(f),save=await saveInput(f),handover=await handoverInput(f);
   const write=async(db:PoolClient)=>writer==='report-save'?saveSurveyStaffing(staff,db,{...actor(f),input:save}):resolveSurveyReviewer(protectedRepo,db,await protectedRepo.lockResolutionContext(db,auth,f.project,handover),handover);
   await sessions(async(a,b,aPid,bPid)=>{
    if(first==='cleanup'){
     const context=await repo.lockUnlinkContext(a,auth,f.project,body),pending=capture(write(b));await waited(bPid,aPid);eq((await command(a,f,body,randomUUID(),context)).status,200);await a.query('COMMIT');const result=await pending;eq(result.ok,false);if(!result.ok)assert.ok(result.error instanceof ConflictError);await b.query('ROLLBACK');
    }else{
     await write(b);const pending=capture(command(a,f,body,randomUUID()));await waited(aPid,bPid);await b.query('COMMIT');const result=await pending;eq(result.ok,false);if(!result.ok)assert.ok(result.error instanceof ConflictError);await a.query('ROLLBACK');
    }
   });
  }
  for(const sameKey of [true,false]){
   const f=await fixture(),body=await input(f),key=randomUUID();
   await sessions(async(a,b,aPid,bPid)=>{const held=await repo.lockUnlinkContext(a,auth,f.project,body),pending=capture(command(b,f,body,sameKey?key:randomUUID()));await waited(bPid,aPid);const first=await command(a,f,body,key,held);await a.query('COMMIT');const second=await pending;eq(second.ok,sameKey);if(second.ok){eq(second.value.body,first.body);await b.query('COMMIT');}else{assert.ok(second.error instanceof ConflictError);await b.query('ROLLBACK');}});
   eq((await pg.query('SELECT count(*)::int AS n FROM survey_staffing_events WHERE project_id=$1',[f.project])).rows[0].n,1);
  }

  for(const first of ['cleanup','writer'] as const){
   const f=await fixture(),report=uuid();
   await pg.query('INSERT INTO survey_reporting_links(id,tenant_id,project_id,superintendent_id,party_chief_id,aor_node_id,assigned_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[report,id(1),f.project,f.subject,f.chief,f.child,id(10)]);
   const body=await input(f),unlink={action:'unlink' as const,kind:'reporting' as const,linkId:report,partyChiefId:f.chief,expectedSnapshot:(await staff.snapshot(pg,id(1),f.project))!,confirmUnlink:true as const};
   await sessions(async(a,b,aPid,bPid)=>{
    if(first==='cleanup'){
     const held=await repo.lockUnlinkContext(a,auth,f.project,body),pending=capture(unlinkSurveyStaffing(staff,b,{...actor(f),input:unlink}));await waited(bPid,aPid);await assert.rejects(command(a,f,body,randomUUID(),held),ConflictError);checks++;await a.query('ROLLBACK');eq((await pending).ok,true);await b.query('COMMIT');
    }else{
     await unlinkSurveyStaffing(staff,b,{...actor(f),input:unlink});const pending=capture(command(a,f,body,randomUUID()));await waited(aPid,bPid);await b.query('COMMIT');const result=await pending;eq(result.ok,false);if(!result.ok)assert.ok(result.error instanceof ConflictError);await a.query('ROLLBACK');
    }
   });
   await sessions(async(a)=>{eq((await command(a,f,await input(f),randomUUID())).status,200);await a.query('COMMIT');});
  }
  const tenancy=new TenancyRepository();
  const changes:Array<{name:string;write:(db:PoolClient,f:Fixture)=>Promise<unknown>;schemaOnly?:boolean}>=[
   {name:'selected assignment deactivation',write:(db,f)=>deactivateAorUserAssignment(tenancy,db,{tenantId:id(1),projectId:f.project,assignmentId:f.assignment,actorRole:'TENANT_ADMIN'})},
   {name:'witness assignment deactivation',write:(db,f)=>deactivateAorUserAssignment(tenancy,db,{tenantId:id(1),projectId:f.project,assignmentId:f.witness,actorRole:'TENANT_ADMIN'})},
   {name:'replacement account deactivation',schemaOnly:true,write:(db,f)=>db.query('UPDATE users SET deactivated_at=now() WHERE id=$1',[f.replacement])},
   {name:'replacement session version',schemaOnly:true,write:(db,f)=>db.query('UPDATE users SET session_version=session_version+1 WHERE id=$1',[f.replacement])},
   {name:'replacement company',schemaOnly:true,write:(db,f)=>db.query("UPDATE companies SET type='SUBCONTRACTOR' WHERE id=$1",[f.company])},
   {name:'replacement role',schemaOnly:true,write:(db,f)=>db.query("UPDATE project_memberships SET role='REQUESTER' WHERE project_id=$1 AND user_id=$2",[f.project,f.replacement])},
   {name:'Area retirement',schemaOnly:true,write:(db,f)=>db.query('UPDATE aor_nodes SET retired_at=now() WHERE id=$1',[f.area])},
   {name:'Area move/cycle',schemaOnly:true,write:(db,f)=>db.query('UPDATE aor_nodes SET parent_id=$2 WHERE id=$1',[f.area,f.child])},
   {name:'Area level depth',schemaOnly:true,write:(db,f)=>db.query('UPDATE aor_levels SET depth=2 WHERE id=$1',[f.level])},
   {name:'review witness revocation',schemaOnly:true,write:(db,f)=>db.query('UPDATE project_responsibility_grants SET revoked_at=now(),revoked_by=$2 WHERE id=$1',[f.review,id(10)])},
  ];
  // Raw-row cases prove held-lock compatibility only, not a new API permission.
  // Existing reporting/coverage/assignment use cases above remain the actual
  // current-writer evidence. There is no production Area move/level edit API.
  for(const change of changes)for(const first of ['cleanup','writer'] as const){
   const f=await fixture();if(!change.schemaOnly)await pg.query("UPDATE projects SET status='SETUP' WHERE id=$1",[f.project]);const body=await input(f);
   await sessions(async(a,b,aPid,bPid)=>{
    if(first==='cleanup'){
     const held=await repo.lockUnlinkContext(a,auth,f.project,body),pending=capture(change.write(b,f));await waited(bPid,aPid);eq((await command(a,f,body,randomUUID(),held)).status,200);await a.query('COMMIT');const result=await pending;eq(result.ok,true,change.name);await b.query('COMMIT');
    }else{
     await change.write(b,f);const pending=capture(command(a,f,body,randomUUID()));await waited(aPid,bPid);await b.query('COMMIT');const result=await pending;eq(result.ok,false,change.name);if(!result.ok)assert.ok(result.error instanceof ConflictError,`${change.name}: ${String(result.error)}`);await a.query('ROLLBACK');
    }
   });
  }
  // Delete/reinsert while the membership-lock statement waits: the new Manager
  // membership is current, but is absent from the statement's held row IDs.
  {
   const f=await fixture(),body=await input(f);
   await sessions(async(a,b,aPid,bPid)=>{await b.query('DELETE FROM project_memberships WHERE project_id=$1 AND user_id=$2',[f.project,id(10)]);await b.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'SURVEY_MANAGER')",[f.project,id(10)]);const pending=capture(command(a,f,body,randomUUID()));await waited(aPid,bPid);await b.query('COMMIT');const result=await pending;eq(result.ok,false);if(!result.ok){assert.ok(result.error instanceof ConflictError);assert.match(result.error.message,/Authorizing membership changed/);}await a.query('ROLLBACK');eq((await pg.query('SELECT count(*)::int AS n FROM survey_staffing_events WHERE project_id=$1',[f.project])).rows[0].n,0);});
  }
  // Two projects share subject, replacement and Manager accounts; shared identity
  // locks and audit FK KEY SHARE must remain compatible, with no 40P01.
  {
   const f=await fixture(),g=await fixture({subject:f.subject,replacement:f.replacement,company:f.company}),fInput=await input(f),gInput=await input(g);
   await sessions(async(a,b)=>{const [one,two]=await Promise.all([command(a,f,fInput,randomUUID()),command(b,g,gInput,randomUUID())]);eq(one.status,200);eq(two.status,200);await Promise.all([a.query('COMMIT'),b.query('COMMIT')]);});
   eq((await pg.query('SELECT count(*)::int AS n FROM survey_staffing_events WHERE project_id=ANY($1::uuid[])',[[f.project,g.project]])).rows[0].n,2);
  }
  console.log(`PASS ${checks} actual Superintendent cleanup lock/writer checks, both orders; raw-row compatibility distinguished from API authority`);
 }finally{await pg.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
