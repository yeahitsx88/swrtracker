import assert from 'node:assert/strict';
import {Pool} from 'pg';
import jwt from 'jsonwebtoken';
import {randomUUID} from 'node:crypto';
import {NextRequest} from 'next/server';
import {requireActiveAuth,signToken,sessionTokenHash} from '../../src/lib/auth';
import {handlePostProtectedObligations} from '../../src/app/api/projects/[projectId]/survey/protected-obligations/handler';
import {ProtectedObligationsPgRepository} from '../../src/modules/tenancy/infrastructure/protected-obligations.repository';
import {resolveSurveyReviewer} from '../../src/modules/tenancy/application/resolve-survey-reviewer';
import {executeIdempotentHttpMutation} from '../../src/lib/idempotency';
import type {UUID,DbClient} from '../../src/shared/types';
const id=(n:number)=>`98000000-0000-4000-8000-${String(n).padStart(12,'0')}` as UUID;
async function main(){
 const url=new URL(process.env.DATABASE_URL??'');assert.equal(process.env.SWR_TEAM_POSTGRES,'1');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15489');assert.equal(url.pathname,'/swr_team_isolated');
 const pg=new Pool({connectionString:url.href,max:5});let checks=0;
 const repo=new ProtectedObligationsPgRepository(),auth={tenantId:id(1),userId:id(10),sessionVersion:1};
 const check=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++;};
 const wait=async(waiter:number,holder:number)=>{const deadline=Date.now()+2000;while(Date.now()<deadline){if((await pg.query('SELECT $2::int=ANY(pg_blocking_pids($1)) AS blocked',[waiter,holder])).rows[0].blocked){checks++;return;}await new Promise(r=>setTimeout(r,10));}throw Error('Expected actual lock wait missing');};
 try{
  check((await pg.query('SELECT name FROM tenants WHERE id=$1',[id(1)])).rows[0]?.name,'Protected reviewer disposable');
  check((await pg.query('SELECT count(*)::int AS n FROM access_grant_events WHERE project_id=$1',[id(3)])).rows[0].n,0);
  for(const kind of ['expiry','logout']){
   const a=await pg.connect(),b=await pg.connect();let pending:Promise<Response>|undefined,hash:string|undefined;
   try{
    const aPid=(await a.query('SELECT pg_backend_pid() AS pid')).rows[0].pid,bPid=(await b.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    await b.query('BEGIN');await b.query("SET LOCAL statement_timeout='6000ms'");await b.query('SELECT id FROM project_responsibility_grants WHERE id=$1 FOR NO KEY UPDATE',[id(30)]);
    const bearer=kind==='expiry'?jwt.sign({sub:id(10),tenantId:id(1),sv:1},process.env.JWT_SECRET!,{expiresIn:3,jwtid:randomUUID()}):signToken(id(10),id(1));
    const input={userId:id(11),grantId:id(30),replacementUserId:id(12),coverageMode:'assignAdditional',confirmAdditionalCoverage:true,coverageIntent:'TEMPORARY',confirmResolution:true,expectedSnapshot:await repo.snapshot(pg,{tenantId:id(1),projectId:id(3)},id(11))};
    const req=new NextRequest(`http://localhost/api/projects/${id(3)}/survey/protected-obligations`,{method:'POST',headers:{cookie:`swr_session=${bearer}`,'content-type':'application/json','idempotency-key':randomUUID()},body:JSON.stringify(input)});
    const transaction=async<T>(fn:(db:DbClient)=>Promise<T>)=>{try{await a.query('BEGIN');await a.query("SET LOCAL statement_timeout='6000ms'");const result=await fn(a);await a.query('COMMIT');return result;}catch(error){await a.query('ROLLBACK');throw error;}};
    pending=handlePostProtectedObligations(req,{params:Promise.resolve({projectId:id(3)})},{repo,requireAuth:(req,db)=>requireActiveAuth(req,db??pg),withTransaction:transaction,executeIdempotent:executeIdempotentHttpMutation});
    await wait(aPid,bPid);
    if(kind==='expiry'){const exp=(jwt.decode(bearer) as {exp:number}).exp;await new Promise(r=>setTimeout(r,Math.max(0,exp*1000-Date.now()+50)));}
    else{hash=sessionTokenHash(bearer);await pg.query("INSERT INTO revoked_auth_sessions(token_hash,tenant_id,user_id,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[hash,id(1),id(10)]);}
    await b.query('COMMIT');const response=await pending;check(response.status,401);
    check((await pg.query('SELECT revoked_at FROM project_responsibility_grants WHERE id=$1',[id(30)])).rows[0].revoked_at,null);
    check((await pg.query('SELECT count(*)::int AS n FROM access_grant_events WHERE project_id=$1',[id(3)])).rows[0].n,0);
    check((await pg.query('SELECT count(*)::int AS n FROM api_idempotency WHERE tenant_id=$1 AND endpoint=$2',[id(1),`POST:/api/projects/${id(3)}/survey/protected-obligations`])).rows[0].n,0);
   }finally{await b.query('ROLLBACK');if(pending)await pending;await a.query('ROLLBACK');a.release();b.release();if(hash)await pg.query('DELETE FROM revoked_auth_sessions WHERE token_hash=$1 AND tenant_id=$2',[hash,id(1)]);}
  }
  // Two projects choose opposite subjects; shared identities are acquired in
  // the same stable order, without an exclusive global actor account lock.
  const project=randomUUID() as UUID,level=randomUUID(),area=randomUUID(),departing=randomUUID() as UUID,coverage=randomUUID(),assignment=randomUUID();let projectOwned=false;
  const a=await pg.connect(),b=await pg.connect();
  try{
   await pg.query("INSERT INTO projects(id,tenant_id,name,status) VALUES($1,$2,'Reviewer two-project disposable','ACTIVE')",[project,id(1)]);projectOwned=true;
   for(const [user,role] of [[id(10),'SURVEY_MANAGER'],[id(11),'SURVEY_SUPERINTENDENT'],[id(12),'SURVEY_SUPERINTENDENT']])await pg.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)',[project,user,role]);
   await pg.query("INSERT INTO aor_levels(id,tenant_id,project_id,depth,label) VALUES($1,$2,$3,0,'Area')",[level,id(1),project]);
   await pg.query("INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,name,code) VALUES($1,$2,$3,$4,'Other Area','OTHER')",[area,id(1),project,level]);
   for(const [grant,user] of [[departing,id(12)],[coverage,id(11)]])await pg.query("INSERT INTO project_responsibility_grants(id,tenant_id,project_id,user_id,aor_node_id,responsibility,granted_by) VALUES($1,$2,$3,$4,$5,'SURVEY_REVIEWER',$6)",[grant,id(1),project,user,area,id(14)]);
   await pg.query('INSERT INTO aor_assignments(id,tenant_id,project_id,user_id,aor_node_id) VALUES($1,$2,$3,$4,$5)',[assignment,id(1),project,id(11),area]);
   const first={userId:id(11),grantId:id(30),replacementUserId:id(12),coverageMode:'assignAdditional' as const,confirmAdditionalCoverage:true as const,coverageIntent:'TEMPORARY' as const,confirmResolution:true as const,expectedSnapshot:await repo.snapshot(pg,{tenantId:id(1),projectId:id(3)},id(11))};
   const second={userId:id(12),grantId:departing,replacementUserId:id(11),coverageMode:'reuse' as const,confirmResolution:true as const,expectedSnapshot:await repo.snapshot(pg,{tenantId:id(1),projectId:project},id(12))};
   for(const db of [a,b]){await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='6000ms'");}
   const command=async(db:DbClient,pid:UUID,input:typeof first|typeof second)=>resolveSurveyReviewer(repo,db,await repo.lockResolutionContext(db,auth,pid,input),input);
   const results=await Promise.all([command(a,id(3),first),command(b,project,second)]);
   check(results.map(r=>r.resolved),[true,true]);check(results.map(r=>r.createdReviewGrant),[true,false]);check(results.map(r=>r.createdIndividualAssignment),[true,false]);
  }finally{await a.query('ROLLBACK');await b.query('ROLLBACK');a.release();b.release();if(projectOwned){await pg.query('DELETE FROM aor_assignments WHERE project_id=$1',[project]);await pg.query('DELETE FROM project_responsibility_grants WHERE project_id=$1',[project]);await pg.query('DELETE FROM aor_nodes WHERE project_id=$1',[project]);await pg.query('DELETE FROM aor_levels WHERE project_id=$1',[project]);await pg.query('DELETE FROM project_memberships WHERE project_id=$1',[project]);await pg.query('DELETE FROM projects WHERE id=$1 AND tenant_id=$2',[project,id(1)]);}}
  console.log(`PASS ${checks} post-wait expiry/logout and two-project ordering checks`);
 }finally{await pg.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
