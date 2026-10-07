import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {NextRequest} from 'next/server';
import {requireActiveAuth,signToken} from '../../src/lib/auth';
import {getProjectRole} from '../../src/lib/get-project-role';
import {executeIdempotentHttpMutation} from '../../src/lib/idempotency';
import {acquireTenantLifecycleLock} from '../../src/lib/tenant-lifecycle-lock';
import {SurveyTeamsPgRepository} from '../../src/modules/tenancy/infrastructure/survey-teams.repository';
import {SurveyReorganizationPgRepository} from '../../src/modules/tenancy/infrastructure/survey-reorganization.repository';
import {reorganizeSurvey} from '../../src/modules/tenancy/application/reorganize-survey';
import {saveSurveyTeam} from '../../src/modules/tenancy/application/survey-teams';
import {TicketRepository} from '../../src/modules/ticket/infrastructure/ticket.repository';
import {delegateWork} from '../../src/modules/ticket/application/delegate-work';
import {handlePostSurveyTeam,handleDeleteSurveyTeam,handlePatchSurveyRole,type TeamDeps} from '../../src/app/api/projects/[projectId]/survey/teams/handler';
import type {DbClient,UUID} from '../../src/shared/types';

async function main(){
 const url=new URL(process.env.DATABASE_URL??'');assert.equal(process.env.SWR_FINALIZATION_TEST,'1');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15498');assert.equal(url.pathname,'/swr_finalization_184');
 const prior=JSON.parse(await readFile('.local/finalization/fixture.json','utf8')) as {tenant:string};
 const pool=new Pool({connectionString:url.href,max:6}),checks:string[]=[];
 assert.equal((await pool.query('SELECT name FROM tenants WHERE id=$1',[prior.tenant])).rows[0]?.name,'Owned Finalization 184','Only this newly owned fixture may be extended');
 const ids=Array.from({length:15},()=>randomUUID() as UUID),[tenant,project,company,manager,ss,chief,im,requester,alternate,areaA,areaB,level,childLevel,child,otherProject]=ids as [UUID,UUID,UUID,UUID,UUID,UUID,UUID,UUID,UUID,UUID,UUID,UUID,UUID,UUID,UUID];
 const ticket=randomUUID() as UUID,foreignTenant=randomUUID() as UUID,foreignProject=randomUUID() as UUID,foreignCompany=randomUUID() as UUID,foreignManager=randomUUID() as UUID,otherManager=randomUUID() as UUID;
 const tx=async<T>(fn:(db:DbClient)=>Promise<T>):Promise<T>=>{const db=await pool.connect();try{await db.query('BEGIN');const result=await fn(db);await db.query('COMMIT');return result;}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}};
 const repo=new SurveyTeamsPgRepository(),actor={tenantId:tenant!,projectId:project!,actorId:manager!,actorRole:'SURVEY_MANAGER' as const,sessionVersion:1};
 const deps:TeamDeps={repo,getProjectRole,requireAuth:(req,db)=>requireActiveAuth(req,db??pool),withTransaction:tx,executeIdempotent:executeIdempotentHttpMutation};
 const ctx={params:Promise.resolve({projectId:project!})},tokens:Record<string,string>={};
 const request=(method:string,value:unknown,who='manager',key=randomUUID())=>new NextRequest('http://localhost/api/projects/'+project+'/survey/teams',{method,headers:{cookie:'swr_session='+tokens[who],'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(value)});
 const call=async(response:Promise<Response>,status:number,label:string)=>{const result=await response,body=await result.json();assert.equal(result.status,status,JSON.stringify(body));checks.push(label);return body;};
 const witness=async()=>{const parts=[];for(const table of ['survey_teams','survey_team_areas','survey_team_members','survey_staffing_events','survey_work_delegations','tickets','ticket_events','api_idempotency'])parts.push((await pool.query('SELECT to_jsonb(t) AS row FROM '+table+' t WHERE tenant_id=$1 ORDER BY to_jsonb(t)::text',[tenant])).rows);return JSON.stringify(parts);};
 try{
  await tx(async db=>{
   await db.query("INSERT INTO tenants(id,name) VALUES($1,'Owned delegation lifecycle185'),($2,'Owned foreign185')",[tenant,foreignTenant]);
   await db.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'GC','GC'),($3,$4,'Foreign GC','GC')",[company,tenant,foreignCompany,foreignTenant]);
   for(const [id,t] of [[project,tenant],[otherProject,tenant],[foreignProject,foreignTenant]])await db.query("INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,'Owned lifecycle185','ACTIVE','FULL')",[id,t]);
   for(const [who,id,role] of [['manager',manager,'SURVEY_MANAGER'],['superintendent',ss,'SURVEY_SUPERINTENDENT'],['chief',chief,'PARTY_CHIEF'],['instrument',im,'INSTRUMENT_MAN'],['requester',requester,'REQUESTER'],['alternate',alternate,'PARTY_CHIEF'],['foreignManager',foreignManager,'SURVEY_MANAGER'],['otherManager',otherManager,'SURVEY_MANAGER']]){
    const ft=who==='foreignManager',t=ft?foreignTenant:tenant;await db.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,$5,'no-login-fixture')",[id,t,ft?foreignCompany:company,id+'@lifecycle185.invalid',who]);await db.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)',[ft?foreignProject:who==='otherManager'?otherProject:project,id,role]);tokens[who!]=signToken(id as UUID,t as UUID);
   }
   for(const [id,depth] of [[level,0],[childLevel,1]])await db.query('INSERT INTO aor_levels(id,tenant_id,project_id,depth,label) VALUES($1,$2,$3,$4,$5)',[id,tenant,project,depth,depth===0?'Area':'Section']);
   for(const [id,name,parent,l] of [[areaA,'Area A',null,level],[areaB,'Area B',null,level],[child,'Child A',areaA,childLevel]])await db.query('INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,name,code,parent_id) VALUES($1,$2,$3,$4,$5,$5,$6)',[id,tenant,project,l,name,parent]);
   await db.query("INSERT INTO tickets(id,tenant_id,project_id,company_id,requester_id,workflow_variant,status,craft,description,aor_node_id,ticket_type,requested_date,ticket_number,first_submitted_at,survey_lead_id) VALUES($1,$2,$3,$4,$5,'STANDARD_APPROVAL','APPROVED','Survey','Owned delegated work',$6,'LAYOUT',CURRENT_DATE+7,'ALPHA185-DELEGATED',now(),$7)",[ticket,tenant,project,company,requester,child,manager]);
  });
  const input={teamId:null,expectedVersion:null,name:'Owned lifecycle185 team',areaId:areaA,areaIds:[areaA,areaB],leadUserId:ss,memberIds:[ss,chief,im]},createKey=randomUUID();
  const created=await call(handlePostSurveyTeam(request('POST',input,'manager',createKey),ctx,deps),201,'Current Manager creates team atomically');const teamId=created.teamId as UUID;
  await call(handlePostSurveyTeam(request('POST',input,'manager',createKey),ctx,deps),201,'Exact create replay writes one team');
  await tx(async db=>{await acquireTenantLifecycleLock(db,tenant!,'SHARED');await db.query('SELECT id FROM tickets WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenant,ticket]);await delegateWork(new TicketRepository(),db,{...actor,ticketId:ticket},teamId);});
  checks.push('Actual delegation retains approved work awaiting crew under covered ancestor Area');
  let edit={...input,teamId,expectedVersion:1};const remove={teamId,expectedVersion:1,confirmDelete:true};
  for(const [method,value,label] of [['DELETE',remove,'Team deletion'],['POST',{...edit,leadUserId:chief},'Lead replacement'],['POST',{...edit,memberIds:[ss,chief]},'Member removal'],['POST',{...edit,areaId:areaB,areaIds:[areaB]},'Required ancestor coverage removal']] as const){const before=await witness();await call(method==='DELETE'?handleDeleteSurveyTeam(request(method,value),ctx,deps):handlePostSurveyTeam(request(method,value),ctx,deps),409,label+' blocked with resolution guidance');assert.equal(await witness(),before);}
  const unchanged=await witness();for(const who of ['chief','instrument','requester','foreignManager','otherManager'])await call(handleDeleteSurveyTeam(request('DELETE',remove,who),ctx,deps),403,who+' cannot delete project team');assert.equal(await witness(),unchanged);checks.push('Denied structural actions preserve all eight state/history/ledger witnesses');
  await call(handlePostSurveyTeam(request('POST',{...edit,name:'Safe rename',areaIds:[areaA]}),ctx,deps),200,'Rename and unused coverage removal remain allowed');edit={...edit,expectedVersion:2,name:'Safe rename',areaIds:[areaA]};
  const role={action:'set-role',userId:ss,expectedRole:'SURVEY_SUPERINTENDENT',expectedRoleVersion:1,role:'INSTRUMENT_MAN',confirmRoleChanges:true};await call(handlePatchSurveyRole(request('PATCH',role),ctx,deps),409,'Pending delegation blocks lead role change without incidental roster or Area grants');
  await pool.query("UPDATE tickets SET status='ASSIGNED',assigned_party_chief_id=$2,assigned_instrument_man_id=$3 WHERE tenant_id=$4 AND id=$1",[ticket,chief,im,tenant]);await pool.query("UPDATE survey_work_delegations SET ended_at=now(),end_reason='OWNED_ASSIGNED_FIXTURE' WHERE tenant_id=$1 AND ticket_id=$2",[tenant,ticket]);
  for(const [person,from,to] of [[chief,'PARTY_CHIEF','INSTRUMENT_MAN'],[im,'INSTRUMENT_MAN','PARTY_CHIEF']] as const)await call(handlePatchSurveyRole(request('PATCH',{...role,userId:person,expectedRole:from,role:to}),ctx,deps),409,'Assigned '+from+' cannot be demoted without resolving work');
  await pool.query("UPDATE tickets SET status='PENDING_FIELD_VALIDATION',assigned_party_chief_id=NULL,assigned_instrument_man_id=NULL,field_validation_reviewer_id=$2 WHERE tenant_id=$3 AND id=$1",[ticket,chief,tenant]);await call(handlePatchSurveyRole(request('PATCH',{...role,userId:chief,expectedRole:'PARTY_CHIEF'}),ctx,deps),409,'Captured reviewer obligation blocks role change after assignment clearing');
  await pool.query("UPDATE tickets SET status='APPROVED',field_validation_reviewer_id=NULL WHERE tenant_id=$2 AND id=$1",[ticket,tenant]);
  const eventCount=(await pool.query('SELECT count(*)::int n FROM survey_staffing_events WHERE tenant_id=$1',[tenant])).rows[0].n;await pool.query("CREATE FUNCTION owned_team185_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.tenant_id='"+tenant+"'::uuid THEN RAISE EXCEPTION 'owned team185 audit failure'; END IF; RETURN NEW; END $$");await pool.query('CREATE TRIGGER owned_team185_failure BEFORE INSERT ON survey_staffing_events FOR EACH ROW EXECUTE FUNCTION owned_team185_failure()');
  try{const before=await witness();await call(handlePostSurveyTeam(request('POST',{...edit,name:'Must roll back'}),ctx,deps),500,'Actual structural audit failure rolls state and ledger back');assert.equal(await witness(),before);}finally{await pool.query('DROP TRIGGER owned_team185_failure ON survey_staffing_events');await pool.query('DROP FUNCTION owned_team185_failure()');}assert.equal((await pool.query('SELECT count(*)::int n FROM survey_staffing_events WHERE tenant_id=$1',[tenant])).rows[0].n,eventCount);
  const preservation=await pool.connect();await preservation.query('BEGIN');
  try{
   await acquireTenantLifecycleLock(preservation,tenant!,'EXCLUSIVE');
   const destination=await saveSurveyTeam(repo,preservation,actor,{...input,name:'Owned transfer destination',leadUserId:alternate!,memberIds:[alternate!]});
   await preservation.query('INSERT INTO crew_rosters(tenant_id,project_id,party_chief_id,instrument_man_id) VALUES($1,$2,$3,$4)',[tenant,project,chief,im]);
   await preservation.query("UPDATE tickets SET status='IN_PROGRESS',assigned_party_chief_id=$2,assigned_instrument_man_id=$3 WHERE tenant_id=$4 AND id=$1",[ticket,chief,im,tenant]);
   const priorRequest=JSON.stringify((await preservation.query('SELECT * FROM tickets WHERE tenant_id=$1 AND id=$2',[tenant,ticket])).rows),priorHistory=JSON.stringify((await preservation.query('SELECT * FROM ticket_events WHERE tenant_id=$1 AND ticket_id=$2 ORDER BY id',[tenant,ticket])).rows);
   const movement=new SurveyReorganizationPgRepository(),selection={kind:'INSTRUMENT_MAN' as const,instrumentManId:im!,partyChiefId:alternate!},preview=await movement.preview(preservation,actor,selection);assert.deepEqual(preview.blockers,[]);
   await reorganizeSurvey(movement,preservation,actor,{...selection,snapshot:preview.snapshot,reason:'Retain existing active request ownership',confirmed:true});
   assert.equal(await movement.rosterChief(preservation,tenant!,project!,im!),alternate);assert.equal(JSON.stringify((await preservation.query('SELECT * FROM tickets WHERE tenant_id=$1 AND id=$2',[tenant,ticket])).rows),priorRequest);assert.equal(JSON.stringify((await preservation.query('SELECT * FROM ticket_events WHERE tenant_id=$1 AND ticket_id=$2 ORDER BY id',[tenant,ticket])).rows),priorHistory);assert.deepEqual((await repo.team(preservation,tenant!,project!,destination.teamId))!.areas!.map(a=>a.id).sort(),[areaA,areaB].sort());
   checks.push('Approved Instrument Man transfer with active work preserves actual request/history and destination complete coverage');
  }finally{await preservation.query('ROLLBACK');preservation.release();}
  // A held SHARED transition barrier must prevent EXCLUSIVE structural inspection until
  // its real delegation commits. Observe the wait, rather than relying on a sleep race.
  const holding=await pool.connect();await holding.query('BEGIN');await acquireTenantLifecycleLock(holding,tenant!,'SHARED');await holding.query('SELECT id FROM tickets WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenant,ticket]);await delegateWork(new TicketRepository(),holding,{...actor,ticketId:ticket},teamId);
  const deletion=handleDeleteSurveyTeam(request('DELETE',{...remove,expectedVersion:2}),ctx,deps);let waiting=false;for(let n=0;n<80;n++){if((await pool.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query='SELECT id FROM tenants WHERE id=$1 FOR UPDATE'")).rows.length){waiting=true;break;}await new Promise(r=>setTimeout(r,25));}assert(waiting,'Structural writer waited behind SHARED delegation barrier');await holding.query('COMMIT');holding.release();await call(deletion,409,'Waiting deletion rechecks committed delegation and refuses');
  // Current auth must run again after the barrier wait, including completed replay.
  const blocker=await pool.connect();await blocker.query('BEGIN');await acquireTenantLifecycleLock(blocker,tenant!,'EXCLUSIVE');const replay=handlePostSurveyTeam(request('POST',input,'manager',createKey),ctx,deps);waiting=false;for(let n=0;n<80;n++){if((await pool.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query='SELECT id FROM tenants WHERE id=$1 FOR UPDATE'")).rows.length){waiting=true;break;}await new Promise(r=>setTimeout(r,25));}assert(waiting);await blocker.query('UPDATE users SET session_version=session_version+1 WHERE tenant_id=$1 AND id=$2',[tenant,manager]);await blocker.query('COMMIT');blocker.release();await call(replay,401,'Revoked session after lock wait cannot replay create');
  await pool.query('UPDATE users SET session_version=1 WHERE tenant_id=$1 AND id=$2',[tenant,manager]);
  await writeFile('.local/finalization/team-fixture.json',JSON.stringify({origin:'http://127.0.0.1:3185',tenant,project,teamId,ticket,people:{manager,superintendent:ss,chief,instrument:im,requester},tokens,input:edit,remove:{...remove,expectedVersion:2}}));
  await writeFile('.local/finalization/team-postgres-results.json',JSON.stringify({checks,retainedData:'Prior tenant untouched; unique new owned lifecycle185 tenant retained',productionWrites:'Authenticated real route handlers and direct coordinated delegation with actual PostgreSQL; HTTP/browser separate'},null,2));console.log('Owned delegation lifecycle PostgreSQL: '+checks.length+' named checks pass.');
 }finally{await pool.end();}
}
void main().catch(e=>{console.error(e.name+': '+e.message);process.exitCode=1;});
