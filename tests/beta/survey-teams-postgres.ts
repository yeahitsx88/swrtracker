import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { getProjectRole } from '../../src/lib/get-project-role';
import { signToken, requireActiveAuth, sessionTokenHash } from '../../src/lib/auth';
import { executeIdempotentHttpMutation } from '../../src/lib/idempotency';
import { SurveyTeamsPgRepository } from '../../src/modules/tenancy/infrastructure/survey-teams.repository';
import { handleDeleteSurveyTeam, handleGetSurveyTeams, handlePostSurveyTeam, handlePatchSurveyRole, type TeamDeps } from '../../src/app/api/projects/[projectId]/survey/teams/handler';
import { saveSurveyTeam, type TeamActor } from '../../src/modules/tenancy/application/survey-teams';
import { changeSurveyRole } from '../../src/modules/tenancy/application/change-survey-role';
import type { DbClient, UUID } from '../../src/shared/types';

// Deliberately separate from Sabine: use a fresh disposable database, migrate
// first, and opt in. Never seed a database that already has tenant data.
const id=(n:number)=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}` as UUID;
const tenant=id(1), project=id(2), manager=id(3), company=id(4), area=id(5), level=id(6);
const chief=id(7),im=id(8),superintendent=id(9),otherProject=id(10),otherTenant=id(11),otherCompany=id(12),outsider=id(13),otherArea=id(14),otherLevel=id(15),otherChief=id(16),sameTenantProject=id(17);
const candidate=id(20),admin=id(21),inactive=id(22),outsideProject=id(23),crossManager=id(24);

async function main() {
  const url=new URL(process.env.DATABASE_URL ?? '');
  if(process.env.SWR_TEAM_POSTGRES!=='1'||url.hostname!=='127.0.0.1'||url.port!=='15489'||url.pathname!=='/swr_team_isolated') {
    throw new Error('Only SWR_TEAM_POSTGRES=1 with the disposable loopback swr_team_isolated database on port 15489 is permitted');
  }
  const pool=new Pool({connectionString:url.href,max:4});
  let scenarios=0;
  const transaction=async<T>(fn:(db:DbClient)=>Promise<T>):Promise<T>=>{
    const client=await pool.connect();
    try{await client.query('BEGIN');const result=await fn(client);await client.query('COMMIT');return result;}
    catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  };
  try {
    assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM tenants')).rows[0].count,0,'Fresh database required');
    await pool.query('INSERT INTO tenants (id,name) VALUES ($1,$2),($3,$4)',[tenant,'Team test',otherTenant,'Other tenant']);
    await pool.query(`INSERT INTO companies (id,tenant_id,name,type) VALUES ($1,$2,'GC','GC'),($3,$4,'Other GC','GC')`,[company,tenant,otherCompany,otherTenant]);
    await pool.query(`INSERT INTO projects (id,tenant_id,name,status,crew_build) VALUES ($1,$2,'Test project','ACTIVE','FULL'),($3,$4,'Other project','ACTIVE','FULL')`,[project,tenant,otherProject,otherTenant]);
    await pool.query(`INSERT INTO projects (id,tenant_id,name,status,crew_build) VALUES ($1,$2,'Same tenant other project','ACTIVE','FULL')`,[sameTenantProject,tenant]);
    for(const [user,userTenant,userCompany,name] of [
      [manager,tenant,company,'Manager'],[chief,tenant,company,'Chief'],[im,tenant,company,'Instrument Man'],
      [superintendent,tenant,company,'Superintendent'],[outsider,otherTenant,otherCompany,'Outsider'],[otherChief,tenant,company,'Other Chief'],
      [candidate,tenant,company,'Role candidate'],[admin,tenant,company,'Project admin'],[inactive,tenant,company,'Inactive'],
      [outsideProject,tenant,company,'Other project requester'],[crossManager,tenant,company,'Other project manager'],
    ]) await pool.query(`INSERT INTO users (id,tenant_id,company_id,email,name,password_hash) VALUES ($1,$2,$3,$4,$5,'not-a-login-hash')`,[user,userTenant,userCompany,`${user}@example.test`,name]);
    for(const [user,role,projectId] of [[manager,'SURVEY_MANAGER',project],[chief,'PARTY_CHIEF',project],[im,'INSTRUMENT_MAN',project],
      [superintendent,'SURVEY_SUPERINTENDENT',project],[otherChief,'PARTY_CHIEF',project],[outsider,'SURVEY_MANAGER',otherProject],
      [candidate,'REQUESTER',project],[admin,'PROJECT_ADMIN',project],[inactive,'REQUESTER',project],
      [outsideProject,'REQUESTER',sameTenantProject],[crossManager,'SURVEY_MANAGER',sameTenantProject],[crossManager,'REQUESTER',project],
      [manager,'REQUESTER',sameTenantProject]]) {
      await pool.query('INSERT INTO project_memberships (project_id,user_id,role) VALUES ($1,$2,$3)',[projectId,user,role]);
    }
    for(const [levelId,projectId,tenantId,areaId] of [[level,project,tenant,area],[otherLevel,otherProject,otherTenant,otherArea]]) {
      await pool.query(`INSERT INTO aor_levels (id,project_id,tenant_id,depth,label) VALUES ($1,$2,$3,0,'Area')`,[levelId,projectId,tenantId]);
      await pool.query(`INSERT INTO aor_nodes (id,project_id,tenant_id,level_id,name,code) VALUES ($1,$2,$3,$4,'Train 1','T1')`,[areaId,projectId,tenantId,levelId]);
    }
    const repo=new SurveyTeamsPgRepository();
    const authUser={userId:manager,tenantId:tenant,sessionVersion:1};
    const deps:TeamDeps={repo,getProjectRole,withTransaction:transaction,executeIdempotent:executeIdempotentHttpMutation,
      requireAuth:(req:NextRequest)=>requireActiveAuth(req,pool)};
    const ctx={params:Promise.resolve({projectId:project})};
    const token=signToken(manager,tenant);
    const request=(method:string,value?:unknown,query='',bearer=token,key=randomUUID())=>new NextRequest(`http://localhost/api/projects/${project}/survey/teams${query}`,{
      method,headers:{cookie:`swr_session=${bearer}`,'content-type':'application/json','idempotency-key':key},...(value===undefined?{}:{body:JSON.stringify(value)}),
    });
    const input={name:'Train 1 Team',areaId:area,leadUserId:chief,memberIds:[superintendent,chief,im]};
    const call=async(response:Promise<Response>,status:number)=>{
      const result=await response;const data=await result.json();assert.equal(result.status,status,JSON.stringify(data));scenarios++;return data;
    };
    const context=await call(handleGetSurveyTeams(request('GET',undefined,'?mode=context'),ctx,deps),200);
    assert.deepEqual(context.project,{status:'ACTIVE',crewBuild:'FULL'});
    const pickerAreas=await call(handleGetSurveyTeams(request('GET',undefined,'?mode=areas&limit=10&search=Train'),ctx,deps),200);
    assert.deepEqual(pickerAreas.data,[{id:area,name:'Train 1'}]);
    assert.equal((await repo.areas(pool,tenant,otherProject,{search:'',limit:10,offset:0})).total,0);scenarios++;
    assert.equal(await repo.projectContext(pool,tenant,otherProject),null);scenarios++;
    await pool.query('UPDATE aor_nodes SET retired_at=NOW() WHERE id=$1',[area]);
    assert.equal((await repo.areas(pool,tenant,project,{search:'',limit:10,offset:0})).total,0);scenarios++;
    await pool.query('UPDATE aor_nodes SET retired_at=NULL WHERE id=$1',[area]);
    await call(handleGetSurveyTeams(request('GET',undefined,'?mode=areas'),ctx,{...deps,requireAuth:()=>({...authUser,userId:chief})}),403);
    const createKey=randomUUID();
    const created=await call(handlePostSurveyTeam(request('POST',input,'',token,createKey),ctx,deps),201);
    const teamId=created.teamId as UUID;
    const replay=await call(handlePostSurveyTeam(request('POST',input,'',token,createKey),ctx,deps),201);
    assert.equal(replay.teamId,teamId);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM survey_staffing_events')).rows[0].count,1);
    await call(handlePostSurveyTeam(request('POST',{...input,name:'Mismatched replay'},'',token,createKey),ctx,deps),409);
    // Cached responses still require current Manager authority.
    await pool.query(`UPDATE project_memberships SET role='VIEWER' WHERE user_id=$1 AND project_id=$2`,[manager,project]);
    await call(handlePostSurveyTeam(request('POST',input,'',token,createKey),ctx,deps),403);
    await pool.query(`UPDATE project_memberships SET role='SURVEY_MANAGER' WHERE user_id=$1 AND project_id=$2`,[manager,project]);
    const state=()=>pool.query(`SELECT (SELECT COUNT(*)::int FROM aor_assignments) AS areas,
      (SELECT COUNT(*)::int FROM crew_rosters) AS rosters,(SELECT COUNT(*)::int FROM survey_reporting_links) AS links,
      (SELECT COUNT(*)::int FROM tenant_memberships) AS tenant_roles`);
    assert.deepEqual((await state()).rows[0],{areas:0,rosters:0,links:0,tenant_roles:0});scenarios++;
    const details=await call(handleGetSurveyTeams(request('GET',undefined,`?teamId=${teamId}`),ctx,deps),200);
    assert.equal(details.team.members.length,3);assert.equal(details.team.lead.role,'PARTY_CHIEF');
    const personnel=await call(handleGetSurveyTeams(request('GET',undefined,'?mode=personnel&limit=10&search=Chief'),ctx,deps),200);
    assert.equal(personnel.total,2);assert.equal(personnel.data.find((p:{userId:string})=>p.userId===chief).teamId,teamId);
    assert.equal(personnel.data.find((p:{userId:string})=>p.userId===otherChief).teamId,null);
    const chiefs=await call(handleGetSurveyTeams(request('GET',undefined,'?mode=personnel&limit=10&search=Party%20Chief'),ctx,deps),200);
    assert.equal(chiefs.total,2);assert.ok(chiefs.data.every((person:{role:string})=>person.role==='PARTY_CHIEF'));
    const page=await call(handleGetSurveyTeams(request('GET',undefined,'?limit=10&offset=10'),ctx,deps),200);
    assert.equal(page.total,1);assert.equal(page.data.length,0);
    await call(handlePostSurveyTeam(request('POST',{...input,name:'Other',leadUserId:im,memberIds:[im]}),ctx,deps),409);
    await call(handlePostSurveyTeam(request('POST',{...input,name:'train 1 team',memberIds:[otherChief],leadUserId:otherChief}),ctx,deps),409);
    await call(handlePostSurveyTeam(request('POST',{...input,teamId,expectedVersion:2}),ctx,deps),409);
    await call(handlePostSurveyTeam(request('POST',{...input,teamId,expectedVersion:1,memberIds:[im]}),ctx,deps),409);
    await call(handlePostSurveyTeam(request('POST',{...input,areaId:otherArea}),ctx,deps),404);
    await call(handlePostSurveyTeam(request('POST',{...input,memberIds:[outsider],leadUserId:outsider}),ctx,deps),409);
    await call(handleGetSurveyTeams(request('GET',undefined),{params:Promise.resolve({projectId:otherProject})},deps),403);
    await call(handleGetSurveyTeams(request('GET',undefined),{params:Promise.resolve({projectId:sameTenantProject})},deps),403);
    assert.equal(await repo.team(pool,otherTenant,otherProject,teamId),null);scenarios++;
    await call(handleGetSurveyTeams(request('GET',undefined),ctx,{...deps,requireAuth:()=>({userId:outsider,tenantId:otherTenant,sessionVersion:1})}),403);
    await call(handleGetSurveyTeams(request('GET',undefined),ctx,{...deps,requireAuth:()=>({...authUser,userId:chief})}),403);
    await call(handleGetSurveyTeams(request('GET',undefined),ctx,{...deps,requireAuth:()=>({...authUser,sessionVersion:99})}),401);
    await call(handlePostSurveyTeam(request('POST',{...input,teamId,expectedVersion:1,leadUserId:im,memberIds:[im,superintendent]}),ctx,deps),200);
    const removed=await pool.query('SELECT deactivated_at FROM survey_team_members WHERE user_id=$1',[chief]);
    assert.ok(removed.rows[0].deactivated_at);scenarios++;
    const actor:TeamActor={...authUser,actorId:manager,projectId:project,actorRole:'SURVEY_MANAGER'};
    // A failed project audit must roll back both metadata and membership writes.
    const broken=new SurveyTeamsPgRepository();broken.recordTeamEvent=async()=>{throw new Error('audit rejected');};
    await assert.rejects(transaction(db=>saveSurveyTeam(broken,db,actor,{teamId,expectedVersion:2,name:'Must roll back',areaId:area,leadUserId:im,memberIds:[im]})),/audit rejected/);
    assert.equal((await repo.team(pool,tenant,project,teamId))?.name,input.name);
    assert.equal((await repo.team(pool,tenant,project,teamId))?.members.length,2);scenarios++;
    // Simultaneous edits serialize on project lock; only one version can win.
    const race=await Promise.all([
      handlePostSurveyTeam(request('POST',{...input,teamId,expectedVersion:2,name:'Race A'}),ctx,deps),
      handlePostSurveyTeam(request('POST',{...input,teamId,expectedVersion:2,name:'Race B'}),ctx,deps),
    ]);
    assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);scenarios++;
    await pool.query(`UPDATE projects SET status='ARCHIVED' WHERE id=$1`,[project]);
    await call(handleDeleteSurveyTeam(request('DELETE',{teamId,expectedVersion:3,confirmDelete:true}),ctx,deps),409);
    await pool.query(`UPDATE projects SET status='ACTIVE' WHERE id=$1`,[project]);
    await call(handleDeleteSurveyTeam(request('DELETE',{teamId,expectedVersion:2,confirmDelete:true}),ctx,deps),409);
    await call(handleDeleteSurveyTeam(request('DELETE',{teamId,expectedVersion:3,confirmDelete:false}),ctx,deps),400);
    await call(handleDeleteSurveyTeam(request('DELETE',{teamId,expectedVersion:3,confirmDelete:true}),ctx,deps),200);
    await call(handleGetSurveyTeams(request('GET',undefined,`?teamId=${teamId}`),ctx,deps),404);
    assert.ok((await pool.query('SELECT deactivated_at FROM survey_teams WHERE id=$1',[teamId])).rows[0].deactivated_at);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM survey_team_members WHERE team_id=$1 AND deactivated_at IS NULL',[teamId])).rows[0].count,0);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM survey_team_members WHERE team_id=$1',[teamId])).rows[0].count,3);scenarios++;
    await call(handlePostSurveyTeam(request('POST',{...input,memberIds:[im],leadUserId:im}),ctx,deps),201);
    assert.deepEqual((await state()).rows[0],{areas:0,rosters:0,links:0,tenant_roles:0});scenarios++;
    assert.equal((await pool.query('SELECT session_version FROM users WHERE id=$1',[im])).rows[0].session_version,1);
    assert.equal((await pool.query('SELECT role FROM project_memberships WHERE user_id=$1',[im])).rows[0].role,'INSTRUMENT_MAN');
    const exclusiveRace=await Promise.all([
      handlePostSurveyTeam(request('POST',{...input,name:'Exclusive A',memberIds:[otherChief],leadUserId:otherChief}),ctx,deps),
      handlePostSurveyTeam(request('POST',{...input,name:'Exclusive B',memberIds:[otherChief],leadUserId:otherChief}),ctx,deps),
    ]);
    assert.deepEqual(exclusiveRace.map(r=>r.status).sort(),[201,409]);scenarios++;
    const roleBody={action:'set-role',userId:candidate,role:'INSTRUMENT_MAN',expectedRole:'REQUESTER',expectedRoleVersion:1,confirmRoleChanges:true};
    const roleKey=randomUUID();
    const changed=await call(handlePatchSurveyRole(request('PATCH',roleBody,'',token,roleKey),ctx,deps),200);
    assert.equal(changed.roleVersion,2);
    const replayRole=await call(handlePatchSurveyRole(request('PATCH',roleBody,'',token,roleKey),ctx,deps),200);
    assert.equal(replayRole.roleVersion,2);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM survey_staffing_events WHERE event_type=\'survey.role_changed\'')).rows[0].count,1);
    await call(handlePatchSurveyRole(request('PATCH',roleBody),ctx,deps),409);
    await call(handlePatchSurveyRole(request('PATCH',{...roleBody,expectedRole:'INSTRUMENT_MAN',expectedRoleVersion:2,role:'PARTY_CHIEF',confirmRoleChanges:false}),ctx,deps),400);
    const protectedRole=(userId:UUID)=>({...roleBody,userId});
    await call(handlePatchSurveyRole(request('PATCH',protectedRole(admin)),ctx,deps),409);
    await call(handlePatchSurveyRole(request('PATCH',protectedRole(manager)),ctx,deps),409);
    await call(handlePatchSurveyRole(request('PATCH',protectedRole(outsider)),ctx,deps),404);
    await call(handlePatchSurveyRole(request('PATCH',protectedRole(outsideProject)),ctx,deps),404);
    await pool.query('UPDATE users SET deactivated_at=NOW(),deactivated_by=id WHERE id=$1',[inactive]);
    await call(handlePatchSurveyRole(request('PATCH',protectedRole(inactive)),ctx,deps),404);
    await call(handlePatchSurveyRole(request('PATCH',{...roleBody,userId:im,expectedRole:'INSTRUMENT_MAN',role:'REQUESTER'}),ctx,deps),409);
    const brokenRole=new SurveyTeamsPgRepository();brokenRole.recordTeamEvent=async()=>{throw new Error('role audit rejected');};
    await assert.rejects(transaction(db=>changeSurveyRole(brokenRole,db,actor,{userId:candidate,role:'PARTY_CHIEF',expectedRole:'INSTRUMENT_MAN',expectedRoleVersion:2,confirmRoleChanges:true})),/role audit rejected/);
    assert.equal((await pool.query('SELECT session_version FROM users WHERE id=$1',[candidate])).rows[0].session_version,2);
    assert.equal((await pool.query('SELECT role FROM project_memberships WHERE user_id=$1',[candidate])).rows[0].role,'INSTRUMENT_MAN');scenarios++;
    await pool.query('INSERT INTO aor_assignments (tenant_id,project_id,user_id,aor_node_id) VALUES ($1,$2,$3,$4)',[tenant,project,candidate,area]);
    await call(handlePatchSurveyRole(request('PATCH',{...roleBody,expectedRole:'INSTRUMENT_MAN',expectedRoleVersion:2,role:'PARTY_CHIEF'}),ctx,deps),409);
    await pool.query('UPDATE aor_assignments SET deactivated_at=NOW() WHERE user_id=$1',[candidate]);
    await pool.query(`INSERT INTO project_responsibility_grants (tenant_id,project_id,aor_node_id,user_id,responsibility,granted_by)
      VALUES ($1,$2,$3,$4,'FIELD_COORDINATOR',$5)`,[tenant,project,area,candidate,manager]);
    await call(handlePatchSurveyRole(request('PATCH',{...roleBody,expectedRole:'INSTRUMENT_MAN',expectedRoleVersion:2,role:'PARTY_CHIEF'}),ctx,deps),409);
    await pool.query('UPDATE project_responsibility_grants SET revoked_at=NOW(),revoked_by=$2 WHERE user_id=$1',[candidate,manager]);
    await pool.query('INSERT INTO crew_rosters (tenant_id,project_id,party_chief_id,instrument_man_id) VALUES ($1,$2,$3,$4)',[tenant,project,chief,candidate]);
    await call(handlePatchSurveyRole(request('PATCH',{...roleBody,expectedRole:'INSTRUMENT_MAN',expectedRoleVersion:2,role:'PARTY_CHIEF'}),ctx,deps),409);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM crew_rosters WHERE instrument_man_id=$1 AND deactivated_at IS NULL',[candidate])).rows[0].count,1);
    await pool.query('UPDATE crew_rosters SET deactivated_at=NOW() WHERE instrument_man_id=$1',[candidate]);
    await pool.query(`INSERT INTO survey_reporting_links (tenant_id,project_id,superintendent_id,party_chief_id,aor_node_id,assigned_by)
      VALUES ($1,$2,$3,$4,$5,$6)`,[tenant,project,superintendent,chief,area,manager]);
    await call(handlePatchSurveyRole(request('PATCH',{...roleBody,userId:chief,expectedRole:'PARTY_CHIEF'}),ctx,deps),409);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM survey_reporting_links WHERE party_chief_id=$1 AND deactivated_at IS NULL',[chief])).rows[0].count,1);
    await pool.query('UPDATE survey_reporting_links SET deactivated_at=NOW() WHERE party_chief_id=$1',[chief]);
    await pool.query(`INSERT INTO acting_grants (tenant_id,project_id,user_id,role,trigger,granted_by,granted_reason)
      VALUES ($1,$2,$3,'PARTY_CHIEF','VACANCY',$4,'Isolated test grant')`,[tenant,project,candidate,manager]);
    await call(handlePatchSurveyRole(request('PATCH',{...roleBody,expectedRole:'INSTRUMENT_MAN',expectedRoleVersion:2,role:'PARTY_CHIEF'}),ctx,deps),409);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM acting_grants WHERE user_id=$1 AND revoked_at IS NULL',[candidate])).rows[0].count,1);
    await pool.query('UPDATE acting_grants SET revoked_at=NOW(),revoked_by=$2 WHERE user_id=$1',[candidate,manager]);
    const roleRace=await Promise.all([
      handlePatchSurveyRole(request('PATCH',{...roleBody,expectedRole:'INSTRUMENT_MAN',expectedRoleVersion:2,role:'PARTY_CHIEF'}),ctx,deps),
      handlePatchSurveyRole(request('PATCH',{...roleBody,expectedRole:'INSTRUMENT_MAN',expectedRoleVersion:2,role:'SURVEY_SUPERINTENDENT'}),ctx,deps),
    ]);
    assert.deepEqual(roleRace.map(r=>r.status).sort(),[200,409]);scenarios++;
    const currentRole=(await pool.query('SELECT role FROM project_memberships WHERE user_id=$1',[candidate])).rows[0].role;
    await call(handlePatchSurveyRole(request('PATCH',{...roleBody,expectedRole:currentRole,expectedRoleVersion:3,role:'REQUESTER'}),ctx,deps),200);
    assert.equal((await pool.query('SELECT role FROM project_memberships WHERE user_id=$1',[candidate])).rows[0].role,'REQUESTER');
    assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM users WHERE id=$1',[candidate])).rows[0].count,1);
    await assert.rejects(getProjectRole(pool,tenant,project,candidate,1),{name:'UnauthorizedError'});scenarios++;
    assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM tenant_memberships')).rows[0].count,0);scenarios++;
    // Two Managers are valid Requesters in each other's project. Synchronize
    // their subject lookup to expose actor-user/subject-user lock inversion.
    const crossRepo=new SurveyTeamsPgRepository();const actualMembers=crossRepo.members.bind(crossRepo);
    // The tenant EXCLUSIVE barrier serializes these commands before subject lookup.
    crossRepo.members=actualMembers;
    const crossDeps={...deps,repo:crossRepo};
    const crossToken=signToken(crossManager,tenant);
    const crossResults=await Promise.all([
      handlePatchSurveyRole(request('PATCH',{...roleBody,userId:crossManager}),ctx,crossDeps),
      handlePatchSurveyRole(request('PATCH',{...roleBody,userId:manager},'',crossToken),{params:Promise.resolve({projectId:sameTenantProject})},crossDeps),
    ]);
    assert.deepEqual(crossResults.map(r=>r.status).sort(),[200,401],'The second actor renews its session after the winning role change');scenarios++;
    // Either cross-project actor can win. Normalize only this synthetic fixture's
    // session version for downstream staffing scripts and a distinct renewed JWT.
    const crossVersion=(await pool.query('SELECT session_version FROM users WHERE id=$1',[manager])).rows[0].session_version;
    assert.ok([1,2].includes(crossVersion));
    await pool.query('UPDATE users SET session_version=2 WHERE id=$1',[manager]);
    const latestManagerToken=signToken(manager,tenant,(await pool.query('SELECT session_version FROM users WHERE id=$1',[manager])).rows[0].session_version);
    await pool.query('INSERT INTO revoked_auth_sessions (token_hash,tenant_id,user_id,expires_at) VALUES ($1,$2,$3,NOW()+interval \'8 hours\')',[sessionTokenHash(token),tenant,manager]);
    await call(handleGetSurveyTeams(request('GET',undefined),ctx,deps),401);
    await call(handleGetSurveyTeams(request('GET',undefined,'',latestManagerToken),ctx,deps),200);
    console.log(`Survey team PostgreSQL/route scenarios passed: ${scenarios}`);
  } finally {await pool.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
