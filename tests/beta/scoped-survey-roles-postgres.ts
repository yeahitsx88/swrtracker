import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {NextRequest} from 'next/server';
import {getPool} from '../../src/lib/db';
import {signToken} from '../../src/lib/auth';
import {acquireTenantLifecycleLock} from '../../src/lib/tenant-lifecycle-lock';
import {handleGetSurveyTeams as GET,handlePostSurveyTeam as POST,handlePatchSurveyRole as PATCH} from '../../src/app/api/projects/[projectId]/survey/teams/handler';
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
  await pool.query("INSERT INTO tenants(id,name) VALUES($1,'Owned roles188'),($2,'Owned foreign roles188')",[tenant,foreignTenant]);
  await pool.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'GC','GC'),($3,$2,'Owned subcontractor','SUBCONTRACTOR'),($4,$5,'Foreign GC','GC')",[company,tenant,scCompany,foreignCompany,foreignTenant]);
  for(const [id,t] of [[project,tenant],[otherProject,tenant],[foreignProject,foreignTenant]])await pool.query("INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,'Owned role acceptance','ACTIVE','FULL')",[id,t]);
  for(const [who,id] of Object.entries(people)){
   const foreign=who==='foreignAdmin',t=foreign?foreignTenant:tenant,p=foreign?foreignProject:who==='otherAdmin'?otherProject:project;
   await pool.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,$5,'no-login-fixture')",[id,t,foreign?foreignCompany:who==='subcontractor'?scCompany:company,id+'@roles188.invalid','Scoped '+who]);
   await pool.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)',[p,id,roles[who]]);tokens[who]=signToken(id as UUID,t as UUID);
   if(['admin','foreignAdmin'].includes(who))await pool.query("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'TENANT_ADMIN')",[t,id]);
   if(['projectAdmin','combined','otherAdmin'].includes(who))await pool.query("INSERT INTO project_admin_grants(tenant_id,project_id,user_id,origin,granted_by) VALUES($1,$2,$3,'EXPLICIT',$3)",[t,p,id]);
  }
  await pool.query("INSERT INTO aor_levels(id,tenant_id,project_id,depth,label) VALUES($1,$2,$3,0,'Area')",[level,tenant,project]);
  await pool.query("INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,name,code) VALUES($1,$2,$3,$4,'Owned Area','A')",[area,tenant,project,level]);
  await pool.query('COMMIT');
 }catch(e){await pool.query('ROLLBACK');throw e;}

 const area2=randomUUID();await pool.query("INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,name,code) VALUES($1,$2,$3,$4,'Second owned Area','B')",[area2,tenant,project,level]);
 const ctx=(p=project)=>({params:Promise.resolve({projectId:p})});
 const req=(method:string,body:unknown,who='superintendent',key=randomUUID(),p=project)=>new NextRequest('http://127.0.0.1:3185/api/projects/'+p+'/survey/teams',{method,headers:{cookie:'swr_session='+tokens[who],'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(body)});
 const call=async(result:Promise<Response>,status:number,label:string)=>{const response=await result,body=await response.json();assert.equal(response.status,status,label+': '+JSON.stringify(body));checks.push(label);return body;};
 const get=async(who:string,id:string,p=project)=>call(GET(new NextRequest('http://localhost/api/projects/'+p+'/survey/teams?teamId='+id,{headers:{cookie:'swr_session='+tokens[who]}}),ctx(p)),200,'Current authorized team read');
 const teamInput=(lead:string,members:string[],name:string)=>({teamId:null,expectedVersion:null,name,areaId:area,areaIds:[area,area2],leadUserId:lead,memberIds:members});
 const team=(await call(POST(req('POST',teamInput(people.superintendent!,[people.superintendent!,people.chief!,people.instrument!],'Owned supervised team'),'manager'),ctx()),201,'Manager creates multi-Area supervised team')).teamId;
 const otherTeam=(await call(POST(req('POST',teamInput(people.incoming!,[people.incoming!,people.coverage!],'Owned other team'),'manager'),ctx()),201,'Separate current team establishes explicit scope')).teamId;
 const input=(userId=people.instrument!,expectedRole='INSTRUMENT_MAN',expectedRoleVersion=1,version=1)=>({action:'remove-role',userId,expectedRole,expectedRoleVersion,confirmRoleChanges:true,reviewedTeamId:team,expectedTeamVersion:version});
 const patch=(body:unknown,who='superintendent',key=randomUUID(),p=project)=>PATCH(req('PATCH',body,who,key,p),ctx(p));
 const witness=async()=>JSON.stringify(await Promise.all(['survey_teams','survey_team_areas','survey_team_members','survey_staffing_events','survey_notifications','api_idempotency'].map(async table=>(await pool.query('SELECT to_jsonb(t) row FROM '+table+' t WHERE tenant_id=$1 ORDER BY to_jsonb(t)::text',[tenant])).rows)).then(async rows=>[rows,(await pool.query('SELECT pm.role,u.session_version FROM project_memberships pm JOIN users u ON u.id=pm.user_id WHERE pm.project_id=$1 ORDER BY u.id',[project])).rows]));
 const deny=async(body:unknown,who:string,status:number,label:string,p=project)=>{const before=await witness();await call(patch(body,who,randomUUID(),p),status,label);assert.equal(await witness(),before);};
 try{
  assert.equal((await get('superintendent',team)).team.members.find((m:{userId:string})=>m.userId===people.instrument).roleVersion,1);checks.push('Scoped detail exposes actual subject session version for current review');
  for(const who of ['chief','instrument','requester','viewer','admin'])await deny(input(),who,400,who+' cannot supply Superintendent team-role scope');
  await deny(input(),'incoming',403,'Another Superintendent cannot change foreign named team');
  await deny(input(),'foreignAdmin',403,'Foreign tenant actor cannot receive scoped mutation data');
  await deny(input(people.foreignAdmin!), 'superintendent',403,'Foreign tenant subject remains inaccessible');
  await deny(input(), 'superintendent',403,'Other project grants do not follow a UUID',otherProject);
  await deny(input(people.superintendent!,'SURVEY_SUPERINTENDENT'),'superintendent',403,'No operational self-removal including current team lead');
  await deny(input(people.coverage!,'SURVEY_SUPERINTENDENT'),'superintendent',403,'Membership in another named team grants no role authority');
  await deny(input(people.subcontractor!,'INSTRUMENT_MAN'),'superintendent',403,'Subcontractor remains ineligible for survey staffing');
  await deny({...input(),expectedTeamVersion:2},'superintendent',409,'Stale reviewed team version refuses all writes');
  await deny({...input(),expectedRole:'PARTY_CHIEF'},'superintendent',409,'Stale reviewed role refuses all writes');
  await deny({...input(),expectedRoleVersion:2},'superintendent',409,'Stale subject session refuses all writes');
  await deny({...input(),confirmRoleChanges:false},'superintendent',400,'Explicit role removal consent required');
  await deny({...input(),action:'set-role',role:'SURVEY_SUPERINTENDENT'},'superintendent',403,'Superintendent cannot promote another Superintendent');
  await deny({...input(),action:'set-role',role:'PARTY_CHIEF',expectedRole:'REQUESTER',userId:people.requester},'superintendent',400,'Ordinary Requester promotion remains separate administration');
  const promotion={...input(),action:'set-role',role:'PARTY_CHIEF'},promotionKey=randomUUID();
  await call(patch(promotion,'superintendent',promotionKey),200,'Current Superintendent promotes resolved current Instrument Man within named team');
  await call(patch(promotion,'superintendent',promotionKey),200,'Exact role promotion replay survives subject session renewal');
  assert.equal((await get('superintendent',team)).team.rowVersion,1);
  assert.equal((await pool.query("SELECT count(*)::int n FROM survey_notifications WHERE tenant_id=$1 AND event_key LIKE 'survey-role:%'",[tenant])).rows[0].n,1);checks.push('Within-team role change retains membership/version and notifies Manager once');
  await call(patch({...input(people.instrument!,'PARTY_CHIEF',2),action:'set-role',role:'INSTRUMENT_MAN'}),200,'Within-team demotion retains named-team identity');
  const removal=input(people.instrument!,'INSTRUMENT_MAN',3);
  const delegated=randomUUID();await pool.query("INSERT INTO tickets(id,tenant_id,project_id,company_id,requester_id,workflow_variant,status,craft,description,aor_node_id,ticket_type,requested_date,ticket_number,first_submitted_at,survey_lead_id,assigned_party_chief_id) VALUES($1,$2,$3,$4,$5,'STANDARD_APPROVAL','APPROVED','Survey','Owned pending role delegation',$6,'LAYOUT',CURRENT_DATE+7,$7,now(),$8,$8)",[delegated,tenant,project,company,people.requester,area,'ROLE188-DELEGATED-'+delegated,people.superintendent]);
  await pool.query('INSERT INTO survey_work_delegations(tenant_id,project_id,ticket_id,team_id,lead_user_id,delegated_by) VALUES($1,$2,$3,$4,$5,$6)',[tenant,project,delegated,team,people.superintendent,people.manager]);
  await deny(removal,'superintendent',409,'Pending team work blocks removal of non-lead member');
  await pool.query("UPDATE survey_work_delegations SET ended_at=now(),end_reason='OWNED_FIXTURE_STAGE' WHERE tenant_id=$1 AND ticket_id=$2",[tenant,delegated]);
  await pool.query('INSERT INTO crew_rosters(tenant_id,project_id,party_chief_id,instrument_man_id) VALUES($1,$2,$3,$4)',[tenant,project,people.chief,people.instrument]);await deny(removal,'superintendent',409,'Unresolved crew blocks subordinate exit');await pool.query('UPDATE crew_rosters SET deactivated_at=now() WHERE tenant_id=$1 AND project_id=$2',[tenant,project]);
  await pool.query('INSERT INTO aor_assignments(tenant_id,project_id,user_id,aor_node_id) VALUES($1,$2,$3,$4)',[tenant,project,people.instrument,area]);await deny(removal,'superintendent',409,'Unresolved individual Area blocks subordinate exit');await pool.query('UPDATE aor_assignments SET deactivated_at=now() WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3',[tenant,project,people.instrument]);
  await pool.query('INSERT INTO survey_reporting_links(tenant_id,project_id,aor_node_id,superintendent_id,party_chief_id,assigned_by) VALUES($1,$2,$3,$4,$5,$6)',[tenant,project,area,people.superintendent,people.chief,people.manager]);await deny(input(people.chief!,'PARTY_CHIEF'),'superintendent',409,'Unresolved reporting blocks Chief removal');await pool.query('UPDATE survey_reporting_links SET deactivated_at=now() WHERE tenant_id=$1 AND project_id=$2',[tenant,project]);
  await pool.query("INSERT INTO project_responsibility_grants(tenant_id,project_id,aor_node_id,user_id,responsibility,granted_by) VALUES($1,$2,$3,$4,'SURVEY_REVIEWER',$5)",[tenant,project,area,people.instrument,people.manager]);await deny(removal,'superintendent',409,'Unresolved protected Area responsibility blocks role exit');await pool.query('UPDATE project_responsibility_grants SET revoked_at=now(),revoked_by=$3 WHERE tenant_id=$1 AND project_id=$2',[tenant,project,people.manager]);
  await pool.query("INSERT INTO acting_grants(tenant_id,project_id,user_id,role,trigger,granted_by,granted_reason) VALUES($1,$2,$3,'INSTRUMENT_MAN','VACANCY','OWNED_FIXTURE','Owned obligation stage')",[tenant,project,people.instrument]);await deny(removal,'superintendent',409,'Unresolved acting duty blocks role exit');await pool.query('UPDATE acting_grants SET revoked_at=now(),revoked_by=$3 WHERE tenant_id=$1 AND project_id=$2',[tenant,project,people.manager]);
  const work=randomUUID();await pool.query("INSERT INTO tickets(id,tenant_id,project_id,company_id,requester_id,workflow_variant,status,craft,description,aor_node_id,ticket_type,requested_date,ticket_number,first_submitted_at,assigned_instrument_man_id) VALUES($1,$2,$3,$4,$5,'STANDARD_APPROVAL','IN_PROGRESS','Survey','Owned assigned role work',$6,'LAYOUT',CURRENT_DATE+7,$7,now(),$8)",[work,tenant,project,company,people.requester,area,'ROLE188-WORK-'+work,people.instrument]);await deny(removal,'superintendent',409,'Unresolved personally assigned field work blocks exit');await pool.query("UPDATE tickets SET status='COMPLETED' WHERE tenant_id=$1 AND id=$2",[tenant,work]);
  // These synthetic state stages are owned fixtures, not workflow journey evidence.
  const history=JSON.stringify((await pool.query('SELECT to_jsonb(t) row FROM tickets t WHERE tenant_id=$1 ORDER BY id',[tenant])).rows);
  const fn='role188_fault_'+tenant.replaceAll('-',''),before=await witness();
  await pool.query('CREATE FUNCTION '+fn+"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.tenant_id='"+tenant+"'::uuid AND NEW.event_type='survey.role_changed' THEN RAISE EXCEPTION 'owned role audit fault'; END IF; RETURN NEW; END $$");await pool.query('CREATE TRIGGER '+fn+' BEFORE INSERT ON survey_staffing_events FOR EACH ROW EXECUTE FUNCTION '+fn+'()');
  try{await call(patch(removal),500,'Role evidence failure refuses whole removal');assert.equal(await witness(),before);checks.push('After team save actual audit fault rolls back membership, coverage, team version, role/session, notification, evidence and ledger');}finally{await pool.query('DROP TRIGGER '+fn+' ON survey_staffing_events');await pool.query('DROP FUNCTION '+fn+'()');}
  const key=randomUUID();await call(patch(removal,'superintendent',key),200,'Confirmed Superintendent removal atomically exits team and becomes Requester');
  const after=await witness();await call(patch(removal,'superintendent',key),200,'Original exact removal retry succeeds after member no longer belongs to team');assert.equal(await witness(),after);
  const actual=await get('superintendent',team);assert.equal(actual.team.rowVersion,2);assert.deepEqual(actual.team.areas.map((a:{id:string})=>a.id).sort(),[area,area2].sort());assert(!actual.team.members.some((m:{userId:string})=>m.userId===people.instrument));
  assert.deepEqual((await pool.query('SELECT pm.role,u.session_version FROM project_memberships pm JOIN users u ON u.id=pm.user_id WHERE pm.project_id=$1 AND u.id=$2',[project,people.instrument])).rows[0],{role:'REQUESTER',session_version:4});
  assert.equal((await pool.query("SELECT count(*)::int n FROM survey_staffing_events WHERE tenant_id=$1 AND event_type='survey.team_updated'",[tenant])).rows[0].n,1);assert.equal((await pool.query("SELECT count(*)::int n FROM survey_staffing_events WHERE tenant_id=$1 AND event_type='survey.role_changed' AND payload->>'userId'=$2",[tenant,people.instrument])).rows[0].n,3);assert.equal((await pool.query("SELECT count(*)::int n FROM survey_notifications WHERE tenant_id=$1 AND event_key=$2",[tenant,'team:'+team+':2'])).rows[0].n,1);checks.push('Exact retry commits one team exit, one removal evidence, one Manager notice and preserves complete multi-Area coverage');
  assert.equal(JSON.stringify((await pool.query('SELECT to_jsonb(t) row FROM tickets t WHERE tenant_id=$1 ORDER BY id',[tenant])).rows),history);checks.push('Role removal preserves existing request and assignment state');
  await call(patch({...removal,expectedTeamVersion:2},'superintendent',key),409,'Different body cannot replace recorded removal intent');
  await deny({...removal,expectedTeamVersion:2},'superintendent',403,'New command cannot infer former membership authority');
  await pool.query('UPDATE survey_teams SET lead_user_id=$3 WHERE tenant_id=$1 AND id=$2',[tenant,team,people.chief]);await call(patch(removal,'superintendent',key),403,'Revoked current team leadership prevents recorded replay');await pool.query('UPDATE survey_teams SET lead_user_id=$3 WHERE tenant_id=$1 AND id=$2',[tenant,team,people.superintendent]);
  await pool.query('UPDATE aor_nodes SET retired_at=now() WHERE tenant_id=$1 AND id=$2',[tenant,area2]);await call(patch(removal,'superintendent',key),409,'Retired current team coverage refuses replay');await pool.query('UPDATE aor_nodes SET retired_at=NULL WHERE tenant_id=$1 AND id=$2',[tenant,area2]);
  const holding=await pool.connect();await holding.query('BEGIN');await acquireTenantLifecycleLock(holding,tenant as UUID,'EXCLUSIVE');const pending=patch(removal,'superintendent',key);let waited=false;for(let i=0;i<100;i++){if((await pool.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query='SELECT id FROM tenants WHERE id=$1 FOR UPDATE'")).rows.length){waited=true;break;}await new Promise(r=>setTimeout(r,20));}assert(waited);await holding.query('UPDATE users SET session_version=session_version+1 WHERE tenant_id=$1 AND id=$2',[tenant,people.superintendent]);await holding.query('COMMIT');holding.release();await call(pending,401,'Session revoked during actual lifecycle wait refuses old retry');tokens.superintendent=signToken(people.superintendent as UUID,tenant as UUID,2);
  const chiefChange={...input(people.chief!,'PARTY_CHIEF',1,2),action:'set-role',role:'INSTRUMENT_MAN'};const concurrent=await Promise.all([patch(chiefChange),patch(chiefChange)]);assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);checks.push('Actual concurrent reviewed role commands serialize, one succeeds and one needs fresh review');
  await pool.query("UPDATE projects SET status='ARCHIVED' WHERE tenant_id=$1 AND id=$2",[tenant,project]);await call(patch(removal,'superintendent',key),409,'Archived project blocks role mutation and recorded retry');await pool.query("UPDATE projects SET status='ACTIVE' WHERE tenant_id=$1 AND id=$2",[tenant,project]);
  const managerRemoval={action:'remove-role',userId:people.coverage,expectedRole:'SURVEY_SUPERINTENDENT',expectedRoleVersion:1,confirmRoleChanges:true};await deny(managerRemoval,'manager',409,'Manager explicit removal requires prior named-team exit');
  const other=(await get('manager',otherTeam)).team;await call(POST(req('POST',{teamId:otherTeam,expectedVersion:other.rowVersion,name:other.name,areaId:area,areaIds:[area,area2],leadUserId:people.incoming,memberIds:[people.incoming]},'manager'),ctx()),200,'Existing Manager team action resolves subordinate membership first');await call(patch(managerRemoval,'manager'),200,'Manager removes another resolved Superintendent to Requester');
  await deny({action:'remove-role',userId:people.manager,expectedRole:'SURVEY_MANAGER',expectedRoleVersion:1,confirmRoleChanges:true},'manager',400,'Manager self-removal remains separate independent administration');
  await deny({action:'set-role',userId:people.requester,expectedRole:'REQUESTER',expectedRoleVersion:1,role:'INSTRUMENT_MAN',confirmRoleChanges:true},'manager',400,'Manager Team Management retains Survey-only promotion boundary');
  await writeFile('.local/finalization/scoped-role-fixture.json',JSON.stringify({tenant,project,company,area,area2,team,otherTeam,people,tokens,origin:'http://127.0.0.1:3185'}));await writeFile('.local/finalization/scoped-role-postgres-results.json',JSON.stringify({checks,mode:'Actual authenticated Next handlers and PostgreSQL; separate HTTP/browser gate',retainedData:'Only newly owned roles188 identities; synthetic obligation stages are not journey evidence'},null,2));console.log('Owned scoped Survey roles: '+checks.length+' named checks pass.');
 }finally{await pool.end();}
}
void main().catch(e=>{console.error(e.name+': '+e.message);process.exitCode=1;});
