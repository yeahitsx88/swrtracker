import assert from 'node:assert/strict';
import {Pool} from 'pg';
import jwt from 'jsonwebtoken';
import {randomUUID} from 'node:crypto';
import {NextRequest} from 'next/server';
import type {DbClient,UUID} from '../../src/shared/types';
import {requireActiveAuth,signToken} from '../../src/lib/auth';
import {handlePostLogout} from '../../src/app/api/auth/logout/handler';
import {executeIdempotentHttpMutation} from '../../src/lib/idempotency';
import {SuperintendentAreasPgRepository} from '../../src/modules/tenancy/infrastructure/superintendent-areas.repository';
import {handlePatchSuperintendentArea} from '../../src/app/api/projects/[projectId]/survey/staffing/superintendent-area-handler';
const id=(n:number)=>`99010000-0000-4000-8000-${String(n).padStart(12,'0')}` as UUID;
async function main(){
 const url=new URL(process.env.DATABASE_URL??'');assert.equal(process.env.SWR_TEAM_POSTGRES,'1');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15489');assert.equal(url.pathname,'/swr_team_isolated');
 const pg=new Pool({connectionString:url.href,max:5}),repo=new SuperintendentAreasPgRepository();let checks=0;
 const eq=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++;};
 const tx=async<T>(fn:(db:DbClient)=>Promise<T>):Promise<T>=>{const db=await pg.connect();try{await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='7000ms'");const result=await fn(db);await db.query('COMMIT');return result;}catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}};
 const wait=async(waiter:number,holder:number)=>{const end=Date.now()+2500;while(Date.now()<end){if((await pg.query('SELECT $2::int=ANY(pg_blocking_pids($1::int)) AS blocked',[waiter,holder])).rows[0].blocked){checks++;return;}await new Promise(r=>setTimeout(r,10));}throw Error('Expected actual session-test lock wait missing');};
 try{
  eq((await pg.query('SELECT name FROM tenants WHERE id=$1',[id(1)])).rows[0]?.name,'Superintendent Area unlink disposable');
  for(const kind of ['expiry','logout','session-version','deactivated-account','lost-manager','subcontractor-company'] as const){
   const project=randomUUID() as UUID,manager=randomUUID() as UUID,company=randomUUID(),area=randomUUID(),level=randomUUID(),assignment=randomUUID() as UUID,witness=randomUUID() as UUID,review=randomUUID() as UUID;
   await tx(async db=>{
    await db.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'Area unlink session GC','GC')",[company,id(1)]);
    await db.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,'Area unlink session Manager','not-a-login-hash')",[manager,id(1),company,manager+'@example.test']);
    await db.query("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'TENANT_ADMIN')",[id(1),manager]);
    await db.query("INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,'Area unlink session disposable','ACTIVE','FULL')",[project,id(1)]);
    for(const [user,role] of [[manager,'SURVEY_MANAGER'],[id(11),'SURVEY_SUPERINTENDENT'],[id(12),'SURVEY_SUPERINTENDENT']] as const)await db.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)',[project,user,role]);
    await db.query("INSERT INTO aor_levels(id,tenant_id,project_id,depth,label) VALUES($1,$2,$3,0,'Area')",[level,id(1),project]);
    await db.query("INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,name,code) VALUES($1,$2,$3,$4,'Area1','A1')",[area,id(1),project,level]);
    for(const [row,user] of [[assignment,id(11)],[witness,id(12)]] as const)await db.query('INSERT INTO aor_assignments(id,tenant_id,project_id,user_id,aor_node_id) VALUES($1,$2,$3,$4,$5)',[row,id(1),project,user,area]);
    await db.query("INSERT INTO project_responsibility_grants(id,tenant_id,project_id,user_id,aor_node_id,responsibility,granted_by) VALUES($1,$2,$3,$4,$5,'SURVEY_REVIEWER',$6)",[review,id(1),project,id(12),area,manager]);
   });
   const token=signToken(manager,id(1)),body={action:'unlink-superintendent-area',superintendentId:id(11),linkId:assignment,replacementUserId:id(12),replacementGrantId:review,replacementAssignmentId:witness,expectedSnapshot:await repo.snapshot(pg,{tenantId:id(1),projectId:project},id(11)),confirmUnlink:true},key=randomUUID(),ctx={params:Promise.resolve({projectId:project})};
   const request=(cookie:string)=>new NextRequest(`http://localhost/api/projects/${project}/survey/staffing`,{method:'PATCH',headers:{cookie:`swr_session=${cookie}`,'content-type':'application/json','idempotency-key':key},body:JSON.stringify(body)});
   const deps={repo,executeIdempotent:executeIdempotentHttpMutation,withTransaction:tx,requireAuth:(req:NextRequest,db:DbClient=pg)=>requireActiveAuth(req,db)};
   const first=await handlePatchSuperintendentArea(request(token),ctx,deps);eq(first.status,200);
   const before=(await pg.query(`SELECT jsonb_build_object('events',(SELECT jsonb_agg(e ORDER BY id) FROM survey_staffing_events e WHERE project_id=$1),'ledger',(SELECT jsonb_agg(l ORDER BY idempotency_key) FROM api_idempotency l WHERE endpoint=$2),'assignment',(SELECT to_jsonb(a) FROM aor_assignments a WHERE id=$3)) AS state`,[project,`PATCH:/api/projects/${project}/survey/staffing:unlink-superintendent-area`,assignment])).rows[0].state;
   const holder=await pg.connect();try{
    await holder.query('BEGIN');const holderPid=(await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;await holder.query('SELECT id FROM projects WHERE id=$1 FOR NO KEY UPDATE',[project]);
    let started!:(pid:number)=>void;const backend=new Promise<number>(resolve=>{started=resolve;});
    const pendingCookie=kind==='expiry'?jwt.sign({sub:manager,tenantId:id(1),sv:1},process.env.JWT_SECRET!,{expiresIn:2,jwtid:randomUUID()}):token;
    const pending=handlePatchSuperintendentArea(request(pendingCookie),ctx,{...deps,withTransaction:fn=>tx(async db=>{started((await db.query<{pid:number}>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid);return fn(db);})});
    await wait(await backend,holderPid);
    if(kind==='expiry'){
     const expiry=(jwt.decode(pendingCookie) as {exp:number}).exp*1000;
     while(Date.now()<=expiry)await new Promise(r=>setTimeout(r,20));
    }else if(kind==='logout')eq((await handlePostLogout(new NextRequest('http://localhost/api/auth/logout',{method:'POST',headers:{cookie:`swr_session=${pendingCookie}`}}),pg)).status,200);
    else if(kind==='session-version')await pg.query('UPDATE users SET session_version=session_version+1 WHERE id=$1',[manager]);
    else if(kind==='deactivated-account')await pg.query('UPDATE users SET deactivated_at=now() WHERE id=$1',[manager]);
    else if(kind==='lost-manager')await pg.query("UPDATE project_memberships SET role='REQUESTER' WHERE project_id=$1 AND user_id=$2",[project,manager]);
    else await pg.query("UPDATE companies SET type='SUBCONTRACTOR' WHERE id=$1",[company]);
    await holder.query('COMMIT');const result=await pending;eq(result.status,kind==='lost-manager'||kind==='subcontractor-company'?403:401);eq(result.headers.get('cache-control'),'private, no-store');
    const after=(await pg.query(`SELECT jsonb_build_object('events',(SELECT jsonb_agg(e ORDER BY id) FROM survey_staffing_events e WHERE project_id=$1),'ledger',(SELECT jsonb_agg(l ORDER BY idempotency_key) FROM api_idempotency l WHERE endpoint=$2),'assignment',(SELECT to_jsonb(a) FROM aor_assignments a WHERE id=$3)) AS state`,[project,`PATCH:/api/projects/${project}/survey/staffing:unlink-superintendent-area`,assignment])).rows[0].state;
    eq(after,before);
   }finally{await holder.query('ROLLBACK');holder.release();}
  }
  console.log(`PASS ${checks} current actor and post-wait bearer/session/authority checks before historical replay`);
 }finally{await pg.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
