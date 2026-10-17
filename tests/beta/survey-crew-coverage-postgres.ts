import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {Pool} from 'pg';
import {acquireTenantLifecycleLock} from '../../src/lib/tenant-lifecycle-lock';
import {reorganizeSurvey} from '../../src/modules/tenancy/application/reorganize-survey';
import {SurveyReorganizationPgRepository} from '../../src/modules/tenancy/infrastructure/survey-reorganization.repository';
import {SurveyTeamsPgRepository} from '../../src/modules/tenancy/infrastructure/survey-teams.repository';
import {saveSurveyTeam} from '../../src/modules/tenancy/application/survey-teams';
import type {StaffingActor} from '../../src/modules/tenancy/application/save-survey-staffing';
import type {UUID} from '../../src/shared/types';

// A newly owned empty database only. The entire migration/fixture/test transaction rolls back.
async function main(){
 const url=new URL(process.env.DATABASE_URL??'');
 assert.equal(process.env.SWR_CREW_COVERAGE_TEST,'1');
 assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15497');assert.equal(url.pathname,'/swr_crew_coverage');
 const pool=new Pool({connectionString:url.href});const db=await pool.connect();
 try{
  assert.equal((await db.query("SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")).rows[0].n,0,'Refuse existing public tables; never reset retained data');
  await db.query('BEGIN');
  for(const file of (await readdir(resolve('db/migrations'))).filter(name=>name.endsWith('.sql')).sort())await db.query(await readFile(resolve('db/migrations',file),'utf8'));
  const uuid=()=>randomUUID() as UUID;
  const tenant=uuid(),project=uuid(),company=uuid(),manager=uuid(),chief=uuid(),instrument=uuid(),oldSuperintendent=uuid(),newSuperintendent=uuid(),requester=uuid(),level=uuid(),area=uuid(),otherArea=uuid(),ticket=uuid();
  await db.query("INSERT INTO tenants(id,name) VALUES($1,'Owned crew coverage regression')",[tenant]);
  await db.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'Owned GC','GC')",[company,tenant]);
  await db.query("INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,'Owned project','ACTIVE','FULL')",[project,tenant]);
  const foreignTenant=uuid(),foreignProject=uuid(),sameTenantProject=uuid();
  await db.query("INSERT INTO tenants(id,name) VALUES($1,'Owned foreign tenant')",[foreignTenant]);
  await db.query("INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,'Owned foreign project','ACTIVE','FULL'),($3,$4,'Owned other project','ACTIVE','FULL')",[foreignProject,foreignTenant,sameTenantProject,tenant]);
  for(const [user,role] of [[manager,'SURVEY_MANAGER'],[chief,'PARTY_CHIEF'],[instrument,'INSTRUMENT_MAN'],[oldSuperintendent,'SURVEY_SUPERINTENDENT'],[newSuperintendent,'SURVEY_SUPERINTENDENT'],[requester,'REQUESTER']]){
   await db.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,$5,'not-a-login')",[user,tenant,company,`${user}@example.test`,role]);
   await db.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)',[project,user,role]);
  }
  await db.query("INSERT INTO aor_levels(id,tenant_id,project_id,depth,label) VALUES($1,$2,$3,0,'Area')",[level,tenant,project]);
  for(const [id,name] of [[area,'Crew Area'],[otherArea,'Other Team Area']])await db.query('INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,name,code) VALUES($1,$2,$3,$4,$5,$5)',[id,tenant,project,level,name]);
  for(const user of [chief,oldSuperintendent,newSuperintendent])await db.query('INSERT INTO aor_assignments(tenant_id,project_id,user_id,aor_node_id) VALUES($1,$2,$3,$4)',[tenant,project,user,area]);
  await db.query('INSERT INTO crew_rosters(tenant_id,project_id,party_chief_id,instrument_man_id) VALUES($1,$2,$3,$4)',[tenant,project,chief,instrument]);
  await db.query('INSERT INTO survey_reporting_links(tenant_id,project_id,superintendent_id,party_chief_id,aor_node_id,assigned_by) VALUES($1,$2,$3,$4,$5,$6)',[tenant,project,oldSuperintendent,chief,area,manager]);
  const actor:StaffingActor={tenantId:tenant,projectId:project,actorId:manager,actorRole:'SURVEY_MANAGER',sessionVersion:1};
  await acquireTenantLifecycleLock(db,tenant,'EXCLUSIVE');
  const teams=new SurveyTeamsPgRepository();
  const saved=await saveSurveyTeam(teams,db,actor,{teamId:null,expectedVersion:null,name:'Chief-led multi-Area team',areaId:otherArea,areaIds:[otherArea,area],leadUserId:chief,memberIds:[chief,instrument]});
  await db.query("INSERT INTO tickets(id,tenant_id,project_id,company_id,requester_id,workflow_variant,status,craft,description,aor_node_id,ticket_type,requested_date,assigned_party_chief_id,assigned_instrument_man_id,survey_lead_id) VALUES($1,$2,$3,$4,$5,'STANDARD_APPROVAL','ASSIGNED','Survey','Owned assigned request',$6,'LAYOUT',CURRENT_DATE,$7,$8,$9)",[ticket,tenant,project,company,requester,area,chief,instrument,oldSuperintendent]);
  await db.query("INSERT INTO ticket_events(ticket_id,tenant_id,actor_id,event_type,payload) VALUES($1,$2,$3,'ticket.assigned','{\"ownedCoverageWitness\":true}')",[ticket,tenant,manager]);
  const repo=new SurveyReorganizationPgRepository(),selection={kind:'CREW' as const,partyChiefId:chief,areaId:area,superintendentId:newSuperintendent};
  const protectedTables=['survey_teams','survey_team_areas','survey_team_members','crew_rosters','aor_assignments','tickets','ticket_events','project_memberships','users','survey_notifications'];
  async function witness(tables=protectedTables){
   const rows:unknown[]=[];
   for(const table of tables)rows.push((await db.query(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) data FROM ${table} t`)).rows[0].data);
   return rows;
  }
  const before=await witness(),teamBefore=await teams.team(db,tenant,project,saved.teamId);
  const preview=await repo.preview(db,actor,selection);
  assert.deepEqual(preview.blockers,[]);assert.equal(preview.activeWork,1);
  await reorganizeSurvey(repo,db,actor,{...selection,snapshot:preview.snapshot,reason:'Change Superintendent within the same Area',confirmed:true});
  assert.deepEqual(await teams.team(db,tenant,project,saved.teamId),teamBefore,'Preserve all coverage, primary Area, lead, members and team version');
  assert.deepEqual(await witness(),before,'Preserve exact team/coverage/roster/account/request/history/notification rows');
  assert.equal((await db.query('SELECT superintendent_id FROM survey_reporting_links WHERE party_chief_id=$1 AND deactivated_at IS NULL',[chief])).rows[0].superintendent_id,newSuperintendent);
  assert.equal((await db.query('SELECT count(*)::int n FROM survey_reporting_links WHERE party_chief_id=$1 AND deactivated_at IS NOT NULL',[chief])).rows[0].n,1,'Retain prior reporting evidence');
  const event=(await db.query("SELECT payload FROM survey_staffing_events WHERE project_id=$1 AND payload->>'action'='coordinated-reorganization'",[project])).rows[0].payload;
  assert.equal(event.historicalWorkUnchanged,true);assert.equal(event.activeAssignmentCount,1);assert.equal(event.previous.team.rowVersion,teamBefore!.rowVersion);
  const allTables=[...protectedTables,'survey_reporting_links','survey_staffing_events'];
  async function refused(otherActor:StaffingActor,input:typeof selection,expected:RegExp,snapshot=preview.snapshot){
   const state=await witness(allTables);
   await assert.rejects(reorganizeSurvey(repo,db,otherActor,{...input,snapshot,reason:'Refused owned coverage regression command',confirmed:true}),expected);
   assert.deepEqual(await witness(allTables),state,'A refused command must change no records');
  }
  await refused(actor,selection,/changed/);
  const reverse={...selection,superintendentId:oldSuperintendent};
  const current=await repo.preview(db,actor,reverse);
  for(const role of ['SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN','REQUESTER','PROJECT_ADMIN'] as const)await refused({...actor,actorRole:role},reverse,/Only the Survey Manager/,current.snapshot);
  await refused({...actor,sessionVersion:99},reverse,/assignment or session has changed/,current.snapshot);
  await refused({...actor,projectId:foreignProject},reverse,/Project not found/,current.snapshot);
  await refused({...actor,projectId:sameTenantProject},reverse,/assignment or session has changed/,current.snapshot);
  await refused({...actor,tenantId:foreignTenant},reverse,/Project not found/,current.snapshot);
  await db.query('SAVEPOINT revoked_case');
  await db.query("UPDATE project_memberships SET role='PARTY_CHIEF' WHERE project_id=$1 AND user_id=$2",[project,manager]);
  await refused(actor,reverse,/assignment or session has changed/,current.snapshot);
  await db.query('ROLLBACK TO SAVEPOINT revoked_case');
  await db.query('UPDATE project_memberships SET access_disabled_at=NOW(),access_disabled_by=$3 WHERE project_id=$1 AND user_id=$2',[project,manager,manager]);
  await refused(actor,reverse,/assignment or session has changed/,current.snapshot);
  await db.query('ROLLBACK TO SAVEPOINT revoked_case');
  await db.query("UPDATE companies SET type='SUBCONTRACTOR' WHERE id=$1",[company]);
  await refused(actor,reverse,/assignment or session has changed/,current.snapshot);
  await db.query('ROLLBACK TO SAVEPOINT revoked_case');
  await db.query('SAVEPOINT archived_case');
  await db.query("UPDATE projects SET status='ARCHIVED' WHERE id=$1",[project]);
  await refused(actor,reverse,/Closed projects/,current.snapshot);
  await db.query('ROLLBACK TO SAVEPOINT archived_case');
  await db.query('SAVEPOINT fault_case');
  const stateBeforeFault=await witness(allTables);
  await db.query("CREATE FUNCTION owned_crew_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'owned crew audit failure'; END $$");
  await db.query('CREATE TRIGGER owned_crew_audit_failure BEFORE INSERT ON survey_staffing_events FOR EACH ROW EXECUTE FUNCTION owned_crew_audit_failure()');
  await assert.rejects(reorganizeSurvey(repo,db,actor,{...reverse,snapshot:current.snapshot,reason:'Fault must roll back the reporting change',confirmed:true}),/owned crew audit failure/);
  await db.query('ROLLBACK TO SAVEPOINT fault_case');
  assert.deepEqual(await witness(allTables),stateBeforeFault,'Audit failure rolls back reporting, team and all protected state');
  await db.query('ROLLBACK');
  console.log('PASS same-Area reporting with active work; full named-team coverage/version/history preservation; wrong roles, tenant/project scope, stale snapshot/session, archived refusal and audit-fault rollback. All current migrations/fixtures rolled back.');
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();await pool.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});