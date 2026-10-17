import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { signToken, requireActiveAuth } from '../../src/lib/auth';
import { getProjectRole } from '../../src/lib/get-project-role';
import { executeIdempotentHttpMutation } from '../../src/lib/idempotency';
import { SurveyStaffingPgRepository } from '../../src/modules/tenancy/infrastructure/survey-staffing.repository';
import { SurveyTeamsPgRepository } from '../../src/modules/tenancy/infrastructure/survey-teams.repository';
import { changeSurveyRole } from '../../src/modules/tenancy/application/change-survey-role';
import { handlePatchSurveyStaffing } from '../../src/app/api/projects/[projectId]/survey/staffing/handler';
import type { DbClient, UUID } from '../../src/shared/types';

const id=(n:number)=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}` as UUID;
const tenant=id(1),company=id(4),project=id(800),chief=id(801),im=id(802),superintendent=id(803),manager=id(804),area=id(805),level=id(806);
async function main(){
  const url=new URL(process.env.DATABASE_URL??'');
  if(process.env.SWR_TEAM_POSTGRES!=='1'||url.hostname!=='127.0.0.1'||url.port!=='15489'||url.pathname!=='/swr_team_isolated')throw Error('Disposable unlink fixture only');
  const pool=new Pool({connectionString:url.href,max:8});let checks=0;
  const transaction=async<T>(fn:(db:DbClient)=>Promise<T>)=>{const db=await pool.connect();try{await db.query('BEGIN');const value=await fn(db);await db.query('COMMIT');return value;}catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}};
  try{
    assert.equal((await pool.query('SELECT name FROM tenants WHERE id=$1',[tenant])).rows[0]?.name,'Team test');
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM projects WHERE id=$1',[project])).rows[0].n,0,'Fresh unlink fixture required');
    await pool.query(`INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,'Staffing unlink fixture','ACTIVE','FULL')`,[project,tenant]);
    for(const [user,role,name] of [[chief,'PARTY_CHIEF','Unlink QA Chief'],[im,'INSTRUMENT_MAN','Unlink QA Instrument Man'],[superintendent,'SURVEY_SUPERINTENDENT','Unlink QA Superintendent'],[manager,'SURVEY_MANAGER','Unlink QA Manager']]){
      await pool.query(`INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,$5,'not-a-login-hash')`,[user,tenant,company,`${user}@example.test`,name]);
      await pool.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)',[project,user,role]);
    }
    await pool.query(`INSERT INTO aor_levels(id,tenant_id,project_id,depth,label) VALUES($1,$2,$3,0,'Area')`,[level,tenant,project]);
    await pool.query(`INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,name,code) VALUES($1,$2,$3,$4,'Unlink QA Area','UQA')`,[area,tenant,project,level]);
    for(const user of [chief,superintendent])await pool.query('INSERT INTO aor_assignments(tenant_id,project_id,user_id,aor_node_id) VALUES($1,$2,$3,$4)',[tenant,project,user,area]);
    await pool.query('INSERT INTO crew_rosters(tenant_id,project_id,party_chief_id,instrument_man_id) VALUES($1,$2,$3,$4)',[tenant,project,chief,im]);
    await pool.query('INSERT INTO survey_reporting_links(tenant_id,project_id,party_chief_id,superintendent_id,aor_node_id,assigned_by) VALUES($1,$2,$3,$4,$5,$6)',[tenant,project,chief,superintendent,area,manager]);
    // Actual assigned ticket: unlink never rewrites current or historical responsibility.
    const ticketId=randomUUID();
    await pool.query(`INSERT INTO tickets(id,tenant_id,project_id,company_id,aor_node_id,requester_id,survey_lead_id,assigned_party_chief_id,assigned_instrument_man_id,ticket_number,craft,ticket_type,workflow_variant,status,description,requested_date)
      VALUES($1,$2,$3,$4,$5,$6,$6,$7,$8,'FSS-UQA-00001','Civil','LAYOUT','DIRECT_ASSIGNMENT','ASSIGNED','Synthetic unlink history fixture',NOW())`,[ticketId,tenant,project,company,area,manager,chief,im]);
    const history=async()=> (await pool.query('SELECT * FROM tickets WHERE id=$1',[ticketId])).rows;
    const beforeHistory=await history();
    const repo=new SurveyStaffingPgRepository(),roles=new SurveyTeamsPgRepository();
    const deps={repo,executeIdempotent:executeIdempotentHttpMutation,getProjectRole,withTransaction:transaction,requireAuth:(req:NextRequest)=>requireActiveAuth(req,pool)};
    const ctx={params:Promise.resolve({projectId:project})},bearer=signToken(manager,tenant);
    const request=(value:unknown,key=randomUUID(),token=bearer)=>new NextRequest(`http://localhost/api/projects/${project}/survey/staffing`,{
      method:'PATCH',headers:{cookie:`swr_session=${token}`,'content-type':'application/json','Idempotency-Key':key},body:JSON.stringify(value)});
    const checked=async(response:Promise<Response>,status:number)=>{const res=await response;const body=await res.json();assert.equal(res.status,status,JSON.stringify(body));checks++;return body;};
    const snapshot=()=>repo.snapshot(pool,tenant,project);
    const read=()=>repo.readStaffing(pool,tenant,project,chief,{search:'',limit:10,offset:0});
    const make=async(kind:'roster'|'reporting'|'area',linkId:UUID)=>({action:'unlink',kind,linkId,partyChiefId:chief,expectedSnapshot:await snapshot(),confirmUnlink:true});
    const state=async()=>({roster:(await pool.query('SELECT * FROM crew_rosters WHERE tenant_id=$1 AND project_id=$2 ORDER BY id',[tenant,project])).rows,
      areas:(await pool.query('SELECT * FROM aor_assignments WHERE tenant_id=$1 AND project_id=$2 ORDER BY id',[tenant,project])).rows,
      reporting:(await pool.query('SELECT * FROM survey_reporting_links WHERE tenant_id=$1 AND project_id=$2 ORDER BY id',[tenant,project])).rows,
      events:(await pool.query('SELECT * FROM survey_staffing_events WHERE tenant_id=$1 AND project_id=$2 ORDER BY id',[tenant,project])).rows});
    const detail=(await read())!,rosterId=detail.instrumentMen.data[0]!.rosterLinkId!,areaId=detail.areas.data[0]!.individualAssignmentId!,reportId=detail.reporting!.id;
    assert.ok(rosterId&&areaId&&reportId);checks++;
    const departmentId=randomUUID();
    await pool.query(`INSERT INTO departments(id,tenant_id,project_id,name,manager_title,created_by) VALUES($1,$2,$3,'Unlink QA department','QA manager',$4)`,[departmentId,tenant,project,manager]);
    const departmentGrant=(await pool.query('INSERT INTO aor_assignments(tenant_id,project_id,aor_node_id,department_id) VALUES($1,$2,$3,$4) RETURNING id',[tenant,project,area,departmentId])).rows[0].id;
    assert.equal((await read())!.areas.data[0]!.individualAssignmentId,areaId);checks++;
    await checked(handlePatchSurveyStaffing(request(await make('area',departmentGrant)),ctx,deps),404);
    assert.equal((await pool.query('SELECT deactivated_at FROM aor_assignments WHERE id=$1',[departmentGrant])).rows[0].deactivated_at,null);checks++;
    const duplicate=(await pool.query('INSERT INTO aor_assignments(tenant_id,project_id,user_id,aor_node_id) VALUES($1,$2,$3,$4) RETURNING id',[tenant,project,chief,area])).rows[0].id;
    assert.equal((await read())!.areas.data[0]!.individualAssignmentId,null,'Ambiguous individual rows must not be guessed');checks++;
    await pool.query('UPDATE aor_assignments SET deactivated_at=NOW() WHERE id=$1',[duplicate]);
    const areaCommand=await make('area',areaId),beforeDependent=await state();
    assert.equal((await checked(handlePatchSurveyStaffing(request(areaCommand),ctx,deps),409)).error.code,'DEPENDENT_REPORTING');assert.deepEqual(await state(),beforeDependent);checks++;
    // Targets never escape selected Chief, project or tenant; denied actors cannot replay.
    for(const patch of [{partyChiefId:id(701)},{linkId:id(999)},{linkId:(await pool.query('SELECT id FROM aor_assignments WHERE project_id=$1 AND user_id=$2',[project,superintendent])).rows[0].id}]){
      await checked(handlePatchSurveyStaffing(request({...areaCommand,...patch}),ctx,deps),'partyChiefId' in patch?400:404);
    }
    await checked(handlePatchSurveyStaffing(request(areaCommand,randomUUID(),signToken(superintendent,tenant)),ctx,deps),403);
    await checked(handlePatchSurveyStaffing(request(areaCommand,randomUUID(),signToken(id(13),id(11))),ctx,deps),403);
    await checked(handlePatchSurveyStaffing(request(areaCommand),{params:Promise.resolve({projectId:id(10)})},deps),403);
    // Atomic audit failure also rolls back link and ledger.
    const command=await make('roster',rosterId),key=randomUUID(),beforeFailure=await state();
    const failing=new SurveyStaffingPgRepository();failing.record=async()=>{throw Error('Injected unlink audit failure');};
    await checked(handlePatchSurveyStaffing(request(command,key),ctx,{...deps,repo:failing}),500);
    assert.deepEqual(await state(),beforeFailure);assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM api_idempotency WHERE idempotency_key=$1',[key])).rows[0].n,0);checks++;
    // Same-key concurrency commits one deactivation/event, replay does not remove a later relink.
    const same=await Promise.all([handlePatchSurveyStaffing(request(command,key),ctx,deps),handlePatchSurveyStaffing(request(command,key),ctx,deps)]);
    for(const result of same)await checked(Promise.resolve(result),200);
    assert.equal((await state()).events.length,1);assert.ok((await state()).roster[0].deactivated_at);checks++;
    await pool.query('UPDATE crew_rosters SET deactivated_at=NULL WHERE id=$1',[rosterId]);
    await checked(handlePatchSurveyStaffing(request(command,key),ctx,deps),200);assert.equal((await state()).roster[0].deactivated_at,null);checks++;
    await checked(handlePatchSurveyStaffing(request({...command,linkId:reportId},key),ctx,deps),409);
    assert.equal((await checked(handlePatchSurveyStaffing(request(command),ctx,deps),409)).error.code,'STALE_STAFFING');
    // Role/session and archived guards run before replay.
    await pool.query(`UPDATE project_memberships SET role='VIEWER' WHERE project_id=$1 AND user_id=$2`,[project,manager]);await checked(handlePatchSurveyStaffing(request(command,key),ctx,deps),403);
    await pool.query(`UPDATE project_memberships SET role='SURVEY_MANAGER' WHERE project_id=$1 AND user_id=$2`,[project,manager]);
    await pool.query('UPDATE users SET session_version=session_version+1 WHERE id=$1',[manager]);await checked(handlePatchSurveyStaffing(request(command,key),ctx,deps),401);
    await pool.query('UPDATE users SET session_version=1 WHERE id=$1',[manager]);
    await pool.query(`UPDATE projects SET status='ARCHIVED' WHERE id=$1`,[project]);await checked(handlePatchSurveyStaffing(request(command,key),ctx,deps),409);
    await pool.query(`UPDATE projects SET status='ACTIVE',crew_build='SLIM' WHERE id=$1`,[project]);await checked(handlePatchSurveyStaffing(request(command,key),ctx,deps),409);
    await pool.query(`UPDATE projects SET crew_build='FULL' WHERE id=$1`,[project]);
    // Distinct-key operations based on one displayed state cannot both win.
    const raceSnapshot=await snapshot();const race=await Promise.all([handlePatchSurveyStaffing(request({...await make('roster',rosterId),expectedSnapshot:raceSnapshot}),ctx,deps),handlePatchSurveyStaffing(request({...await make('reporting',reportId),expectedSnapshot:raceSnapshot}),ctx,deps)]);
    assert.deepEqual(race.map(res=>res.status).sort(),[200,409]);checks++;
    for(const [kind,link] of [['roster',rosterId],['reporting',reportId]] as const){
      const current=await repo.lockLink(pool,tenant,project,chief,kind,link);
      if(current)await checked(handlePatchSurveyStaffing(request(await make(kind,link)),ctx,deps),200);
    }
    // Retired individual Areas remain removable; no substitute reporting is created.
    await pool.query('UPDATE aor_nodes SET retired_at=NOW() WHERE id=$1',[area]);
    await checked(handlePatchSurveyStaffing(request(await make('area',areaId)),ctx,deps),200);
    assert.equal((await read())!.areas.total,0);assert.equal((await read())!.reporting,null);assert.equal((await read())!.instrumentManTotal,0);
    assert.equal((await pool.query('SELECT deactivated_at FROM aor_assignments WHERE id=$1',[departmentGrant])).rows[0].deactivated_at,null,'Department scope must remain');checks++;
    // Responsibility/acting grants remain intact and independently block role removal.
    const actor={tenantId:tenant,projectId:project,actorId:manager,actorRole:'SURVEY_MANAGER' as const,sessionVersion:1};
    const demote=(user:UUID,expectedRole:'PARTY_CHIEF'|'INSTRUMENT_MAN')=>transaction(db=>changeSurveyRole(roles,db,actor,{userId:user,expectedRole,expectedRoleVersion:1,role:expectedRole==='PARTY_CHIEF'?'INSTRUMENT_MAN':'PARTY_CHIEF',confirmRoleChanges:true}));
    await pool.query(`INSERT INTO project_responsibility_grants(tenant_id,project_id,user_id,responsibility,granted_by) VALUES($1,$2,$3,'FIELD_COORDINATOR',$4)`,[tenant,project,chief,manager]);
    await assert.rejects(demote(chief,'PARTY_CHIEF'),/responsibility and acting/);checks++;
    await pool.query('UPDATE project_responsibility_grants SET revoked_at=NOW(),revoked_by=$3 WHERE tenant_id=$1 AND project_id=$2',[tenant,project,manager]);
    await pool.query(`INSERT INTO acting_grants(tenant_id,project_id,user_id,role,trigger,granted_by,granted_reason) VALUES($1,$2,$3,'PARTY_CHIEF','VACANCY',$4,'Synthetic protected grant')`,[tenant,project,chief,manager]);
    await assert.rejects(demote(chief,'PARTY_CHIEF'),/responsibility and acting/);checks++;
    await pool.query('UPDATE acting_grants SET revoked_at=NOW(),revoked_by=$3 WHERE tenant_id=$1 AND project_id=$2',[tenant,project,manager]);
    await demote(chief,'PARTY_CHIEF');await demote(im,'INSTRUMENT_MAN');
    assert.deepEqual((await pool.query('SELECT role FROM project_memberships WHERE project_id=$1 AND user_id=ANY($2::uuid[])',[project,[chief,im]])).rows.map(row=>row.role),['REQUESTER','REQUESTER']);
    assert.deepEqual(await history(),beforeHistory);checks+=2;
    const audits=(await state()).events.filter(row=>row.payload.action==='unlink');assert.ok(audits.length>=4);assert.ok(audits.every(row=>row.payload.previousLink.id===row.payload.linkId&&row.event_type==='survey.staffing_saved'));checks++;
    // Independent synthetic browser fixtures; accounts are not source-PDF identities.
    for(const n of [860,870,880]){
      const p=id(n),c=id(n+1),member=id(n+2),a=id(n+3),l=id(n+4);
      await pool.query(`INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,'Unlink browser fixture','ACTIVE','FULL')`,[p,tenant]);
      for(const [user,role,name] of [[c,'PARTY_CHIEF','Unlink browser Chief'],[member,'INSTRUMENT_MAN','Unlink browser IM']]){
        await pool.query(`INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,$5,'not-a-login-hash')`,[user,tenant,company,`${user}@example.test`,name]);
        await pool.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)',[p,user,role]);
      }
      for(const [user,role] of [[manager,'SURVEY_MANAGER'],[superintendent,'SURVEY_SUPERINTENDENT']])await pool.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)',[p,user,role]);
      await pool.query(`INSERT INTO aor_levels(id,tenant_id,project_id,depth,label) VALUES($1,$2,$3,0,'Area')`,[l,tenant,p]);
      await pool.query(`INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,name,code) VALUES($1,$2,$3,$4,'Browser Area','BQA')`,[a,tenant,p,l]);
      for(const user of [c,superintendent])await pool.query('INSERT INTO aor_assignments(tenant_id,project_id,user_id,aor_node_id) VALUES($1,$2,$3,$4)',[tenant,p,user,a]);
      await pool.query('INSERT INTO crew_rosters(tenant_id,project_id,party_chief_id,instrument_man_id) VALUES($1,$2,$3,$4)',[tenant,p,c,member]);
      await pool.query('INSERT INTO survey_reporting_links(tenant_id,project_id,party_chief_id,superintendent_id,aor_node_id,assigned_by) VALUES($1,$2,$3,$4,$5,$6)',[tenant,p,c,superintendent,a,manager]);
    }
    console.log(`Staffing unlink PostgreSQL/handler checks passed: ${checks}`);
  }finally{await pool.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
