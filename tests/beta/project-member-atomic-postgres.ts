import {inUnitRequestScope} from '../setup/unit-request-scope';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {NextRequest} from 'next/server';
import {runLifecycleSchemaAcceptance} from './account-offboarding-postgres';
import {getPool} from '../../src/lib/db';
import {signToken} from '../../src/lib/auth';
import {POST as POSTHandler} from '../../src/app/api/projects/[projectId]/members/route';
import type {UUID} from '../../src/shared/types';
const POST=inUnitRequestScope(POSTHandler);

runLifecycleSchemaAcceptance(async(db,f)=>{
 await db.query(await readFile('db/migrations/032_administrative_events.sql','utf8'));
 await db.query("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'TENANT_ADMIN')",[f.tenant,f.actor]);
 const company=(await db.query('SELECT company_id FROM users WHERE id=$1',[f.actor])).rows[0].company_id;
 const first=randomUUID(),second=randomUUID();
 for(const user of [first,second])await db.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,'Synthetic member','fixture')",[user,f.tenant,company,user+'@example.test']);
 const oldSecret=process.env.JWT_SECRET;process.env.JWT_SECRET='member-atomic-synthetic-secret';
 const pg=getPool(),oldQuery=pg.query,oldConnect=pg.connect;
 let auditFailure=false,checks=0;
 // Preserve the fixture's outer rollback while exercising actual route SQL and
 // the same default transaction ordering through nested savepoint boundaries.
 pg.query=(async(sql:string,params?:unknown[])=>db.query(sql,params)) as typeof pg.query;
 pg.connect=(async()=>({
  query:async(sql:string,params?:unknown[])=>{
   if(sql==='BEGIN')return db.query('SAVEPOINT member_route');
   if(sql==='COMMIT')return db.query('RELEASE SAVEPOINT member_route');
   if(sql==='ROLLBACK')return db.query('ROLLBACK TO SAVEPOINT member_route');
   if(auditFailure&&sql.includes('INSERT INTO administrative_events'))throw new Error('Injected administrative audit failure');
   return db.query(sql,params);
  },release:()=>{},
 })) as typeof pg.connect;
 const token=signToken(f.actor as UUID,f.tenant as UUID,1);
 const request=(userId:string,role='REQUESTER')=>new NextRequest('http://localhost/api/projects/'+f.project+'/members',{
  method:'POST',headers:{cookie:'swr_session='+token,'content-type':'application/json'},body:JSON.stringify({userId,role}),
 });
 try{
  assert.equal((await POST(request(first),{params:Promise.resolve({projectId:f.project})})).status,201);checks++;
  assert.equal((await db.query('SELECT session_version FROM users WHERE id=$1',[first])).rows[0].session_version,2);checks++;
  assert.equal((await db.query("SELECT count(*)::int AS n FROM administrative_events WHERE event_type='project.member_added'")).rows[0].n,1);checks++;
  assert.equal((await POST(request(first,'VIEWER'),{params:Promise.resolve({projectId:f.project})})).status,409);checks++;
  assert.equal((await db.query('SELECT role FROM project_memberships WHERE project_id=$1 AND user_id=$2',[f.project,first])).rows[0].role,'REQUESTER');checks++;
  assert.equal((await db.query('SELECT session_version FROM users WHERE id=$1',[first])).rows[0].session_version,2);checks++;
  await db.query('UPDATE users SET deactivated_at=NOW(),deactivated_by=$2 WHERE id=$1',[second,f.actor]);
  assert.equal((await POST(request(second),{params:Promise.resolve({projectId:f.project})})).status,409,'disabled subjects cannot gain new project membership');checks++;
  assert.equal((await db.query('SELECT count(*)::int AS n FROM project_memberships WHERE project_id=$1 AND user_id=$2',[f.project,second])).rows[0].n,0);checks++;
  assert.equal((await db.query('SELECT session_version FROM users WHERE id=$1',[second])).rows[0].session_version,1);checks++;
  await db.query('UPDATE users SET deactivated_at=NULL,deactivated_by=NULL WHERE id=$1',[second]);
  auditFailure=true;
  assert.equal((await POST(request(second),{params:Promise.resolve({projectId:f.project})})).status,500);checks++;
  assert.equal((await db.query('SELECT count(*)::int AS n FROM project_memberships WHERE project_id=$1 AND user_id=$2',[f.project,second])).rows[0].n,0);checks++;
  assert.equal((await db.query('SELECT session_version FROM users WHERE id=$1',[second])).rows[0].session_version,1);checks++;
  assert.equal((await db.query('SELECT count(*)::int AS n FROM administrative_events')).rows[0].n,1);checks++;
  console.log('Project member atomic PostgreSQL route checks passed: '+checks);
 }finally{pg.query=oldQuery;pg.connect=oldConnect;if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;}
}).catch(error=>{console.error(error);process.exitCode=1;});
