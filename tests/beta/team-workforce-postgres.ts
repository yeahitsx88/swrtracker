import {inUnitRequestScope} from '../setup/unit-request-scope';
// Actual HTTP handlers and repositories against a fresh disposable database. Never use Sabine.
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {NextRequest} from 'next/server';
import {signToken} from '../../src/lib/auth';
import {getPool} from '../../src/lib/db';
import {GET as workforceGetHandler,POST as workforcePostHandler} from '../../src/app/api/projects/[projectId]/survey/workforce/route';
import {GET as metricsGetHandler} from '../../src/app/api/projects/[projectId]/metrics/route';
import {POST as projectPost} from '../../src/app/api/projects/route';
import {GET as administrationGet} from '../../src/app/api/projects/administration/route';
import {GET as teamsGetHandler,POST as teamsPostHandler,DELETE as teamsDeleteHandler,PATCH as teamsPatchHandler} from '../../src/app/api/projects/[projectId]/survey/teams/route';
import {SurveyWorkforcePgRepository} from '../../src/modules/tenancy/infrastructure/survey-workforce.repository';
import {randomUUID} from 'node:crypto';
import type {UUID} from '../../src/shared/types';
const workforceGet=inUnitRequestScope(workforceGetHandler);
const workforcePost=inUnitRequestScope(workforcePostHandler);
const metricsGet=inUnitRequestScope(metricsGetHandler);
const teamsGet=inUnitRequestScope(teamsGetHandler);
const teamsPost=inUnitRequestScope(teamsPostHandler);
const teamsDelete=inUnitRequestScope(teamsDeleteHandler);
const teamsPatch=inUnitRequestScope(teamsPatchHandler);
const id=(n:number)=>`96000000-0000-4000-8000-${String(n).padStart(12,'0')}` as UUID;
export const fixture={tenant:id(1),company:id(2),project:id(3),foreignTenant:id(4),foreignCompany:id(5),foreignProject:id(6),sameProject:id(7),
 manager:id(10),admin:id(11),superA:id(12),superB:id(13),chiefA:id(14),chiefB:id(15),outsideChief:id(16),imA:id(17),imB:id(18),outsideIM:id(19),requester:id(20),foreignIM:id(21),inactiveIM:id(22),chiefA2:id(24),area:id(30),level:id(31),otherArea:id(32)};
