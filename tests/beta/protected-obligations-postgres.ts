import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {NextRequest} from 'next/server';
import {signToken,requireActiveAuth,sessionTokenHash} from '../../src/lib/auth';
import {assertAccessAdministrator} from '../../src/lib/access-administrator';
import {resolveVisibility} from '../../src/lib/resolve-visibility';
import {TicketRepository} from '../../src/modules/ticket/infrastructure/ticket.repository';
import {approveTicket} from '../../src/modules/ticket/application/approve-ticket';
import {randomUUID} from 'node:crypto';
import {executeIdempotentHttpMutation} from '../../src/lib/idempotency';
import {handlePostProtectedObligations,type ProtectedObligationsDeps} from '../../src/app/api/projects/[projectId]/survey/protected-obligations/handler';
import {ProtectedObligationsPgRepository} from '../../src/modules/tenancy/infrastructure/protected-obligations.repository';
import {readProtectedObligations} from '../../src/modules/tenancy/application/read-protected-obligations';
import type {UUID,DbClient} from '../../src/shared/types';
import {ForbiddenError,NotFoundError,UnauthorizedError,ConflictError} from '../../src/shared/errors';
const id=(n:number)=>`98000000-0000-4000-8000-${String(n).padStart(12,'0')}` as UUID;
async function main(){
 const url=new URL(process.env.DATABASE_URL??'');assert.equal(process.env.SWR_TEAM_POSTGRES,'1');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15489');assert.equal(url.pathname,'/swr_team_isolated');
 const pg=new Pool({connectionString:url.href,max:4});let checks=0;
 const check=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++;};
 try{
  const prior=(await pg.query('SELECT name FROM tenants WHERE id=$1',[id(1)])).rows[0];
  if(prior)check(prior.name,'Protected reviewer disposable');else{
   await pg.query("INSERT INTO tenants(id,name) VALUES($1,'Protected reviewer disposable')",[id(1)]);
   await pg.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'GC','GC'),($3,$2,'Sub','SUBCONTRACTOR')",[id(2),id(1),id(8)]);
   await pg.query("INSERT INTO projects(id,tenant_id,name,status) VALUES($1,$2,'Reviewer','ACTIVE'),($3,$2,'Other','ACTIVE')",[id(3),id(1),id(9)]);
   for(const [n,name,role] of [[10,'Manager','SURVEY_MANAGER'],[11,'John','SURVEY_SUPERINTENDENT'],[12,'Jason','SURVEY_SUPERINTENDENT'],[13,'Permanent','SURVEY_SUPERINTENDENT'],[14,'Project IT','PROJECT_ADMIN'],[15,'Inactive','REQUESTER'],[16,'Chief','PARTY_CHIEF'],[17,'Central IT','VIEWER'],[18,'Sub manager','SURVEY_MANAGER']] as const){
    await pg.query("INSERT INTO users(id,tenant_id,company_id,name,email,password_hash) VALUES($1,$2,$3,$4,$5,'not-a-password')",[id(n),id(1),id(n===18?8:2),name,`${n}@reviewer.example.invalid`]);
    await pg.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)',[id(3),id(n),role]);
   }
   await pg.query('UPDATE users SET deactivated_at=now(),deactivated_by=id WHERE id=$1',[id(15)]);
   await pg.query("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'TENANT_ADMIN')",[id(1),id(17)]);
   await pg.query("INSERT INTO aor_levels(id,tenant_id,project_id,depth,label) VALUES($1,$2,$3,0,'Area')",[id(20),id(1),id(3)]);
   for(const n of [21,22])await pg.query('INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,name,code) VALUES($1,$2,$3,$4,$5,$5)',[id(n),id(1),id(3),id(20),`Area${n-20}`]);
   for(const [n,user,area] of [[30,11,21],[31,12,22]] as const){
    await pg.query("INSERT INTO project_responsibility_grants(id,tenant_id,project_id,user_id,aor_node_id,responsibility,granted_by) VALUES($1,$2,$3,$4,$5,'SURVEY_REVIEWER',$6)",[id(n),id(1),id(3),id(user),id(area),id(14)]);
    await pg.query('INSERT INTO aor_assignments(id,tenant_id,project_id,user_id,aor_node_id) VALUES($1,$2,$3,$4,$5)',[id(n+10),id(1),id(3),id(user),id(area)]);
   }
  }
  await pg.query("INSERT INTO project_admin_grants(tenant_id,project_id,user_id,origin,granted_by) SELECT $1,$2,$3,'EXPLICIT',$3 WHERE NOT EXISTS(SELECT 1 FROM project_admin_grants WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3 AND revoked_at IS NULL)",[id(1),id(3),id(14)]);
  const repo=new ProtectedObligationsPgRepository(),query={search:'',limit:10 as const,offset:0};
  const read=(actor:number,input:any,project=id(3))=>readProtectedObligations(repo,pg,{userId:id(actor),tenantId:id(1),sessionVersion:1},project,input);
  const personnel=await read(10,{mode:'personnel',query});assert.equal(personnel.mode,'personnel');if(personnel.mode!=='personnel')throw Error();
  check(personnel.personnel.data.map(p=>p.name).sort(),['Central IT','Chief','Jason','John','Permanent'].sort());
  await assert.rejects(read(16,{mode:'personnel',query}),ForbiddenError);checks++;
  await assert.rejects(read(18,{mode:'personnel',query}),ForbiddenError);checks++;
  await assert.rejects(read(10,{mode:'personnel',query},id(9)),ForbiddenError);checks++;
  await assert.rejects(read(10,{mode:'obligations',userId:id(14),query}),NotFoundError);checks++;
  await assert.rejects(read(10,{mode:'obligations',userId:id(15),query}),NotFoundError);checks++;
  const inactive=await read(14,{mode:'obligations',userId:id(15),query});assert.equal(inactive.mode,'obligations');if(inactive.mode!=='obligations')throw Error();check(inactive.person.active,false);
  const first=await read(10,{mode:'obligations',userId:id(11),query});assert.equal(first.mode,'obligations');if(first.mode!=='obligations')throw Error();check(first.obligations.total,1);check(first.obligations.data[0]!.canResolve,true);assert.match(first.snapshotToken,/^[a-f0-9]{32}$/);checks++;
  const candidates=await read(10,{mode:'candidates',userId:id(11),grantId:id(30),query});assert.equal(candidates.mode,'candidates');if(candidates.mode!=='candidates')throw Error();
  check(candidates.snapshotToken,first.snapshotToken);const jason=candidates.candidates.data.find(p=>p.userId===id(12));assert.ok(jason);check([jason.replacementGrantId,jason.replacementAssignmentId,jason.canReuse,jason.missingReviewGrant,jason.missingIndividualAssignment],[null,null,false,true,true]);
  const searched=await read(10,{mode:'candidates',userId:id(11),grantId:id(30),query:{search:'Jason',limit:25,offset:0}});assert.equal(searched.mode,'candidates');if(searched.mode!=='candidates')throw Error();check(searched.snapshotToken,first.snapshotToken);check(searched.candidates.total,1);
  await pg.query("UPDATE projects SET status='ARCHIVED' WHERE id=$1",[id(3)]);
  try{const archived=await read(10,{mode:'obligations',userId:id(11),query});assert.equal(archived.mode,'obligations');if(archived.mode!=='obligations')throw Error();check(archived.obligations.data[0]!.canResolve,false);}finally{await pg.query("UPDATE projects SET status='ACTIVE' WHERE id=$1",[id(3)]);}
  class AuthorityChangedRead extends ProtectedObligationsPgRepository{
   override async readPage(...args:Parameters<ProtectedObligationsPgRepository['readPage']>){
    await pg.query("UPDATE project_memberships SET role='VIEWER' WHERE project_id=$1 AND user_id=$2",[id(3),id(10)]);
    return super.readPage(...args);
   }
  }
  try{await assert.rejects(readProtectedObligations(new AuthorityChangedRead(),pg,{userId:id(10),tenantId:id(1),sessionVersion:1},id(3),{mode:'personnel',query}),ForbiddenError);checks++;}
  finally{await pg.query("UPDATE project_memberships SET role='SURVEY_MANAGER' WHERE project_id=$1 AND user_id=$2",[id(3),id(10)]);}
  for(const change of ["UPDATE users SET session_version=2 WHERE id=$1","UPDATE users SET deactivated_at=now(),deactivated_by=id WHERE id=$1"]){
   class AccountChangedRead extends ProtectedObligationsPgRepository{override async readPage(...args:Parameters<ProtectedObligationsPgRepository['readPage']>){await pg.query(change,[id(10)]);return super.readPage(...args);}}
   try{await assert.rejects(readProtectedObligations(new AccountChangedRead(),pg,{userId:id(10),tenantId:id(1),sessionVersion:1},id(3),{mode:'personnel',query}),UnauthorizedError);checks++;}
   finally{await pg.query('UPDATE users SET session_version=1,deactivated_at=NULL,deactivated_by=NULL WHERE id=$1',[id(10)]);}
  }
  await assert.rejects(read(10,{mode:'candidates',userId:id(11),grantId:id(31),query}),NotFoundError);checks++;
  checks+=await lateMembershipChecks(pg);
  checks+=await faultChecks(pg);
  checks+=await commandChecks(pg);
  console.log(`PASS ${checks} protected reviewer PostgreSQL read checks`);
 }finally{await pg.end();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

async function commandChecks(pg:Pool){
 const db=await pg.connect();let checks=0;
 try{
  await db.query('BEGIN');const repo=new ProtectedObligationsPgRepository();
  const deps:ProtectedObligationsDeps={repo,requireAuth:req=>requireActiveAuth(req,db),withTransaction:fn=>fn(db),executeIdempotent:executeIdempotentHttpMutation};
  // Injected requireAuth must use the transaction client on its second call too.
  const auth={userId:id(10),tenantId:id(1),sessionVersion:1},ctx={params:Promise.resolve({projectId:id(3)})};
  const token=signToken(id(10),id(1));
  const call=async(body:unknown,status:number,key=randomUUID(),bearer=token)=>{
   const req=new NextRequest(`http://localhost/api/projects/${id(3)}/survey/protected-obligations`,{method:'POST',headers:{cookie:`swr_session=${bearer}`,'content-type':'application/json','idempotency-key':key},body:JSON.stringify(body)});
   const response=await handlePostProtectedObligations(req,ctx,deps),result=await response.json();assert.equal(response.status,status,JSON.stringify(result));assert.equal(response.headers.get('cache-control'),'private, no-store');checks+=2;return result;
  };
  const snapshot=async()=>{const result=await readProtectedObligations(repo,db,auth,id(3),{mode:'obligations',userId:id(11),query:{search:'',limit:10,offset:0}});assert.equal(result.mode,'obligations');if(result.mode!=='obligations')throw Error();return result.snapshotToken;};
  const input={userId:id(11),grantId:id(30),replacementUserId:id(12),expectedSnapshot:await snapshot(),coverageMode:'assignAdditional',confirmResolution:true,confirmAdditionalCoverage:true,coverageIntent:'TEMPORARY'};
  await db.query("INSERT INTO tickets(id,tenant_id,project_id,aor_node_id,company_id,ticket_number,requester_id,workflow_variant,status,craft,description,requested_date,ticket_type,submitted_at) VALUES($1,$2,$3,$4,$5,'REVIEWER-SYNTHETIC',$6,'STANDARD_APPROVAL','SUBMITTED','Survey','Disposable handover proof','2026-10-10','LAYOUT',now())",[id(60),id(1),id(3),id(21),id(2),id(10)]);
  const tickets=new TicketRepository();
  const visibility=()=>resolveVisibility(db,id(1),id(3),id(12),'SURVEY_SUPERINTENDENT');
  assert.equal(await tickets.findById(db,id(1),id(60),await visibility()),null);checks++;
  const beforeTicket=(await db.query('SELECT to_jsonb(t) AS row FROM tickets t WHERE id=$1',[id(60)])).rows;
  await db.query('SAVEPOINT case_start');
  const before=(await db.query('SELECT to_jsonb(g) AS row FROM project_responsibility_grants g WHERE id=$1',[id(31)])).rows;
  const key=randomUUID(),result=await call(input,200,key);
  assert.equal(result.createdReviewGrant,true);assert.equal(result.createdIndividualAssignment,true);checks+=2;
  assert.deepEqual((await db.query('SELECT to_jsonb(g) AS row FROM project_responsibility_grants g WHERE id=$1',[id(31)])).rows,before);checks++;
  assert.equal((await db.query('SELECT deactivated_at FROM aor_assignments WHERE id=$1',[id(40)])).rows[0].deactivated_at,null);checks++;
  assert.deepEqual((await db.query('SELECT to_jsonb(t) AS row FROM tickets t WHERE id=$1',[id(60)])).rows,beforeTicket);checks++;
  assert.equal((await tickets.findById(db,id(1),id(60),await visibility()))!.id,id(60));checks++;
  await assert.rejects(approveTicket(tickets,db,{tenantId:id(1),ticketId:id(60),actorId:id(11),actorRole:'SURVEY_SUPERINTENDENT',visibility:await resolveVisibility(db,id(1),id(3),id(11),'SURVEY_SUPERINTENDENT')}),ForbiddenError);checks++;
  assert.equal((await approveTicket(tickets,db,{tenantId:id(1),ticketId:id(60),actorId:id(12),actorRole:'SURVEY_SUPERINTENDENT',visibility:await visibility()})).status,'APPROVED');checks++;
  const events=(await db.query('SELECT action,resolution_evidence AS evidence FROM access_grant_events WHERE project_id=$1 ORDER BY action',[id(3)])).rows;
  assert.equal(events.length,2);assert.deepEqual(events.map(e=>e.action),['RESPONSIBILITY_GRANTED','RESPONSIBILITY_REVOKED']);checks+=2;
  for(const event of events){assert.equal(event.evidence.version,1);assert.equal(event.evidence.resolutionId,result.resolutionEventId);assert.equal(event.evidence.coverageIntent,'TEMPORARY');assert.equal(event.evidence.temporaryCoverage,true);assert.equal(event.evidence.authority.branch,'PROJECT_SURVEY_MANAGER');assert.equal(event.evidence.replacementGrant.id,result.replacementGrantId);assert.equal(event.evidence.replacementAssignment.id,result.replacementAssignmentId);checks+=7;}
  const added=await readProtectedObligations(repo,db,auth,id(3),{mode:'obligations',userId:id(12),query:{search:'Area1',limit:10,offset:0}});assert.equal(added.mode,'obligations');if(added.mode!=='obligations')throw Error();
  assert.equal(added.obligations.data[0]!.addedCoverageIntent,'TEMPORARY');assert.deepEqual(added.obligations.data[0]!.addedIndividualAssignment,{id:result.replacementAssignmentId,coverageIntent:'TEMPORARY'});checks+=2;
  assert.deepEqual(await call(input,200,key),result);checks++;
  // Exact historical replay does not reapply fresh subject/replacement eligibility.
  // Observe persisted relevant state/history before and after each independent loss.
  const replayState=async()=>(await db.query(`SELECT jsonb_build_object(
   'grants',(SELECT jsonb_agg(g ORDER BY id) FROM project_responsibility_grants g WHERE project_id=$1),
   'assignments',(SELECT jsonb_agg(a ORDER BY id) FROM aor_assignments a WHERE project_id=$1),
   'events',(SELECT jsonb_agg(e ORDER BY id) FROM access_grant_events e WHERE project_id=$1),
   'ledger',(SELECT jsonb_agg(i ORDER BY actor_id,endpoint,idempotency_key) FROM api_idempotency i WHERE tenant_id=$2),
   'memberships',(SELECT jsonb_agg(m ORDER BY id) FROM project_memberships m WHERE project_id=$1),
   'accounts',(SELECT jsonb_agg(jsonb_build_object('id',u.id,'company',u.company_id,'active',u.deactivated_at,'sv',u.session_version) ORDER BY u.id) FROM users u WHERE id=ANY($3::uuid[]))
  ) AS state`,[id(3),id(1),[id(11),id(12)]])).rows[0].state;
  await db.query('SAVEPOINT replay_eligibility');
  for(const [sql,args] of [
   ["UPDATE project_memberships SET role='PARTY_CHIEF' WHERE project_id=$1 AND user_id=$2",[id(3),id(12)]],
   ['UPDATE users SET deactivated_at=now(),deactivated_by=id,session_version=session_version+1 WHERE id=$1',[id(12)]],
   ['UPDATE users SET company_id=$2 WHERE id=$1',[id(12),id(8)]],
   ["UPDATE project_memberships SET role='SURVEY_MANAGER' WHERE project_id=$1 AND user_id=$2",[id(3),id(11)]]
  ] as const){
   await db.query(sql,[...args]);const observed=await replayState();
   assert.deepEqual(await call(input,200,key),result);checks++;
   assert.deepEqual(await replayState(),observed);checks++;
   await db.query('ROLLBACK TO SAVEPOINT replay_eligibility');
  }
  // Historical exact retry after the created witnesses and current subject
  // membership disappear must return evidence without recreating authority.
  await db.query('UPDATE project_responsibility_grants SET revoked_at=now(),revoked_by=$2 WHERE id=$1',[result.replacementGrantId,id(14)]);
  await db.query('UPDATE aor_assignments SET deactivated_at=now() WHERE id=$1',[result.replacementAssignmentId]);
  await db.query('DELETE FROM project_memberships WHERE project_id=$1 AND user_id=$2',[id(3),id(11)]);
  await db.query('UPDATE aor_nodes SET retired_at=now() WHERE id=$1',[id(21)]);
  assert.deepEqual(await call(input,200,key),result);checks++;
  assert.notEqual((await db.query('SELECT revoked_at FROM project_responsibility_grants WHERE id=$1',[result.replacementGrantId])).rows[0].revoked_at,null);checks++;
  await db.query('ROLLBACK TO SAVEPOINT case_start');
  await assert.rejects(assertAccessAdministrator(db,auth,id(3)),ForbiddenError);checks++;
  // Reuse retains provenance, including a deterministic witness when duplicates exist.
  await db.query("INSERT INTO project_responsibility_grants(id,tenant_id,project_id,user_id,aor_node_id,responsibility,granted_by) VALUES($1,$2,$3,$4,$5,'SURVEY_REVIEWER',$6)",[id(55),id(1),id(3),id(12),id(21),id(14)]);
  for(const n of [56,57])await db.query('INSERT INTO aor_assignments(id,tenant_id,project_id,user_id,aor_node_id,created_at) VALUES($1,$2,$3,$4,$5,$6)',[id(n),id(1),id(3),id(12),id(21),`2026-09-${n===56?'01':'02'}T00:00:00Z`]);
  const reused=await call({userId:input.userId,grantId:input.grantId,replacementUserId:input.replacementUserId,coverageMode:'reuse',confirmResolution:true,expectedSnapshot:await snapshot()},200);
  assert.equal(reused.createdReviewGrant,false);assert.equal(reused.createdIndividualAssignment,false);assert.equal(reused.replacementGrantId,id(55));assert.equal(reused.replacementAssignmentId,id(56));checks+=4;
  assert.equal((await approveTicket(tickets,db,{tenantId:id(1),ticketId:id(60),actorId:id(12),actorRole:'SURVEY_SUPERINTENDENT',visibility:await visibility()})).status,'APPROVED');checks++;
  assert.equal((await db.query('SELECT count(*)::int AS n FROM access_grant_events WHERE project_id=$1',[id(3)])).rows[0].n,1);checks++;
  await db.query('ROLLBACK TO SAVEPOINT case_start');
  // Historical revoked/deactivated coverage is never revived.
  await db.query("INSERT INTO project_responsibility_grants(id,tenant_id,project_id,user_id,aor_node_id,responsibility,granted_by,revoked_by,revoked_at) VALUES($1,$2,$3,$4,$5,'SURVEY_REVIEWER',$6,$6,now())",[id(55),id(1),id(3),id(12),id(21),id(14)]);
  await db.query('INSERT INTO aor_assignments(id,tenant_id,project_id,user_id,aor_node_id,deactivated_at) VALUES($1,$2,$3,$4,$5,now())',[id(56),id(1),id(3),id(12),id(21)]);
  const newCoverage=await call({...input,expectedSnapshot:await snapshot()},200);
  assert.notEqual(newCoverage.replacementGrantId,id(55));assert.notEqual(newCoverage.replacementAssignmentId,id(56));checks+=2;
  assert.notEqual((await db.query('SELECT revoked_at FROM project_responsibility_grants WHERE id=$1',[id(55)])).rows[0].revoked_at,null);assert.notEqual((await db.query('SELECT deactivated_at FROM aor_assignments WHERE id=$1',[id(56)])).rows[0].deactivated_at,null);checks+=2;
  await db.query('ROLLBACK TO SAVEPOINT case_start');
  // Grant-only coverage adds an assignment without inventing grant provenance.
  await db.query("INSERT INTO project_responsibility_grants(id,tenant_id,project_id,user_id,aor_node_id,responsibility,granted_by) VALUES($1,$2,$3,$4,$5,'SURVEY_REVIEWER',$6)",[id(55),id(1),id(3),id(12),id(21),id(14)]);
  const grantOnly=await call({...input,expectedSnapshot:await snapshot()},200);
  assert.equal(grantOnly.createdReviewGrant,false);assert.equal(grantOnly.createdIndividualAssignment,true);checks+=2;
  assert.equal((await db.query("SELECT count(*)::int AS n FROM access_grant_events WHERE project_id=$1 AND action='RESPONSIBILITY_GRANTED'",[id(3)])).rows[0].n,0);checks++;
  const covered=await readProtectedObligations(repo,db,auth,id(3),{mode:'obligations',userId:id(12),query:{search:'Area1',limit:10,offset:0}});assert.equal(covered.mode,'obligations');if(covered.mode!=='obligations')throw Error();
  assert.equal(covered.obligations.data[0]!.addedCoverageIntent,null);assert.deepEqual(covered.obligations.data[0]!.addedIndividualAssignment,{id:grantOnly.replacementAssignmentId,coverageIntent:'TEMPORARY'});checks+=2;
  await db.query('ROLLBACK TO SAVEPOINT case_start');
  // The later permanent successor receives explicit permanent provenance.
  const temporary=await call(input,200);
  const jason=await readProtectedObligations(repo,db,auth,id(3),{mode:'obligations',userId:id(12),query:{search:'',limit:10,offset:0}});assert.equal(jason.mode,'obligations');if(jason.mode!=='obligations')throw Error();
  const permanent=await call({...input,userId:id(12),grantId:temporary.replacementGrantId,replacementUserId:id(13),expectedSnapshot:jason.snapshotToken,coverageIntent:'PERMANENT'},200);
  assert.equal(permanent.createdReviewGrant,true);assert.equal(permanent.createdIndividualAssignment,true);checks+=2;
  const permanentEvent=(await db.query('SELECT resolution_evidence AS evidence FROM access_grant_events WHERE id=$1',[permanent.resolutionEventId])).rows[0].evidence;
  assert.equal(permanentEvent.coverageIntent,'PERMANENT');assert.equal(permanentEvent.temporaryCoverage,false);checks+=2;
  assert.deepEqual((await db.query('SELECT to_jsonb(g) AS row FROM project_responsibility_grants g WHERE id=$1',[id(31)])).rows,before);checks++;
  await db.query('ROLLBACK TO SAVEPOINT case_start');
  await call({...input,expectedSnapshot:'b'.repeat(32)},409);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM access_grant_events WHERE project_id=$1',[id(3)])).rows[0].n,0);checks++;
  await db.query('ROLLBACK TO SAVEPOINT case_start');
  deps.repo=repo;
  // Every refusal uses the actual handler/repository with no UI authority.
  const negatives=[
   ["UPDATE project_memberships SET role='SURVEY_MANAGER' WHERE project_id=$1 AND user_id=$2",[id(3),id(11)],409],
   ['UPDATE users SET deactivated_at=now(),deactivated_by=id WHERE id=$1',[id(11)],409],
   ["UPDATE project_memberships SET role='PARTY_CHIEF' WHERE project_id=$1 AND user_id=$2",[id(3),id(12)],409],
   ['UPDATE users SET deactivated_at=now(),deactivated_by=id WHERE id=$1',[id(12)],409],
   ['UPDATE users SET company_id=$2 WHERE id=$1',[id(12),id(8)],409],
   ["UPDATE project_responsibility_grants SET responsibility='FIELD_COORDINATOR' WHERE id=$1",[id(30)],409],
   ['UPDATE project_responsibility_grants SET aor_node_id=NULL WHERE id=$1',[id(30)],409],
   ['UPDATE aor_nodes SET retired_at=now() WHERE id=$1',[id(21)],409],
   ['UPDATE aor_levels SET depth=1 WHERE id=$1',[id(20)],409],
   ["UPDATE projects SET status='ARCHIVED' WHERE id=$1",[id(3)],409],
   ["UPDATE project_memberships SET role='VIEWER' WHERE project_id=$1 AND user_id=$2",[id(3),id(10)],403],
   ['DELETE FROM project_memberships WHERE project_id=$1 AND user_id=$2',[id(3),id(10)],403],
   ['UPDATE users SET session_version=2 WHERE id=$1',[id(10)],401],
   ["UPDATE companies SET type='SUBCONTRACTOR' WHERE id=$1",[id(2)],403]
  ] as const;
  for(const [sql,args,status] of negatives){await db.query(sql,[...args]);await call(input,status);assert.equal((await db.query('SELECT count(*)::int AS n FROM access_grant_events WHERE project_id=$1',[id(3)])).rows[0].n,0);checks++;await db.query('ROLLBACK TO SAVEPOINT case_start');}
  await call({...input,grantId:id(31)},404);
  await call({...input,replacementUserId:id(9999)},404);
  await db.query('ROLLBACK TO SAVEPOINT case_start');
  await db.query(`INSERT INTO revoked_auth_sessions(token_hash,tenant_id,user_id,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')`,[sessionTokenHash(token),id(1),id(10)]);
  await call(input,401);await db.query('ROLLBACK TO SAVEPOINT case_start');
  // Successful historical replay still requires current authority; independently
  // retained IT can serve the same actor after Manager authority was removed.
  const historicalKey=randomUUID(),historical=await call(input,200,historicalKey);
  await db.query("UPDATE project_memberships SET role='VIEWER' WHERE project_id=$1 AND user_id=$2",[id(3),id(10)]);
  await call(input,403,historicalKey);
  await db.query("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'TENANT_ADMIN')",[id(1),id(10)]);
  assert.deepEqual(await call(input,200,historicalKey),historical);checks++;
  await call({...input,coverageIntent:'PERMANENT'},409,historicalKey);
  await db.query('ROLLBACK TO SAVEPOINT case_start');
  // Project and central IT use the same narrowly scoped mechanism.
  for(const it of [14,17]){await call(input,200,randomUUID(),signToken(id(it),id(1)));await db.query('ROLLBACK TO SAVEPOINT case_start');}
  await call(input,403,randomUUID(),signToken(id(16),id(1)));
  await call({...input,coverageMode:'reuse'},400);
  await db.query('ROLLBACK TO SAVEPOINT case_start');
  console.log(`PASS ${checks} protected reviewer actual command/retry/audit/rollback checks`);
  return checks;
 }finally{await db.query('ROLLBACK');db.release();}
}

async function faultChecks(pg:Pool){
 let checks=0;
 const state=async()=>(await pg.query(`SELECT md5(jsonb_build_object(
 'grants',(SELECT jsonb_agg(g ORDER BY id) FROM project_responsibility_grants g WHERE project_id=$1),
 'assignments',(SELECT jsonb_agg(a ORDER BY id) FROM aor_assignments a WHERE project_id=$1),
 'audit',(SELECT jsonb_agg(e ORDER BY id) FROM access_grant_events e WHERE project_id=$1),
 'ledger',(SELECT jsonb_agg(i ORDER BY actor_id,endpoint,idempotency_key) FROM api_idempotency i WHERE tenant_id=$2)
 )::text) AS hash`,[id(3),id(1)])).rows[0].hash;
 const snapshot=await new ProtectedObligationsPgRepository().snapshot(pg,{tenantId:id(1),projectId:id(3)},id(11));
 const input={userId:id(11),grantId:id(30),replacementUserId:id(12),expectedSnapshot:snapshot,coverageMode:'assignAdditional',confirmResolution:true,confirmAdditionalCoverage:true,coverageIntent:'TEMPORARY'};
 for(const fault of ['assignment','grant','revoke','audit1','audit2','ledger']){
  const before=await state();let reached=false;
  const transaction=async<T>(fn:(db:DbClient)=>Promise<T>)=>{
   const client=await pg.connect();let auditInserts=0;
   const db:DbClient={query:async<T extends object>(sql:string,params?:unknown[])=>{
    if(sql.startsWith('INSERT INTO access_grant_events'))auditInserts++;
    if((fault==='assignment'&&sql.startsWith('INSERT INTO aor_assignments'))||(fault==='grant'&&sql.startsWith('INSERT INTO project_responsibility_grants'))||(fault==='revoke'&&sql.startsWith('UPDATE project_responsibility_grants'))||(fault==='audit1'&&auditInserts===1&&sql.startsWith('INSERT INTO access_grant_events'))||(fault==='audit2'&&auditInserts===2&&sql.startsWith('INSERT INTO access_grant_events'))||(fault==='ledger'&&sql.includes('UPDATE api_idempotency'))){reached=true;throw Error('Harness-only '+fault+' failure');}
    return client.query<T>(sql,params);
   }};
   try{await client.query('BEGIN');const result=await fn(db);await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  };
  const req=new NextRequest(`http://localhost/api/projects/${id(3)}/survey/protected-obligations`,{method:'POST',headers:{cookie:`swr_session=${signToken(id(10),id(1))}`,'content-type':'application/json','idempotency-key':randomUUID()},body:JSON.stringify(input)});
  const response=await handlePostProtectedObligations(req,{params:Promise.resolve({projectId:id(3)})},{repo:new ProtectedObligationsPgRepository(),requireAuth:(req,db)=>requireActiveAuth(req,db??pg),withTransaction:transaction,executeIdempotent:executeIdempotentHttpMutation});
  assert.equal(response.status,500,JSON.stringify(await response.json()));assert.equal(reached,true,`fault ${fault} reached`);assert.equal(await state(),before,`all persisted state unchanged after ${fault}, before any cleanup`);checks+=3;
 }
 console.log(`PASS ${checks} real per-call transaction rollback checks`);return checks;
}

async function lateMembershipChecks(pg:Pool){
 const client=await pg.connect();let inserted=false;
 const input={userId:id(11),grantId:id(30),replacementUserId:id(12),expectedSnapshot:'a'.repeat(32),coverageMode:'reuse' as const,confirmResolution:true as const};
 try{
  await client.query('BEGIN');await client.query("SET LOCAL statement_timeout='5000ms'");
  const db:DbClient={query:async<T extends object>(sql:string,params?:unknown[])=>{
   const result=await client.query<T>(sql,params);
   if(sql.startsWith('SELECT id FROM tenant_memberships')&&!inserted){
    await pg.query("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'TENANT_ADMIN')",[id(1),id(10)]);inserted=true;
   }
   return result;
  }};
  await assert.rejects(new ProtectedObligationsPgRepository().lockResolutionContext(db,{tenantId:id(1),userId:id(10),sessionVersion:1},id(3),input),ConflictError);
  // The newly inserted witness really was not in the held set: its removal is
  // an independent session and must not be able to underpin accepted evidence.
  await pg.query('DELETE FROM tenant_memberships WHERE tenant_id=$1 AND user_id=$2',[id(1),id(10)]);
  console.log('PASS 2 late membership insertion/refusal checks');return 2;
 }finally{await client.query('ROLLBACK');client.release();if(inserted)await pg.query('DELETE FROM tenant_memberships WHERE tenant_id=$1 AND user_id=$2',[id(1),id(10)]);}
}
