import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {NextRequest} from 'next/server';
import {getPool} from '../../src/lib/db';
import {signToken} from '../../src/lib/auth';
import {acquireTenantLifecycleLock} from '../../src/lib/tenant-lifecycle-lock';
import {PATCH} from '../../src/app/api/projects/[projectId]/members/[userId]/role/route';
import {GET as handoverPreview,POST as handover} from '../../src/app/api/projects/[projectId]/survey/manager-handover/route';
import type {UUID} from '../../src/shared/types';

async function main(){
 const url=new URL(process.env.DATABASE_URL??'');assert.equal(process.env.SWR_FINALIZATION_TEST,'1');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15498');assert.equal(url.pathname,'/swr_finalization_184');
 const prior=JSON.parse(await readFile('.local/finalization/fixture.json','utf8'));const pool=getPool(),checks:string[]=[];
 assert.equal((await pool.query('SELECT name FROM tenants WHERE id=$1',[prior.tenant])).rows[0]?.name,'Owned Finalization 184');
 const tenant=randomUUID(),foreignTenant=randomUUID(),project=randomUUID(),otherProject=randomUUID(),foreignProject=randomUUID(),company=randomUUID(),scCompany=randomUUID(),foreignCompany=randomUUID(),area=randomUUID(),level=randomUUID();
 const people:Record<string,string>={},tokens:Record<string,string>={};
 const roles:Record<string,string>={admin:'VIEWER',projectAdmin:'VIEWER',combined:'PARTY_CHIEF',manager:'SURVEY_MANAGER',superintendent:'SURVEY_SUPERINTENDENT',chief:'PARTY_CHIEF',instrument:'INSTRUMENT_MAN',requester:'REQUESTER',viewer:'VIEWER',subject:'REQUESTER',subcontractor:'REQUESTER',incoming:'SURVEY_SUPERINTENDENT',coverage:'SURVEY_SUPERINTENDENT',otherAdmin:'VIEWER',foreignAdmin:'VIEWER'};
 for(const who of Object.keys(roles))people[who]=randomUUID();
 await pool.query('BEGIN');try{
  await pool.query("INSERT INTO tenants(id,name) VALUES($1,'Owned roles187'),($2,'Owned foreign roles187')",[tenant,foreignTenant]);
  await pool.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'GC','GC'),($3,$2,'Owned subcontractor','SUBCONTRACTOR'),($4,$5,'Foreign GC','GC')",[company,tenant,scCompany,foreignCompany,foreignTenant]);
  for(const [id,t] of [[project,tenant],[otherProject,tenant],[foreignProject,foreignTenant]])await pool.query("INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,'Owned role acceptance','ACTIVE','FULL')",[id,t]);
  for(const [who,id] of Object.entries(people)){
   const foreign=who==='foreignAdmin',t=foreign?foreignTenant:tenant,p=foreign?foreignProject:who==='otherAdmin'?otherProject:project;
   await pool.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,$5,'no-login-fixture')",[id,t,foreign?foreignCompany:who==='subcontractor'?scCompany:company,id+'@roles187.invalid','Role '+who]);
   await pool.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)',[p,id,roles[who]]);tokens[who]=signToken(id as UUID,t as UUID);
   if(['admin','foreignAdmin'].includes(who))await pool.query("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'TENANT_ADMIN')",[t,id]);
   if(['projectAdmin','combined','otherAdmin'].includes(who))await pool.query("INSERT INTO project_admin_grants(tenant_id,project_id,user_id,origin,granted_by) VALUES($1,$2,$3,'EXPLICIT',$3)",[t,p,id]);
  }
  await pool.query("INSERT INTO aor_levels(id,tenant_id,project_id,depth,label) VALUES($1,$2,$3,0,'Area')",[level,tenant,project]);
  await pool.query("INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,name,code) VALUES($1,$2,$3,$4,'Owned Area','A')",[area,tenant,project,level]);
  await pool.query('COMMIT');
 }catch(e){await pool.query('ROLLBACK');throw e;}
 const scope=(userId=people.subject!,p=project)=>({params:Promise.resolve({projectId:p,userId})});
 const req=(body:unknown,who='admin',key=randomUUID(),p=project,userId=people.subject!)=>new NextRequest('http://127.0.0.1:3185/api/projects/'+p+'/members/'+userId+'/role',{method:'PATCH',headers:{cookie:'swr_session='+tokens[who],'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(body)});
 const call=async(result:Promise<Response>,status:number,label:string)=>{const response=await result,body=await response.json();assert.equal(response.status,status,label+': '+JSON.stringify(body));checks.push(label);return body;};
 const input=(role:string,expectedRole='REQUESTER',sessionVersion=1)=>({role,expectedRole,sessionVersion,confirmed:true});
 const witness=async()=>JSON.stringify(await Promise.all(['administrative_events','api_idempotency','survey_team_members','survey_staffing_events'].map(async table=>(await pool.query('SELECT to_jsonb(t) row FROM '+table+' t WHERE tenant_id=$1 ORDER BY to_jsonb(t)::text',[tenant])).rows)).then(async rows=>[rows,(await pool.query('SELECT pm.role,pm.custom_role_id,u.session_version FROM project_memberships pm JOIN users u ON u.id=pm.user_id WHERE pm.project_id=$1 ORDER BY u.id',[project])).rows]));
 try{
  const first=input('INSTRUMENT_MAN'),key=randomUUID();
  for(const who of ['manager','superintendent','chief','instrument','requester','viewer','otherAdmin','foreignAdmin']){const before=await witness();await call(PATCH(req(first,who),scope()),who==='foreignAdmin'?404:403,who+' cannot use independently administered role mutation');assert.equal(await witness(),before);}
  await call(PATCH(req(first,'admin',randomUUID(),foreignProject),scope(people.subject!,foreignProject)),404,'Foreign project remains undisclosed');
  await call(PATCH(req(first,'admin',randomUUID(),project,people.foreignAdmin!),scope(people.foreignAdmin!)),404,'Foreign subject remains undisclosed');
  await call(PATCH(req(first,'admin',randomUUID(),project,people.subcontractor!),scope(people.subcontractor!)),404,'Subcontractor cannot receive survey role');
  await call(PATCH(req({...first,expectedRole:undefined}),scope()),400,'Survey promotion requires reviewed source role');
  await call(PATCH(req({...first,confirmed:false}),scope()),400,'Explicit confirmation required');
  await call(PATCH(req(input('INSTRUMENT_MAN','VIEWER')),scope()),409,'Stale source role refused');
  await call(PATCH(req(first,'admin',key),scope()),200,'Tenant Admin promotes eligible Requester to Instrument Man');
  await call(PATCH(req(first,'admin',key),scope()),200,'Exact original promotion replay succeeds after subject session renewal');
  assert.equal((await pool.query("SELECT count(*)::int n FROM administrative_events WHERE tenant_id=$1 AND subject_user_id=$2 AND event_type='project.role_changed'",[tenant,people.subject])).rows[0].n,1);
  await call(PATCH(req({...first,role:'PARTY_CHIEF'},'admin',key),scope()),409,'Retry body replacement refused');
  await call(PATCH(req(input('PARTY_CHIEF','INSTRUMENT_MAN',2),'projectAdmin'),scope()),200,'Independent Project Admin promotes resolved Instrument Man to Chief');
  await call(PATCH(req(input('SURVEY_SUPERINTENDENT','PARTY_CHIEF',3),'projectAdmin'),scope()),200,'Independent Project Admin promotes resolved Chief to Superintendent');
  await call(PATCH(req(input('REQUESTER','SURVEY_SUPERINTENDENT',4),'admin'),scope()),200,'Tenant Admin removes resolved Superintendent to Requester');
  assert.deepEqual((await pool.query('SELECT role,session_version FROM project_memberships pm JOIN users u ON u.id=pm.user_id WHERE pm.project_id=$1 AND u.id=$2',[project,people.subject])).rows[0],{role:'REQUESTER',session_version:5});
  await call(PATCH(req(input('REQUESTER','PARTY_CHIEF'),'combined',randomUUID(),project,people.combined!),scope(people.combined!)),403,'Combined Chief and independent Project Admin cannot remove own role');
  await call(PATCH(req(input('REQUESTER','SURVEY_MANAGER'),'admin',randomUUID(),project,people.manager!),scope(people.manager!)),409,'Last current Manager cannot be removed');
  const selection={outgoingUserId:people.manager!,incomingUserId:people.incoming!,coverageUserId:people.coverage!},context={params:Promise.resolve({projectId:project})};
  const headers={cookie:'swr_session='+tokens.admin,'Content-Type':'application/json'};
  const preview=await call(handoverPreview(new NextRequest('http://localhost/api/projects/'+project+'/survey/manager-handover?'+new URLSearchParams(selection),{headers}),context),200,'Current administrative Manager handover preview');
  assert.deepEqual(preview.preview.blockers,[]);
  await call(handover(new NextRequest('http://localhost/api/projects/'+project+'/survey/manager-handover',{method:'POST',headers:{...headers,'Idempotency-Key':randomUUID()},body:JSON.stringify({...selection,snapshot:preview.preview.snapshot,reason:'Establish actual permanent Manager continuity',confirmed:true})}),context),200,'Existing guarded handover establishes actual permanent replacement');
  await call(PATCH(req(input('REQUESTER','SURVEY_MANAGER'),'projectAdmin',randomUUID(),project,people.manager!),scope(people.manager!)),200,'Separate confirmed administrative removal of former Manager retains new Manager');
  // Real unresolved work and named-team obligations are checked in the locked command.
  const team=randomUUID();await pool.query('BEGIN');await pool.query("INSERT INTO survey_teams(id,tenant_id,project_id,name,aor_node_id,lead_user_id,created_by) VALUES($1,$2,$3,'Owned role blockers',$4,$5,$6)",[team,tenant,project,area,people.chief,people.admin]);
  for(const id of [people.chief,people.instrument])await pool.query('INSERT INTO survey_team_members(tenant_id,project_id,team_id,user_id) VALUES($1,$2,$3,$4)',[tenant,project,team,id]);
  await pool.query('COMMIT');
  const delegated=randomUUID();
  await pool.query("INSERT INTO tickets(id,tenant_id,project_id,company_id,requester_id,workflow_variant,status,craft,description,aor_node_id,ticket_type,requested_date,ticket_number,first_submitted_at,survey_lead_id,assigned_party_chief_id) VALUES($1,$2,$3,$4,$5,'STANDARD_APPROVAL','APPROVED','Survey','Owned pending delegation fixture',$6,'LAYOUT',CURRENT_DATE+7,$7,now(),$8,$8)",[delegated,tenant,project,company,people.requester,area,'ROLE187-DELEGATED-'+delegated,people.chief]);
  await pool.query('INSERT INTO survey_work_delegations(tenant_id,project_id,ticket_id,team_id,lead_user_id,delegated_by) VALUES($1,$2,$3,$4,$5,$6)',[tenant,project,delegated,team,people.chief,people.incoming]);
  // This is a newly owned state fixture, not evidence of a delegation journey.
  const pendingBefore=await witness();
  await call(PATCH(req(input('PARTY_CHIEF','INSTRUMENT_MAN'),'admin',randomUUID(),project,people.instrument!),scope(people.instrument!)),409,'Pending team work blocks role change for a non-lead member');
  assert.equal(await witness(),pendingBefore);checks.push('Non-lead delegation refusal preserves role, session, membership, audit and retry ledger');
  await pool.query("UPDATE survey_work_delegations SET ended_at=now(),end_reason='OWNED_FIXTURE_STAGE' WHERE tenant_id=$1 AND ticket_id=$2",[tenant,delegated]);
  await call(PATCH(req(input('REQUESTER','PARTY_CHIEF'),'admin',randomUUID(),project,people.chief!),scope(people.chief!)),409,'Current named-team lead must resolve leadership first');
  await call(PATCH(req(input('REQUESTER','INSTRUMENT_MAN'),'admin',randomUUID(),project,people.instrument!),scope(people.instrument!)),409,'Administrative removal requires explicit prior named-team exit');
  await pool.query('INSERT INTO crew_rosters(tenant_id,project_id,party_chief_id,instrument_man_id) VALUES($1,$2,$3,$4)',[tenant,project,people.chief,people.instrument]);
  await call(PATCH(req(input('PARTY_CHIEF','INSTRUMENT_MAN'),'admin',randomUUID(),project,people.instrument!),scope(people.instrument!)),409,'Unresolved current crew prevents role changes');
  await pool.query('UPDATE crew_rosters SET deactivated_at=now() WHERE tenant_id=$1 AND project_id=$2',[tenant,project]);
  await pool.query('INSERT INTO aor_assignments(tenant_id,project_id,user_id,aor_node_id) VALUES($1,$2,$3,$4)',[tenant,project,people.instrument,area]);
  await call(PATCH(req(input('PARTY_CHIEF','INSTRUMENT_MAN'),'admin',randomUUID(),project,people.instrument!),scope(people.instrument!)),409,'Unresolved individual Area prevents role changes');
  await pool.query('UPDATE aor_assignments SET deactivated_at=now() WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3',[tenant,project,people.instrument]);
  const work=randomUUID();await pool.query("INSERT INTO tickets(id,tenant_id,project_id,company_id,requester_id,workflow_variant,status,craft,description,aor_node_id,ticket_type,requested_date,ticket_number,first_submitted_at,assigned_instrument_man_id) VALUES($1,$2,$3,$4,$5,'STANDARD_APPROVAL','IN_PROGRESS','Survey','Owned assigned work',$6,'LAYOUT',CURRENT_DATE+7,$8,now(),$7)",[work,tenant,project,company,people.requester,area,people.instrument,'ROLE187-'+work]);
  const historyBefore=JSON.stringify((await pool.query('SELECT * FROM tickets WHERE tenant_id=$1 AND id=$2',[tenant,work])).rows);
  await call(PATCH(req(input('PARTY_CHIEF','INSTRUMENT_MAN'),'admin',randomUUID(),project,people.instrument!),scope(people.instrument!)),409,'Unresolved assigned field work prevents role changes');
  assert.equal(JSON.stringify((await pool.query('SELECT * FROM tickets WHERE tenant_id=$1 AND id=$2',[tenant,work])).rows),historyBefore);
  // Fault trigger is limited to this test-owned tenant and removed in finally.
  const fn='role187_fault_'+tenant.replaceAll('-',''),before=await witness();
  await pool.query('CREATE FUNCTION '+fn+"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.tenant_id='"+tenant+"'::uuid THEN RAISE EXCEPTION 'owned role audit fault'; END IF; RETURN NEW; END $$");
  await pool.query('CREATE TRIGGER '+fn+' BEFORE INSERT ON administrative_events FOR EACH ROW EXECUTE FUNCTION '+fn+'()');
  try{await call(PATCH(req(input('PARTY_CHIEF','REQUESTER',5)),scope()),500,'Audit failure refuses command');assert.equal(await witness(),before);checks.push('Actual audit failure rolls back role, session and retry ledger');}finally{await pool.query('DROP TRIGGER '+fn+' ON administrative_events');await pool.query('DROP FUNCTION '+fn+'()');}
  const adminKey=randomUUID(),body=input('INSTRUMENT_MAN','REQUESTER',5);await call(PATCH(req(body,'projectAdmin',adminKey),scope()),200,'Current independent grant writes one role change');
  await pool.query('UPDATE project_admin_grants SET revoked_at=now(),revoked_by=$3 WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3',[tenant,project,people.projectAdmin]);
  await call(PATCH(req(body,'projectAdmin',adminKey),scope()),403,'Revoked independent administration cannot replay recorded role change');
  const holding=await pool.connect();await holding.query('BEGIN');await acquireTenantLifecycleLock(holding,tenant as UUID,'EXCLUSIVE');const pending=PATCH(req(first,'admin',key),scope());
  let waited=false;for(let i=0;i<100;i++){if((await pool.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query='SELECT id FROM tenants WHERE id=$1 FOR UPDATE'")).rows.length){waited=true;break;}await new Promise(r=>setTimeout(r,20));}assert(waited);
  await holding.query('UPDATE users SET session_version=session_version+1 WHERE tenant_id=$1 AND id=$2',[tenant,people.admin]);await holding.query('COMMIT');holding.release();await call(pending,401,'Session revoked during actual lifecycle wait cannot replay');
  tokens.admin=signToken(people.admin as UUID,tenant as UUID,2);
  await pool.query("UPDATE projects SET status='ARCHIVED' WHERE tenant_id=$1 AND id=$2",[tenant,project]);await call(PATCH(req(input('PARTY_CHIEF','INSTRUMENT_MAN',6)),scope()),409,'Archived projects refuse role changes');
  await pool.query("UPDATE projects SET status='ACTIVE' WHERE tenant_id=$1 AND id=$2",[tenant,project]);
  await writeFile('.local/finalization/role-fixture.json',JSON.stringify({tenant,project,company,area,people,tokens,origin:'http://127.0.0.1:3185',subjectRole:'INSTRUMENT_MAN',subjectVersion:6}));
  await writeFile('.local/finalization/role-postgres-results.json',JSON.stringify({checks,retainedData:'Unique new owned roles187 identities; earlier tenants unchanged',mode:'Actual authenticated Next route handlers and PostgreSQL; browser and production HTTP separate'},null,2));
  console.log('Owned administrative survey roles: '+checks.length+' named checks pass.');
 }finally{await pool.end();}
}
void main().catch(e=>{console.error(e.name+': '+e.message);process.exitCode=1;});