const f=fixture;
async function main(){
 const url=new URL(process.env.DATABASE_URL??'');
 if(process.env.SWR_TEAM_POSTGRES!=='1'||url.hostname!=='127.0.0.1'||url.port!=='15489'||url.pathname!=='/swr_team_isolated')throw Error('Disposable loopback fixture required');
 const pg=new Pool({connectionString:url.href});let checks=0;
 const token=(user:UUID)=>signToken(user,user===f.foreignIM?f.foreignTenant:f.tenant);
 const req=(user:UUID,path:string,method='GET',body?:unknown,key=randomUUID())=>new NextRequest(`http://localhost${path}`,{method,headers:{cookie:`swr_session=${token(user)}`,'content-type':'application/json','Idempotency-Key':key},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const ctx=(project=f.project)=>({params:Promise.resolve({projectId:project})});
 const checked=async(call:Promise<Response>,status:number)=>{const response=await call;const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));checks++;return data;};
 const read=(user:UUID,query='',project=f.project)=>workforceGet(req(user,`/api/projects/${project}/survey/workforce${query}`),ctx(project));
 const kpi=(user:UUID,member:UUID,extra='',project=f.project)=>metricsGet(req(user,`/api/projects/${project}/metrics?view=charts&memberId=${member}${extra}`),ctx(project));
 const snapshot=async()=> (await checked(read(f.superA,'?mode=context'),200)).snapshotToken;
 const move=(user:UUID,input:unknown,key=randomUUID(),project=f.project)=>workforcePost(req(user,`/api/projects/${project}/survey/workforce`,'POST',input,key),ctx(project));
 try{
 assert.equal((await pg.query('SELECT count(*)::int AS n FROM projects WHERE id=$1',[f.project])).rows[0].n,0,'Fresh fixture required');
 await pg.query('INSERT INTO tenants(id,name) VALUES($1,\'Increment\'),($2,\'Foreign increment\')',[f.tenant,f.foreignTenant]);
 await pg.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'GC','GC'),($3,$4,'Foreign GC','GC')",[f.company,f.tenant,f.foreignCompany,f.foreignTenant]);
 for(const [project,tenant] of [[f.project,f.tenant],[f.sameProject,f.tenant],[f.foreignProject,f.foreignTenant]])await pg.query("INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,'Increment fixture','ACTIVE','FULL')",[project,tenant]);
 const people=[[f.manager,'SURVEY_MANAGER'],[f.admin,'PROJECT_ADMIN'],[f.superA,'SURVEY_SUPERINTENDENT'],[f.superB,'SURVEY_SUPERINTENDENT'],[f.chiefA,'PARTY_CHIEF'],[f.chiefB,'PARTY_CHIEF'],[f.chiefA2,'PARTY_CHIEF'],[f.outsideChief,'PARTY_CHIEF'],[f.imA,'INSTRUMENT_MAN'],[f.imB,'INSTRUMENT_MAN'],[f.outsideIM,'INSTRUMENT_MAN'],[f.inactiveIM,'INSTRUMENT_MAN'],[f.requester,'REQUESTER'],[f.foreignIM,'INSTRUMENT_MAN']] as const;
 for(const [user,role] of people){const foreign=user===f.foreignIM;await pg.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,$5,'not-a-login-hash')",[user,foreign?f.foreignTenant:f.tenant,foreign?f.foreignCompany:f.company,`increment-${user}@example.test`,role+' '+user.slice(-2)]);await pg.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)',[foreign?f.foreignProject:f.project,user,role]);}
 await pg.query("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'TENANT_ADMIN')",[f.tenant,f.admin]);
 await pg.query("INSERT INTO aor_levels(id,tenant_id,project_id,depth,label) VALUES($1,$2,$3,0,'Area')",[f.level,f.tenant,f.project]);
 for(const node of [f.area,f.otherArea])await pg.query("INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,name,code) VALUES($1,$2,$3,$4,$5,$6)",[node,f.tenant,f.project,f.level,node===f.area?'Shared Area':'Other Area',node===f.area?'SHARED':'OTHER']);
 for(const user of [f.superA,f.superB])await pg.query('INSERT INTO aor_assignments(tenant_id,project_id,user_id,aor_node_id) VALUES($1,$2,$3,$4)',[f.tenant,f.project,user,f.area]);
 for(const [chief,superintendent] of [[f.chiefA,f.superA],[f.chiefA2,f.superA],[f.chiefB,f.superB]])await pg.query('INSERT INTO survey_reporting_links(tenant_id,project_id,superintendent_id,party_chief_id,aor_node_id,assigned_by) VALUES($1,$2,$3,$4,$5,$6)',[f.tenant,f.project,superintendent,chief,f.area,f.manager]);
 for(const [im,chief] of [[f.imA,f.chiefA],[f.imB,f.chiefB],[f.inactiveIM,f.chiefA]])await pg.query('INSERT INTO crew_rosters(tenant_id,project_id,party_chief_id,instrument_man_id) VALUES($1,$2,$3,$4)',[f.tenant,f.project,chief,im]);
 await pg.query('UPDATE users SET deactivated_at=now(),deactivated_by=id WHERE id=$1',[f.inactiveIM]);
 for(const [n,chief,im] of [[40,f.chiefA,f.imA],[41,f.chiefB,f.imB],[42,f.chiefA,f.imB],[43,null,f.imA]] as const)await pg.query(`INSERT INTO tickets(id,tenant_id,project_id,aor_node_id,company_id,ticket_number,requester_id,assigned_party_chief_id,assigned_instrument_man_id,workflow_variant,status,craft,description,requested_date,ticket_type)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'STANDARD_APPROVAL','ASSIGNED','Survey','Synthetic increment only','2026-10-01','LAYOUT')`,[id(n),f.tenant,f.project,f.area,f.company,`INC-${n}`,f.requester,chief,im]);
 const ids=(data:{data:Array<{userId:string}>})=>data.data.map(p=>p.userId).sort();
 assert.deepEqual(ids(await checked(read(f.superA),200)),[f.chiefA,f.chiefA2,f.imA].sort());checks++;
 assert.deepEqual(ids(await checked(read(f.superB),200)),[f.chiefB,f.imB].sort());checks++;
 assert.deepEqual(ids(await checked(read(f.chiefA),200)),[f.imA]);checks++;
 assert.equal((await checked(teamsGet(req(f.manager,`/api/projects/${f.project}/survey/teams`),ctx()),200)).total,0);
 await checked(read(f.requester),403);await checked(read(f.admin),403);
 await checked(read(f.superA,`?mode=person&personId=${f.imB}`),404);
 await checked(read(f.chiefA,`?mode=person&personId=${f.imB}`),404);
 await checked(read(f.chiefA,`?mode=person&personId=${f.foreignIM}`),404);
 await checked(read(f.superA,'',f.sameProject),403);await checked(read(f.superA,'',f.foreignProject),403);
 for(const user of [f.manager,f.superA,f.chiefA]){const data=await checked(kpi(user,f.imA),200);assert.equal(data.metrics.total,user===f.manager?2:1);assert.deepEqual(data.metrics.charts.instrumentMen,[]);assert.deepEqual(data.metrics.charts.facets.crews,[]);checks++;}
 await checked(kpi(f.manager,f.superA),200);
 for(const user of [f.superA,f.chiefA]){await checked(kpi(user,f.imB),404);await checked(kpi(user,f.foreignIM),404);await checked(kpi(user,f.imA,'&instrumentManId='+f.imB),404);}
 await checked(metricsGet(req(f.superA,`/api/projects/${f.project}/metrics?view=charts&cohort=linkedCrews&instrumentManId=${f.imB}`),ctx()),404);
 await checked(kpi(f.superA,f.imA,'&cohort=areaWorkload'),400);
 await checked(kpi(f.superA,f.imA,'',f.sameProject),403);
 // Same-team reorganization now requires an explicit Superintendent-led named team.
 const workforceTeam=await checked(teamsPost(req(f.manager,`/api/projects/${f.project}/survey/teams`,'POST',{name:'Owned scoped workforce',areaId:f.area,leadUserId:f.superA,memberIds:[f.superA,f.chiefA,f.chiefA2,f.imA]}),ctx()),201);
 const base={destinationTeamId:workforceTeam.teamId,instrumentManId:f.imA,partyChiefId:f.chiefA2,expectedSnapshot:await snapshot()};
 const count=async()=>Number((await pg.query("SELECT count(*) AS n FROM survey_staffing_events WHERE project_id=$1 AND payload->>'action'='reorganize-roster'",[f.project])).rows[0].n);
 for(const input of [{...base,instrumentManId:f.imB},{...base,partyChiefId:f.chiefB},{...base,instrumentManId:f.foreignIM},{...base,instrumentManId:f.outsideIM},{...base,expectedSnapshot:'0'.repeat(32)}])await checked(move(f.superA,input),input.expectedSnapshot==='0'.repeat(32)?409:404);
 await checked(move(f.chiefA,base),403);assert.equal(await count(),0);checks++;
 const key=randomUUID();await checked(move(f.superA,base,key),200);await checked(move(f.superA,base,key),200);assert.equal(await count(),1);checks++;
 await checked(read(f.chiefA,`?mode=person&personId=${f.imA}`),404);await checked(kpi(f.chiefA,f.imA),404);
 assert.deepEqual(ids(await checked(read(f.chiefA2),200)),[f.imA]);checks++;
 // D1/D4/D5: independently supervised Chief-led destination, deliberately selected.
 const transferChief=id(25);
 await pg.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,'transfer-chief@example.test','Destination Chief','not-a-login-hash')",[transferChief,f.tenant,f.company]);
 await pg.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'PARTY_CHIEF')",[f.project,transferChief]);
 await pg.query('INSERT INTO aor_assignments(tenant_id,project_id,user_id,aor_node_id) VALUES($1,$2,$3,$4)',[f.tenant,f.project,f.superA,f.otherArea]);
 await pg.query('INSERT INTO survey_reporting_links(tenant_id,project_id,superintendent_id,party_chief_id,aor_node_id,assigned_by) VALUES($1,$2,$3,$4,$5,$6)',[f.tenant,f.project,f.superA,transferChief,f.area,f.manager]);
 const destination=await checked(teamsPost(req(f.manager,`/api/projects/${f.project}/survey/teams`,'POST',{name:'Explicit supervised destination',areaId:f.otherArea,leadUserId:transferChief,memberIds:[transferChief]}),ctx()),201);
 const destinationInput={instrumentManId:f.imA,partyChiefId:transferChief,destinationTeamId:destination.teamId,expectedSnapshot:await snapshot()};
 await checked(move(f.superA,{instrumentManId:f.imA,partyChiefId:transferChief,expectedSnapshot:destinationInput.expectedSnapshot}),400);
 await checked(move(f.superA,{...destinationInput,destinationTeamId:randomUUID()}),404);
 await checked(move(f.superA,{...destinationInput,partyChiefId:f.chiefA2}),409);
 const coverageDenied=await checked(move(f.superA,destinationInput),409);assert.equal(coverageDenied.error.code,'TRANSFER_AREA_COVERAGE');checks++;
 assert.equal((await pg.query('SELECT team_id FROM survey_team_members WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3 AND deactivated_at IS NULL',[f.tenant,f.project,f.imA])).rows[0].team_id,workforceTeam.teamId);checks++;
 // Coverage is a separate actual Manager command; the Superintendent never edits it.
 await checked(teamsPost(req(f.manager,`/api/projects/${f.project}/survey/teams`,'POST',{teamId:destination.teamId,expectedVersion:1,name:'Explicit supervised destination',areaId:f.otherArea,areaIds:[f.area,f.otherArea].sort(),leadUserId:transferChief,memberIds:[transferChief]}),ctx()),200);
 const fingerprint=async(table:string)=> (await pg.query(`SELECT md5(COALESCE(string_agg(to_jsonb(t)::text,',' ORDER BY to_jsonb(t)::text),'')) AS hash FROM ${table} t WHERE tenant_id=$1 AND project_id=$2`,[f.tenant,f.project])).rows[0].hash;
 const coverageBefore=await fingerprint('survey_team_areas'),requestsBefore=await fingerprint('tickets');
 const transferInput={...destinationInput,expectedSnapshot:await snapshot()},transferKey=randomUUID(),beforeTransferEvents=await count();
 await checked(move(f.superA,transferInput,transferKey),200);await checked(move(f.superA,transferInput,transferKey),200);
 assert.equal(await count(),beforeTransferEvents+1);assert.equal(await fingerprint('survey_team_areas'),coverageBefore);assert.equal(await fingerprint('tickets'),requestsBefore);checks+=3;
 assert.equal((await pg.query('SELECT team_id FROM survey_team_members WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3 AND deactivated_at IS NULL',[f.tenant,f.project,f.imA])).rows[0].team_id,destination.teamId);checks++;
 assert.equal((await pg.query('SELECT party_chief_id FROM crew_rosters WHERE tenant_id=$1 AND project_id=$2 AND instrument_man_id=$3 AND deactivated_at IS NULL',[f.tenant,f.project,f.imA])).rows[0].party_chief_id,transferChief);checks++;
 await checked(move(f.superA,{...transferInput,destinationTeamId:workforceTeam.teamId},transferKey),409);
 const rollbackInput={instrumentManId:f.imA,partyChiefId:f.chiefA2,destinationTeamId:workforceTeam.teamId,expectedSnapshot:await snapshot()},rollbackKey=randomUUID();
 const rosterBefore=await fingerprint('crew_rosters'),membersBefore=(await pg.query("SELECT md5(string_agg(to_jsonb(m)::text,',' ORDER BY team_id,user_id)) hash FROM survey_team_members m WHERE tenant_id=$1 AND project_id=$2",[f.tenant,f.project])).rows[0].hash;
 await pg.query("CREATE FUNCTION fail_supervised_transfer() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.payload->>'action'='reorganize-roster' THEN RAISE EXCEPTION 'owned transfer rollback probe'; END IF; RETURN NEW; END $$");
 await pg.query('CREATE TRIGGER fail_supervised_transfer BEFORE INSERT ON survey_staffing_events FOR EACH ROW EXECUTE FUNCTION fail_supervised_transfer()');
 await checked(move(f.superA,rollbackInput,rollbackKey),500);
 await pg.query('DROP TRIGGER fail_supervised_transfer ON survey_staffing_events');await pg.query('DROP FUNCTION fail_supervised_transfer()');
 assert.equal(await fingerprint('crew_rosters'),rosterBefore);assert.equal((await pg.query("SELECT md5(string_agg(to_jsonb(m)::text,',' ORDER BY team_id,user_id)) hash FROM survey_team_members m WHERE tenant_id=$1 AND project_id=$2",[f.tenant,f.project])).rows[0].hash,membersBefore);checks+=2;
 await pg.query('UPDATE survey_reporting_links SET deactivated_at=NOW() WHERE tenant_id=$1 AND project_id=$2 AND party_chief_id=$3',[f.tenant,f.project,transferChief]);
 await checked(move(f.superA,transferInput,transferKey),404);
 await pg.query('UPDATE survey_reporting_links SET deactivated_at=NULL WHERE tenant_id=$1 AND project_id=$2 AND party_chief_id=$3',[f.tenant,f.project,transferChief]);
 await checked(move(f.superA,rollbackInput,rollbackKey),200);
 // Eligible unassigned crew member remains within the current named structure.
 await pg.query('UPDATE crew_rosters SET deactivated_at=NOW() WHERE tenant_id=$1 AND project_id=$2 AND instrument_man_id=$3 AND deactivated_at IS NULL',[f.tenant,f.project,f.imA]);
 assert.equal((await checked(read(f.superA,`?mode=person&personId=${f.imA}`),200)).person.partyChiefId,null);checks++;
 const unassignedInput={...transferInput,expectedSnapshot:await snapshot()},unassignedKey=randomUUID();
 await checked(move(f.superA,unassignedInput,unassignedKey),200);await checked(move(f.superA,unassignedInput,unassignedKey),200);
 assert.equal(await fingerprint('survey_team_areas'),coverageBefore);assert.equal(await fingerprint('tickets'),requestsBefore);checks+=2;
 await checked(move(f.superA,{...rollbackInput,expectedSnapshot:await snapshot()}),200);
 // The four deliberate membership transfers increment the original team's version.
 // Ending the named team retains explicit crew/reporting links and assignments;
 // subsequent cases intentionally verify the separately retained legacy read path.
 await checked(teamsDelete(req(f.manager,`/api/projects/${f.project}/survey/teams`,'DELETE',{teamId:workforceTeam.teamId,expectedVersion:5,confirmDelete:true}),ctx()),200);
 assert.deepEqual(ids(await checked(read(f.chiefA2),200)),[f.imA]);checks++;
 await pg.query('UPDATE crew_rosters SET deactivated_at=now() WHERE project_id=$1 AND instrument_man_id=$2',[f.project,f.imA]);
 await checked(kpi(f.superA,f.imA),404);await checked(read(f.chiefA2,`?mode=person&personId=${f.imA}`),404);await checked(move(f.superA,base,key),404);
 await pg.query('UPDATE crew_rosters SET deactivated_at=NULL WHERE project_id=$1 AND instrument_man_id=$2',[f.project,f.imA]);
 await pg.query("UPDATE project_memberships SET role='REQUESTER' WHERE project_id=$1 AND user_id=$2",[f.project,f.imA]);
 await checked(kpi(f.superA,f.imA),404);await checked(kpi(f.manager,f.imA),404);
 await pg.query("UPDATE project_memberships SET role='INSTRUMENT_MAN' WHERE project_id=$1 AND user_id=$2",[f.project,f.imA]);
 await pg.query('UPDATE survey_reporting_links SET deactivated_at=now() WHERE project_id=$1 AND superintendent_id=$2',[f.project,f.superA]);
 assert.deepEqual(ids(await checked(read(f.superA),200)),[]);checks++;await checked(kpi(f.superA,f.imA),404);await checked(move(f.superA,base,key),404);
 await pg.query('UPDATE survey_reporting_links SET deactivated_at=NULL WHERE project_id=$1 AND superintendent_id=$2',[f.project,f.superA]);
 await pg.query('UPDATE users SET deactivated_at=now(),deactivated_by=id WHERE id=$1',[f.imA]);await checked(kpi(f.superA,f.imA),404);await checked(kpi(f.manager,f.imA),404);
 await pg.query('UPDATE users SET deactivated_at=NULL,deactivated_by=NULL WHERE id=$1',[f.imA]);
 await pg.query('UPDATE aor_assignments SET deactivated_at=now() WHERE project_id=$1 AND user_id=$2',[f.project,f.superA]);await checked(kpi(f.superA,f.imA),404);
 await pg.query('UPDATE aor_assignments SET deactivated_at=NULL WHERE project_id=$1 AND user_id=$2',[f.project,f.superA]);
 await pg.query('UPDATE users SET session_version=session_version+1 WHERE id=$1',[f.superA]);await checked(read(f.superA),401);await checked(move(f.superA,base),401);
 await pg.query('UPDATE users SET session_version=1 WHERE id=$1',[f.superA]);
 const administration=await checked(administrationGet(req(f.admin,'/api/projects/administration')),200);assert.equal(administration.canCreateProject,true);
 assert.equal((await checked(administrationGet(req(f.requester,'/api/projects/administration')),200)).canCreateProject,false);
 const projectInput={name:'Created by IT Admin',crewBuild:'FULL',tenantId:f.foreignTenant};
 const created=await checked(projectPost(req(f.admin,'/api/projects','POST',projectInput)),201);
 assert.equal(created.project.status,'SETUP');assert.equal(created.project.tenantId,f.tenant);checks++;
 for(const user of [f.manager,f.superA,f.chiefA,f.requester])await checked(projectPost(req(user,'/api/projects','POST',projectInput)),403);
 await checked(projectPost(req(f.admin,'/api/projects','POST',{name:'Foreign template',templateId:f.foreignIM})),404);
 await pg.query('DELETE FROM tenant_memberships WHERE tenant_id=$1 AND user_id=$2',[f.tenant,f.admin]);await checked(projectPost(req(f.admin,'/api/projects','POST',projectInput)),403);
 // Same Area and organizational membership never enlarge the explicit workforce.
 const teamDb=await pg.connect();
 const team=id(60);await teamDb.query('BEGIN');await teamDb.query('INSERT INTO survey_teams(id,tenant_id,project_id,name,aor_node_id,lead_user_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[team,f.tenant,f.project,'Mixed organizational team',f.area,f.chiefA,f.manager]);
 for(const user of [f.chiefA,f.superA,f.imB])await teamDb.query('INSERT INTO survey_team_members(tenant_id,project_id,team_id,user_id) VALUES($1,$2,$3,$4)',[f.tenant,f.project,team,user]);
 await teamDb.query('COMMIT');teamDb.release();
 await checked(read(f.superA,`?mode=person&personId=${f.imB}`),404);
 await checked(teamsPost(req(f.superA,`/api/projects/${f.project}/survey/teams`,'POST',{name:'Unauthorized',areaId:f.area,leadUserId:f.chiefA,memberIds:[f.chiefA]}),ctx()),403);
 // The mixed named team above removes this Superintendent's move authority;
 // Archived project refusal precedes the later same-team move check.
 await pg.query("UPDATE projects SET status='ARCHIVED' WHERE id=$1",[f.project]);const archivedEvents=await count();
 await checked(move(f.superA,{...base,expectedSnapshot:await snapshot()}),409);
 const managerSnapshot=(await checked(read(f.manager,'?mode=context'),200)).snapshotToken;
 await checked(move(f.manager,{...base,expectedSnapshot:managerSnapshot}),403); // Manager uses the separate reorganization command.
 assert.equal(await count(),archivedEvents);checks++;
 await pg.query("UPDATE projects SET status='ACTIVE' WHERE id=$1",[f.project]);
 const repo=new SurveyWorkforcePgRepository();assert.equal(await repo.person(pg,{tenantId:f.foreignTenant,projectId:f.project,actorId:f.superA,actorRole:'SURVEY_SUPERINTENDENT',sessionVersion:1},f.imA),null);checks++;
 await pg.query("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'TENANT_ADMIN')",[f.tenant,f.admin]);
 // D5 existing team/role controls must share current explicit supervised scope.
 const roleSubject=id(26);
 await pg.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,'supervised-role@example.test','Supervised unassigned IM','not-a-login-hash')",[roleSubject,f.tenant,f.company]);
 await pg.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'INSTRUMENT_MAN')",[f.project,roleSubject]);
 await checked(teamsPost(req(f.manager,`/api/projects/${f.project}/survey/teams`,'POST',{teamId:destination.teamId,expectedVersion:6,name:'Explicit supervised destination',areaId:f.otherArea,areaIds:[f.area,f.otherArea].sort(),leadUserId:transferChief,memberIds:[transferChief,roleSubject]}),ctx()),200);
 const scopedTeam=(await checked(teamsGet(req(f.superA,`/api/projects/${f.project}/survey/teams?teamId=${destination.teamId}`),ctx()),200)).team;
 assert.equal(scopedTeam.rowVersion,7);checks++;
 const roleCoverageBefore=await fingerprint('survey_team_areas');
 const roleInput={action:'set-role',userId:roleSubject,expectedRole:'INSTRUMENT_MAN',expectedRoleVersion:1,role:'PARTY_CHIEF',confirmRoleChanges:true,reviewedTeamId:destination.teamId,expectedTeamVersion:7};
 const roleKey=randomUUID(),roleChange=(input:unknown,key=randomUUID())=>teamsPatch(req(f.superA,`/api/projects/${f.project}/survey/teams`,'PATCH',input,key),ctx());
 await checked(roleChange(roleInput,roleKey),200);await checked(roleChange(roleInput,roleKey),200);
 await checked(roleChange({...roleInput,expectedRole:'PARTY_CHIEF',expectedRoleVersion:2,role:'INSTRUMENT_MAN'}),200);
 await pg.query('UPDATE survey_reporting_links SET deactivated_at=NOW() WHERE tenant_id=$1 AND project_id=$2 AND party_chief_id=$3',[f.tenant,f.project,transferChief]);
 await checked(roleChange(roleInput,roleKey),403);await checked(teamsGet(req(f.superA,`/api/projects/${f.project}/survey/teams?teamId=${destination.teamId}`),ctx()),403);
 await pg.query('UPDATE survey_reporting_links SET deactivated_at=NULL WHERE tenant_id=$1 AND project_id=$2 AND party_chief_id=$3',[f.tenant,f.project,transferChief]);
 await pg.query('UPDATE aor_assignments SET deactivated_at=NOW() WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3 AND aor_node_id=$4',[f.tenant,f.project,f.superA,f.otherArea]);
 await checked(roleChange(roleInput,roleKey),403);
 await pg.query('UPDATE aor_assignments SET deactivated_at=NULL WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3 AND aor_node_id=$4',[f.tenant,f.project,f.superA,f.otherArea]);
 await checked(roleChange({...roleInput,userId:transferChief,expectedRole:'PARTY_CHIEF',role:'INSTRUMENT_MAN'}),403);
 await pg.query('UPDATE survey_team_members SET deactivated_at=NOW() WHERE tenant_id=$1 AND project_id=$2 AND team_id=$3 AND user_id=$4',[f.tenant,f.project,destination.teamId,transferChief]);
 await checked(roleChange(roleInput,roleKey),403);
 await pg.query('UPDATE survey_team_members SET deactivated_at=NULL WHERE tenant_id=$1 AND project_id=$2 AND team_id=$3 AND user_id=$4',[f.tenant,f.project,destination.teamId,transferChief]);
 const removal={...roleInput,action:'remove-role',expectedRoleVersion:3,role:undefined},removeKey=randomUUID(),teamBefore=await fingerprint('survey_teams');
 await pg.query("CREATE FUNCTION fail_supervised_role() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='survey.role_changed' THEN RAISE EXCEPTION 'owned supervised role rollback'; END IF; RETURN NEW; END $$");
 await pg.query('CREATE TRIGGER fail_supervised_role BEFORE INSERT ON survey_staffing_events FOR EACH ROW EXECUTE FUNCTION fail_supervised_role()');
 await checked(roleChange(removal,removeKey),500);
 await pg.query('DROP TRIGGER fail_supervised_role ON survey_staffing_events');await pg.query('DROP FUNCTION fail_supervised_role()');
 assert.equal(await fingerprint('survey_teams'),teamBefore);assert.equal((await pg.query('SELECT role FROM project_memberships WHERE project_id=$1 AND user_id=$2',[f.project,roleSubject])).rows[0].role,'INSTRUMENT_MAN');assert.equal((await pg.query('SELECT session_version FROM users WHERE tenant_id=$1 AND id=$2',[f.tenant,roleSubject])).rows[0].session_version,3);checks+=3;
 await checked(roleChange(removal,removeKey),200);await checked(roleChange(removal,removeKey),200);
 assert.equal((await pg.query('SELECT COUNT(*)::int n FROM survey_team_members WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3 AND deactivated_at IS NULL',[f.tenant,f.project,roleSubject])).rows[0].n,0);assert.equal((await pg.query('SELECT role FROM project_memberships WHERE project_id=$1 AND user_id=$2',[f.project,roleSubject])).rows[0].role,'REQUESTER');assert.equal(await fingerprint('survey_team_areas'),roleCoverageBefore);assert.equal(await fingerprint('tickets'),requestsBefore);checks+=4;
 // Synthetic cancellation witness stages only the new workforce gate; lifecycle
 // START/FINISH acceptance belongs to the separately verified D6 helper.
 await pg.query("UPDATE projects SET status='SETUP' WHERE tenant_id=$1 AND id=$2",[f.tenant,f.project]);
 await pg.query("INSERT INTO project_preparation_cancellations(id,tenant_id,project_id,started_by,reason,reviewed_evidence) VALUES($1,$2,$3,$4,'Owned workforce gate only','{}'::jsonb)",[randomUUID(),f.tenant,f.project,f.admin]);
 const cancelling=await checked(move(f.superA,base,key),409);assert.equal(cancelling.error.code,'PROJECT_PREPARATION_CANCELLING');checks++;
 const roleCancelling=await checked(roleChange(roleInput,roleKey),409);assert.equal(roleCancelling.error.code,'PROJECT_PREPARATION_CANCELLING');checks++;
 console.log(JSON.stringify({result:'passed',checks,fixture:f}));
 }finally{await pg.end();await getPool().end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
