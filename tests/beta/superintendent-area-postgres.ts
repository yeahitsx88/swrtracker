import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {TicketRepository} from '../../src/modules/ticket/infrastructure/ticket.repository';
import {resolveVisibility} from '../../src/lib/resolve-visibility';
import {randomUUID} from 'node:crypto';
import {NextRequest} from 'next/server';
import {requireActiveAuth,signToken} from '../../src/lib/auth';
import {executeIdempotentHttpMutation} from '../../src/lib/idempotency';
import * as areaHandler from '../../src/app/api/projects/[projectId]/survey/staffing/superintendent-area-handler';
import {SuperintendentAreasPgRepository} from '../../src/modules/tenancy/infrastructure/superintendent-areas.repository';
import type {UUID} from '../../src/shared/types';
import {ForbiddenError,NotFoundError,UnauthorizedError} from '../../src/shared/errors';
const id=(n:number)=>`99010000-0000-4000-8000-${String(n).padStart(12,'0')}` as UUID;
async function main(){
 const url=new URL(process.env.DATABASE_URL??'');
 assert.equal(process.env.SWR_TEAM_POSTGRES,'1');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15489');assert.equal(url.pathname,'/swr_team_isolated');
 const pool=new Pool({connectionString:url.href,max:5});let checks=0;
 const equal=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++;};
 try{
  assert.equal((await pool.query('SELECT name FROM tenants WHERE id=$1',['20000000-0000-4000-8000-000000000001'])).rows[0]?.name,'Team test');
  const existing=(await pool.query('SELECT name FROM tenants WHERE id=$1',[id(1)])).rows[0];
  if(existing)assert.equal(existing.name,'Superintendent Area unlink disposable');
  else{
   assert.equal((await pool.query("SELECT count(*)::int AS n FROM users WHERE id::text LIKE '99010000-%'")).rows[0].n,0,'Conflicting owned fixture namespace');
   const db=await pool.connect();
   try{
    await db.query('BEGIN');
    await db.query("INSERT INTO tenants(id,name) VALUES($1,'Superintendent Area unlink disposable'),($2,'Area unlink foreign disposable')",[id(1),id(90)]);
    await db.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'Area unlink GC','GC'),($3,$2,'Area unlink Sub','SUBCONTRACTOR'),($4,$5,'Foreign GC','GC')",[id(2),id(1),id(5),id(91),id(90)]);
    await db.query("INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,'Area unlink disposable','ACTIVE','FULL'),($3,$2,'Other owned project','ACTIVE','FULL'),($4,$5,'Foreign owned project','ACTIVE','FULL')",[id(3),id(1),id(4),id(93),id(90)]);
    for(const [n,name,role] of [[10,'Manager','SURVEY_MANAGER'],[11,'John','SURVEY_SUPERINTENDENT'],[12,'Jason','SURVEY_SUPERINTENDENT'],[13,'Former Chief','VIEWER'],[14,'Incomplete','SURVEY_SUPERINTENDENT'],[15,'Sub Superintendent','SURVEY_SUPERINTENDENT'],[16,'IT protected','PROJECT_ADMIN'],[17,'Central IT only','REQUESTER']] as const){
     await db.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash,deactivated_at) VALUES($1,$2,$3,$4,$5,'not-a-login-hash',$6)",[id(n),id(1),id(n===15?5:2),`area-unlink-${n}@example.test`,name,n===13?new Date():null]);
     await db.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)',[id(3),id(n),role]);
    }
    await db.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,'area-unlink-foreign@example.test','Foreign Manager','not-a-login-hash')",[id(92),id(90),id(91)]);
    await db.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'SURVEY_MANAGER')",[id(93),id(92)]);
    for(const n of [10,17])await db.query("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'TENANT_ADMIN')",[id(1),id(n)]);
    await db.query("INSERT INTO aor_levels(id,tenant_id,project_id,depth,label) VALUES($1,$2,$3,0,'Area'),($4,$2,$3,1,'Subarea')",[id(20),id(1),id(3),id(23)]);
    await db.query("INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,parent_id,name,code,retired_at) VALUES($1,$2,$3,$4,NULL,'Area1','A1',NULL),($5,$2,$3,$4,NULL,'Area2','A2',NULL),($6,$2,$3,$7,$1,'Retired descendant','D1',now())",[id(21),id(1),id(3),id(20),id(24),id(22),id(23)]);
    for(const [n,user,node] of [[40,11,21],[41,11,21],[42,11,24],[43,11,22],[51,12,21],[53,12,24],[62,15,21]] as const)await db.query('INSERT INTO aor_assignments(id,tenant_id,project_id,user_id,aor_node_id) VALUES($1,$2,$3,$4,$5)',[id(n),id(1),id(3),id(user),id(node)]);
    for(const [n,user,node] of [[50,12,21],[52,12,24],[55,14,21],[60,11,24],[61,15,21]] as const)await db.query("INSERT INTO project_responsibility_grants(id,tenant_id,project_id,user_id,aor_node_id,responsibility,granted_by) VALUES($1,$2,$3,$4,$5,'SURVEY_REVIEWER',$6)",[id(n),id(1),id(3),id(user),id(node),id(10)]);
    await db.query("INSERT INTO departments(id,tenant_id,project_id,name,manager_title,created_by) VALUES($1,$2,$3,'Diagnostic department','Manager',$4)",[id(70),id(1),id(3),id(10)]);
    await db.query('INSERT INTO department_memberships(id,tenant_id,project_id,user_id,department_id) VALUES($1,$2,$3,$4,$5)',[id(71),id(1),id(3),id(11),id(70)]);
    await db.query('INSERT INTO aor_assignments(id,tenant_id,project_id,department_id,aor_node_id) VALUES($1,$2,$3,$4,$5)',[id(72),id(1),id(3),id(70),id(21)]);
    await db.query('INSERT INTO survey_reporting_links(id,tenant_id,project_id,superintendent_id,party_chief_id,aor_node_id,assigned_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[id(80),id(1),id(3),id(11),id(13),id(22),id(10)]);
    await db.query('COMMIT');
   }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
  }
  const repo=new SuperintendentAreasPgRepository(),auth={tenantId:id(1),userId:id(10),sessionVersion:1};
  const read=(mode:'superintendent-areas'|'superintendent-area-replacements'|'superintendent-area-reporting',linkId=id(40),search='',limit:10|25|50|100=10,offset=0)=>repo.readPage(pool,auth,id(3),mode==='superintendent-areas'?{mode,superintendentId:id(11),query:{search,limit,offset}}:{mode,superintendentId:id(11),linkId,query:{search,limit,offset}});
  const areas=await read('superintendent-areas');assert.equal(areas.mode,'superintendent-areas');if(areas.mode!=='superintendent-areas')throw Error();
  equal(areas.assignments.data.map(a=>a.assignmentId),[id(40),id(41),id(42),id(43)]);equal(areas.assignments.total,4);equal(areas.departmentMembershipCount,1);equal(areas.sharedDepartmentAssignmentCount,1);
  equal(areas.assignments.data[0]!.duplicateIndividualCount,1);equal(areas.assignments.data[0]!.overlappingIndividualCount,1);equal(areas.assignments.data[0]!.reportingCount,1);equal(areas.assignments.data[0]!.canUnlink,false);
  const candidates=await read('superintendent-area-replacements');assert.equal(candidates.mode,'superintendent-area-replacements');if(candidates.mode!=='superintendent-area-replacements')throw Error();
  equal(candidates.replacements.data.map(c=>[c.userId,c.replacementGrantId,c.replacementAssignmentId]),[[id(12),id(50),id(51)]]);
  const reporting=await read('superintendent-area-reporting');assert.equal(reporting.mode,'superintendent-area-reporting');if(reporting.mode!=='superintendent-area-reporting')throw Error();
  equal(reporting.reporting.data[0]!.linkId,id(80));equal(reporting.reporting.data[0]!.active,false);equal(reporting.reporting.data[0]!.retired,true);equal(reporting.reporting.data[0]!.canUseStaffing,false);
  for(const result of [candidates,reporting,await read('superintendent-area-replacements',id(42)),await read('superintendent-areas',id(40),'Area2'),await read('superintendent-areas',id(40),'',10,10)])equal(result.snapshotToken,areas.snapshotToken);
  await assert.rejects(repo.readPage(pool,{...auth,userId:id(17)},id(3),{mode:'superintendent-areas',superintendentId:id(11),query:{search:'',limit:10,offset:0}}),ForbiddenError);checks++;
  await assert.rejects(repo.readPage(pool,{...auth,sessionVersion:9},id(3),{mode:'superintendent-areas',superintendentId:id(11),query:{search:'',limit:10,offset:0}}),UnauthorizedError);checks++;
  await assert.rejects(repo.readPage(pool,auth,id(4),{mode:'superintendent-areas',superintendentId:id(11),query:{search:'',limit:10,offset:0}}),ForbiddenError);checks++;
  await assert.rejects(repo.readPage(pool,auth,id(3),{mode:'superintendent-area-replacements',superintendentId:id(11),linkId:id(51),query:{search:'',limit:10,offset:0}}),NotFoundError);checks++;
  let statements=0;const db={query:async(sql:string,params?:unknown[])=>{statements++;return pool.query(sql,params);}};
  await repo.readPage(db,auth,id(3),{mode:'superintendent-areas',superintendentId:id(11),query:{search:'',limit:10,offset:999}});equal(statements,1);
  console.log(`PASS ${checks} scoped Superintendent Area SQL read checks`);
  if(!process.argv.includes('--read-only'))await commands(pool);
 }finally{await pool.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

async function commands(pool:Pool){
 const repo=new SuperintendentAreasPgRepository();
 assert.equal(typeof repo.lockUnlinkContext,'function','Held exact assignment/authority SQL command is not implemented');
 assert.equal(typeof areaHandler.handlePatchSuperintendentArea,'function','Area PATCH transaction handler is not implemented');
 const project=randomUUID() as UUID,area=randomUUID() as UUID,otherArea=randomUUID() as UUID,child=randomUUID() as UUID,level=randomUUID(),sublevel=randomUUID(),assignment=randomUUID() as UUID,duplicate=randomUUID() as UUID,witness=randomUUID() as UUID,review=randomUUID() as UUID,otherAssignment=randomUUID(),otherWitness=randomUUID(),otherReview=randomUUID(),department=randomUUID(),membership=randomUUID(),sharedAssignment=randomUUID(),ticket=randomUUID() as UUID;
 let checks=0;const equal=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++;};
 const tx=async<T>(fn:(db:import('../../src/shared/types').DbClient)=>Promise<T>):Promise<T>=>{const db=await pool.connect();try{await db.query('BEGIN');const result=await fn(db);await db.query('COMMIT');return result;}catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}};
 await tx(async db=>{
  await db.query("INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,'Area unlink command disposable','ACTIVE','FULL')",[project,id(1)]);
  for(const [n,role] of [[10,'SURVEY_MANAGER'],[11,'SURVEY_SUPERINTENDENT'],[12,'SURVEY_SUPERINTENDENT'],[13,'VIEWER'],[17,'REQUESTER']] as const)await db.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)',[project,id(n),role]);
  await db.query("INSERT INTO aor_levels(id,tenant_id,project_id,depth,label) VALUES($1,$2,$3,0,'Area'),($4,$2,$3,1,'Subarea')",[level,id(1),project,sublevel]);
  await db.query("INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,parent_id,name,code,retired_at) VALUES($1,$2,$3,$4,NULL,'Area1','A1',NULL),($5,$2,$3,$4,NULL,'Area2','A2',NULL),($6,$2,$3,$7,$1,'Retired descendant','D1',now())",[area,id(1),project,level,otherArea,child,sublevel]);
  for(const [row,user,node] of [[assignment,id(11),area],[duplicate,id(11),area],[otherAssignment,id(11),otherArea],[witness,id(12),area],[otherWitness,id(12),otherArea]])await db.query('INSERT INTO aor_assignments(id,tenant_id,project_id,user_id,aor_node_id) VALUES($1,$2,$3,$4,$5)',[row,id(1),project,user,node]);
  for(const [row,node] of [[review,area],[otherReview,otherArea]])await db.query("INSERT INTO project_responsibility_grants(id,tenant_id,project_id,user_id,aor_node_id,responsibility,granted_by) VALUES($1,$2,$3,$4,$5,'SURVEY_REVIEWER',$6)",[row,id(1),project,id(12),node,id(10)]);
  await db.query("INSERT INTO departments(id,tenant_id,project_id,name,manager_title,created_by) VALUES($1,$2,$3,'Preserved command department','Manager',$4)",[department,id(1),project,id(10)]);
  await db.query('INSERT INTO department_memberships(id,tenant_id,project_id,user_id,department_id) VALUES($1,$2,$3,$4,$5)',[membership,id(1),project,id(11),department]);
  await db.query('INSERT INTO aor_assignments(id,tenant_id,project_id,department_id,aor_node_id) VALUES($1,$2,$3,$4,$5)',[sharedAssignment,id(1),project,department,area]);
  await db.query("INSERT INTO tickets(id,tenant_id,project_id,aor_node_id,company_id,ticket_number,requester_id,workflow_variant,status,craft,description,requested_date,ticket_type,submitted_at) VALUES($1,$2,$3,$4,$5,$6,$7,'STANDARD_APPROVAL','SUBMITTED','Survey','Disposable Area preservation','2026-10-10','LAYOUT',now())",[ticket,id(1),project,area,id(2),'AREA-'+ticket,id(10)]);
 });
 const auth={tenantId:id(1),userId:id(10),sessionVersion:1},scope={tenantId:id(1),projectId:project};
 const ctx={params:Promise.resolve({projectId:project})},bearer=signToken(id(10),id(1));
 const deps={repo,withTransaction:tx,executeIdempotent:executeIdempotentHttpMutation,requireAuth:(req:NextRequest,db:import('../../src/shared/types').DbClient=pool)=>requireActiveAuth(req,db)};
 const input=async()=>({action:'unlink-superintendent-area' as const,superintendentId:id(11),linkId:assignment,replacementUserId:id(12),replacementGrantId:review,replacementAssignmentId:witness,expectedSnapshot:await repo.snapshot(pool,scope,id(11)),confirmUnlink:true as const});
 const call=async(value:unknown,status:number,key=randomUUID(),override={},token=bearer)=>{const req=new NextRequest(`http://localhost/api/projects/${project}/survey/staffing`,{method:'PATCH',headers:{cookie:`swr_session=${token}`,'content-type':'application/json','idempotency-key':key},body:JSON.stringify(value)});const response=await areaHandler.handlePatchSuperintendentArea(req,ctx,{...deps,...override});const body=await response.json();equal(response.status,status);equal(response.headers.get('cache-control'),'private, no-store');return body;};
 const persisted=async()=>(await pool.query(`SELECT jsonb_build_object(
 'assignments',(SELECT jsonb_agg(a ORDER BY id) FROM aor_assignments a WHERE tenant_id=$1 AND project_id=$2),
 'grants',(SELECT jsonb_agg(g ORDER BY id) FROM project_responsibility_grants g WHERE tenant_id=$1 AND project_id=$2),
 'reporting',(SELECT jsonb_agg(r ORDER BY id) FROM survey_reporting_links r WHERE tenant_id=$1 AND project_id=$2),
 'events',(SELECT jsonb_agg(e ORDER BY id) FROM survey_staffing_events e WHERE tenant_id=$1 AND project_id=$2),
 'memberships',(SELECT jsonb_agg(m ORDER BY id) FROM project_memberships m WHERE project_id=$2),
 'accounts',(SELECT jsonb_agg(jsonb_build_array(u.id,u.company_id,u.session_version,u.deactivated_at) ORDER BY u.id) FROM users u WHERE u.tenant_id=$1 AND u.id IN(SELECT user_id FROM project_memberships WHERE project_id=$2)),
 'departments',(SELECT jsonb_agg(d ORDER BY id) FROM department_memberships d WHERE tenant_id=$1 AND project_id=$2),
 'ledger',(SELECT jsonb_agg(l ORDER BY actor_id,endpoint,idempotency_key) FROM api_idempotency l WHERE tenant_id=$1::text AND endpoint=$3),
 'tickets',(SELECT jsonb_agg(t ORDER BY id) FROM tickets t WHERE tenant_id=$1 AND project_id=$2)) AS state`,[id(1),project,`PATCH:/api/projects/${project}/survey/staffing:unlink-superintendent-area`])).rows[0].state;
 for(const failure of ['conditional','update','audit','ledger'] as const){
  const before=await persisted(),failing=new SuperintendentAreasPgRepository();
  if(failure==='conditional')failing.deactivateAssignment=async()=>false;
  else if(failure==='update')failing.deactivateAssignment=async(...args)=>{await repo.deactivateAssignment(...args);throw Error('Synthetic after conditional update');};
  else if(failure==='audit')failing.recordUnlink=async(...args)=>{await repo.recordUnlink(...args);throw Error('Synthetic after audit insert');};
  await call(await input(),failure==='conditional'?409:500,randomUUID(),{repo:failing,...(failure==='ledger'?{executeIdempotent:async(...args:Parameters<typeof executeIdempotentHttpMutation>)=>{await executeIdempotentHttpMutation(...args);throw Error('Synthetic after ledger completion');}}:{})});
  equal(await persisted(),before);
 }

 for(const change of [{replacementAssignmentId:id(51)},{replacementGrantId:id(50)},{expectedSnapshot:'f'.repeat(32)}]){const before=await persisted();await call({...await input(),...change},409);equal(await persisted(),before);}
 for(const change of [{linkId:witness},{superintendentId:id(14)},{linkId:id(72)}]){const before=await persisted();await call({...await input(),...change},404);equal(await persisted(),before);}
 const report=randomUUID();
 await pool.query('INSERT INTO survey_reporting_links(id,tenant_id,project_id,superintendent_id,party_chief_id,aor_node_id,assigned_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[report,id(1),project,id(11),id(13),child,id(10)]);
 let before=await persisted();const blockedReport=await call(await input(),409);equal(blockedReport.error.code,'DEPENDENT_REPORTING');equal(await persisted(),before);
 await pool.query('UPDATE survey_reporting_links SET deactivated_at=now() WHERE id=$1',[report]);
 for(const node of [child,null]){const grant=randomUUID();await pool.query("INSERT INTO project_responsibility_grants(id,tenant_id,project_id,user_id,aor_node_id,responsibility,granted_by) VALUES($1,$2,$3,$4,$5,'FIELD_COORDINATOR',$6)",[grant,id(1),project,id(11),node,id(10)]);before=await persisted();const blocked=await call(await input(),409);equal(blocked.error.code,'PROTECTED_AREA_OBLIGATIONS');equal(await persisted(),before);await pool.query('UPDATE project_responsibility_grants SET revoked_at=now(),revoked_by=$2 WHERE id=$1',[grant,id(10)]);}
 const acting=randomUUID();await pool.query("INSERT INTO acting_grants(id,tenant_id,project_id,user_id,role,scope,trigger,granted_by,granted_reason) VALUES($1,$2,$3,$4,'SURVEY_SUPERINTENDENT',$5,'VACANCY','synthetic','synthetic obligation')",[acting,id(1),project,id(11),{notInterpreted:true}]);
 before=await persisted();equal((await call(await input(),409)).error.code,'PROTECTED_AREA_OBLIGATIONS');equal(await persisted(),before);await pool.query('UPDATE acting_grants SET revoked_at=now() WHERE id=$1',[acting]);
 const originalGrant=(await pool.query('SELECT to_jsonb(g) AS row FROM project_responsibility_grants g WHERE id=$1',[review])).rows[0].row;
 const originalOther=(await pool.query('SELECT to_jsonb(a) AS row FROM aor_assignments a WHERE id=$1',[otherWitness])).rows[0].row;
 const originalTicket=(await pool.query('SELECT to_jsonb(t) AS row FROM tickets t WHERE id=$1',[ticket])).rows[0].row;
 const key=randomUUID(),body=await input(),result=await call(body,200,key);
 equal(result.assignmentId,assignment);equal(result.replacementGrantId,review);equal(result.replacementAssignmentId,witness);
 equal((await pool.query('SELECT deactivated_at FROM aor_assignments WHERE id=$1',[duplicate])).rows[0].deactivated_at,null);
 equal((await pool.query('SELECT to_jsonb(g) AS row FROM project_responsibility_grants g WHERE id=$1',[review])).rows[0].row,originalGrant);
 equal((await pool.query('SELECT to_jsonb(a) AS row FROM aor_assignments a WHERE id=$1',[otherWitness])).rows[0].row,originalOther);
 equal((await pool.query('SELECT to_jsonb(t) AS row FROM tickets t WHERE id=$1',[ticket])).rows[0].row,originalTicket);
 const event=(await pool.query('SELECT event_type,payload FROM survey_staffing_events WHERE id=$1',[result.unlinkEventId])).rows[0];
 equal(event.event_type,'survey.staffing_saved');equal(event.payload.action,'unlink-superintendent-area');equal(event.payload.version,1);equal(event.payload.replacement.provenance,'reused');equal(event.payload.replacement.grant.id,review);equal(event.payload.replacement.assignment.id,witness);equal(event.payload.previousAssignment.id,assignment);equal(event.payload.verifiedAbsence,{reportingCount:0,responsibilityCount:0,actingCount:0});
 equal(event.payload.authority.actorMembershipId,(await pool.query('SELECT id FROM project_memberships WHERE project_id=$1 AND user_id=$2',[project,id(10)])).rows[0].id);
 const tickets=new TicketRepository(),visibility=()=>resolveVisibility(pool,id(1),project,id(11),'SURVEY_SUPERINTENDENT');
 equal((await tickets.findById(pool,id(1),ticket,await visibility()))?.id,ticket);
 const remaining=await input();await call({...remaining,linkId:duplicate},200);
 equal(await tickets.findById(pool,id(1),ticket,await visibility()),null);
 equal((await pool.query('SELECT deactivated_at FROM aor_assignments WHERE id=$1',[sharedAssignment])).rows[0].deactivated_at,null);
 equal((await pool.query('SELECT deactivated_at FROM department_memberships WHERE id=$1',[membership])).rows[0].deactivated_at,null);
 equal(await call(body,200,key),result);before=await persisted();await call({...body,linkId:duplicate},409,key);equal(await persisted(),before);
 await pool.query("UPDATE project_memberships SET role='REQUESTER' WHERE project_id=$1 AND user_id=$2",[project,id(11)]);
 await pool.query('UPDATE aor_assignments SET deactivated_at=now() WHERE id=$1',[witness]);
 await pool.query("UPDATE project_memberships SET role='REQUESTER' WHERE project_id=$1 AND user_id=$2",[project,id(12)]);
 before=await persisted();equal(await call(body,200,key),result);equal(await persisted(),before);
 await pool.query("UPDATE project_memberships SET role='REQUESTER' WHERE project_id=$1 AND user_id=$2",[project,id(10)]);
 before=await persisted();await call(body,403,key);equal(await persisted(),before);
 await pool.query("UPDATE project_memberships SET role='SURVEY_MANAGER' WHERE project_id=$1 AND user_id=$2",[project,id(10)]);
 await pool.query("UPDATE projects SET status='ARCHIVED' WHERE id=$1",[project]);before=await persisted();await call(body,409,key);equal(await persisted(),before);
 console.log(`PASS ${checks} actual per-call rollback, exact-row provenance, dependency and historical replay checks; project ${project}`);
}
