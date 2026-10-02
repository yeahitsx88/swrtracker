import {assertCentralITRemovalSafe} from '../../src/modules/tenancy/application/tenant-continuity';
import assert from 'node:assert/strict';
import {Pool,type PoolClient} from 'pg';
import {randomUUID} from 'node:crypto';
import {NextRequest} from 'next/server';
import {acquireTenantLifecycleLock} from '../../src/lib/tenant-lifecycle-lock';
import {beginAuthenticatedMutation} from '../../src/lib/with-transaction';
import {assertSurveyManagerRemovalSafe} from '../../src/modules/tenancy/application/survey-manager-continuity';
import {signToken,sessionTokenHash} from '../../src/lib/auth';
import type {UUID} from '../../src/shared/types';

async function main(){
 const url=new URL(process.env.DATABASE_URL??'');
 assert.equal(process.env.SWR_TEAM_POSTGRES,'1');
 assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15489');assert.equal(url.pathname,'/swr_team_isolated');
 const pg=new Pool({connectionString:url.href,max:4});
 const schema='offboarding_race_'+randomUUID().replaceAll('-','');
 assert.match(schema,/^offboarding_race_[a-f0-9]{32}$/);
 const tenant=randomUUID() as UUID,user=randomUUID() as UUID,otherAdmin=randomUUID() as UUID,company=randomUUID() as UUID;
 const oldSecret=process.env.JWT_SECRET;process.env.JWT_SECRET='disposable-race-auth-secret';
 let checks=0,created=false;
 const a=await pg.connect(),b=await pg.connect();
 const aPid=(await a.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
 const bPid=(await b.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
 const begin=async(db:PoolClient)=>{
  await db.query('BEGIN');
  await db.query('SET LOCAL statement_timeout=6000');
  await db.query('SET LOCAL search_path TO "'+schema+'"');
 };
 const observeWait=async(waiter:number,holder:number)=>{
  const deadline=Date.now()+3000;
  while(Date.now()<deadline){
   if((await pg.query('SELECT $2::int=ANY(pg_blocking_pids($1::int)) AS waiting',[waiter,holder])).rows[0].waiting){checks++;return;}
   await new Promise(r=>setTimeout(r,10));
  }throw new Error('Actual PostgreSQL tenant-lock wait was not observed');
 };
 try{
  await pg.query('CREATE SCHEMA "'+schema+'"');created=true;
  await pg.query('CREATE TABLE "'+schema+'".tenants(id uuid PRIMARY KEY)');
  await pg.query('CREATE TABLE "'+schema+'".users(id uuid PRIMARY KEY,tenant_id uuid NOT NULL,session_version int NOT NULL,deactivated_at timestamptz,company_id uuid NOT NULL)');
  await pg.query('CREATE TABLE "'+schema+'".revoked_auth_sessions(token_hash text PRIMARY KEY,expires_at timestamptz)');
  await pg.query('CREATE TABLE "'+schema+'".writer_markers(id text PRIMARY KEY)');
  await pg.query('INSERT INTO "'+schema+'".tenants VALUES($1)',[tenant]);
  await pg.query('CREATE TABLE "'+schema+'".companies(id uuid PRIMARY KEY,tenant_id uuid NOT NULL,type text NOT NULL)');
  await pg.query('CREATE TABLE "'+schema+'".tenant_memberships(tenant_id uuid,user_id uuid,role text)');
  await pg.query('INSERT INTO "'+schema+'".companies VALUES($1,$2,$3)',[company,tenant,'GC']);
  await pg.query('INSERT INTO "'+schema+'".users VALUES($1,$2,1,NULL,$3),($4,$2,1,NULL,$3)',[user,tenant,company,otherAdmin]);
  const token=signToken(user,tenant,1);
  const req=new NextRequest('http://localhost/api/projects',{headers:{cookie:'swr_session='+token}});
  const auth={userId:user,tenantId:tenant,sessionVersion:1};
  for(const mode of ['SHARED','EXCLUSIVE'] as const)for(const revocation of ['version','disabled','logout'] as const){
   await pg.query('UPDATE "'+schema+'".users SET session_version=1,deactivated_at=NULL');
   await pg.query('DELETE FROM "'+schema+'".revoked_auth_sessions');
   await begin(a);await acquireTenantLifecycleLock(a,tenant,'EXCLUSIVE');
   await begin(b);
   let authorized=false,wrote=false;
   const pending=beginAuthenticatedMutation(b,{req,auth,mode,authorize:async()=>{authorized=true;}})
    .then(async()=>{await b.query('INSERT INTO writer_markers VALUES($1)',[revocation+mode]);wrote=true;return null;},error=>error);
   await observeWait(bPid,aPid);
   if(revocation==='version')await a.query('UPDATE users SET session_version=2');
   if(revocation==='disabled')await a.query('UPDATE users SET deactivated_at=NOW()');
   if(revocation==='logout')await a.query("INSERT INTO revoked_auth_sessions VALUES($1,NOW()+INTERVAL '8 hours')",[sessionTokenHash(token)]);
   await a.query('COMMIT');
   const error=await pending;
   assert.equal(error?.type,'UnauthorizedError',revocation+mode);checks++;
   assert.equal(authorized,false);assert.equal(wrote,false);checks++;
   await b.query('ROLLBACK');
  }
  await pg.query('UPDATE "'+schema+'".users SET session_version=1,deactivated_at=NULL');
  await pg.query('DELETE FROM "'+schema+'".revoked_auth_sessions');
  await begin(a);
  await beginAuthenticatedMutation(a,{req,auth,mode:'SHARED',authorize:async()=>{}});
  await begin(b);
  const disabling=acquireTenantLifecycleLock(b,tenant,'EXCLUSIVE').then(()=>b.query('UPDATE users SET deactivated_at=NOW()')).then(()=>b.query('COMMIT')).then(()=>null,error=>error);
  await observeWait(bPid,aPid);
  await a.query("INSERT INTO writer_markers VALUES('completed-before-disable')");
  await a.query('COMMIT');
  assert.equal(await disabling,null);checks++;
  assert.equal((await pg.query('SELECT count(*)::int AS n FROM "'+schema+'".writer_markers')).rows[0].n,1);checks++;
  for(const winner of ['demotion','disable'] as const){
   await pg.query('UPDATE "'+schema+'".users SET session_version=1,deactivated_at=NULL');
   await pg.query('DELETE FROM "'+schema+'".tenant_memberships');
   await pg.query('INSERT INTO "'+schema+'".tenant_memberships VALUES($1,$2,$4),($1,$3,$4)',[tenant,user,otherAdmin,'TENANT_ADMIN']);
   await begin(a);await assertCentralITRemovalSafe(a,tenant,user);
   await begin(b);
   const losing=assertCentralITRemovalSafe(b,tenant,otherAdmin).then(async()=>{
    if(winner==='demotion')await b.query('UPDATE users SET deactivated_at=NOW() WHERE id=$1',[otherAdmin]);
    else await b.query("UPDATE tenant_memberships SET role='BILLING_VIEWER' WHERE user_id=$1",[otherAdmin]);
    return null;
   },error=>error);
   await observeWait(bPid,aPid);
   if(winner==='demotion')await a.query("UPDATE tenant_memberships SET role='BILLING_VIEWER' WHERE user_id=$1",[user]);
   else await a.query('UPDATE users SET deactivated_at=NOW() WHERE id=$1',[user]);
   await a.query('COMMIT');
   assert.equal((await losing)?.code,'LAST_TENANT_ADMIN');checks++;
   await b.query('ROLLBACK');
   const eligible=(await pg.query('SELECT count(*)::int AS n FROM "'+schema+'".tenant_memberships tm JOIN "'+schema+'".users u ON u.id=tm.user_id WHERE tm.role=$1 AND u.deactivated_at IS NULL',['TENANT_ADMIN'])).rows[0].n;
   assert.equal(eligible,1);checks++;
  }
  const project=randomUUID() as UUID;
  await pg.query('CREATE TABLE "'+schema+'".projects(id uuid PRIMARY KEY,tenant_id uuid,status text)');
  await pg.query('CREATE TABLE "'+schema+'".project_memberships(project_id uuid,user_id uuid,role text,access_disabled_at timestamptz)');
  await pg.query('INSERT INTO "'+schema+'".projects VALUES($1,$2,$3)',[project,tenant,'ACTIVE']);
  await pg.query('INSERT INTO "'+schema+'".project_memberships VALUES($1,$2,$4,NULL),($1,$3,$4,NULL)',[project,user,otherAdmin,'SURVEY_MANAGER']);
  for(const winner of ['LOCAL','GLOBAL'] as const){
   await pg.query('UPDATE "'+schema+'".users SET deactivated_at=NULL');
   await pg.query('UPDATE "'+schema+'".project_memberships SET access_disabled_at=NULL');
   await begin(a);await assertSurveyManagerRemovalSafe(a,tenant,user,project);
   await begin(b);
   const losing=assertSurveyManagerRemovalSafe(b,tenant,otherAdmin,project).then(()=>null,error=>error);
   await observeWait(bPid,aPid);
   if(winner==='LOCAL')await a.query('UPDATE project_memberships SET access_disabled_at=NOW() WHERE user_id=$1',[user]);
   else await a.query('UPDATE users SET deactivated_at=NOW() WHERE id=$1',[user]);
   await a.query('COMMIT');
   assert.equal((await losing)?.code,'LAST_SURVEY_MANAGER');checks++;
   await b.query('ROLLBACK');
  }
  // Ineligible company witnesses do not count; archived projects require no replacement.
  await pg.query('UPDATE "'+schema+'".users SET deactivated_at=NULL');
  const ineligible=randomUUID();await pg.query('INSERT INTO "'+schema+'".companies VALUES($1,$2,$3)',[ineligible,tenant,'SUBCONTRACTOR']);
  await pg.query('UPDATE "'+schema+'".users SET company_id=$2 WHERE id=$1',[otherAdmin,ineligible]);
  await begin(a);await assert.rejects(assertSurveyManagerRemovalSafe(a,tenant,user,project),{code:'LAST_SURVEY_MANAGER'});await a.query('ROLLBACK');checks++;
  await pg.query('UPDATE "'+schema+'".users SET company_id=$2 WHERE id=$1',[otherAdmin,company]);
  await pg.query('UPDATE "'+schema+'".companies SET type=$1',['GC']);
  await pg.query('UPDATE "'+schema+'".projects SET status=$1',['ARCHIVED']);
  await begin(a);await assertSurveyManagerRemovalSafe(a,tenant,user,project);await a.query('ROLLBACK');checks++;
  console.log('Tenant lifecycle PostgreSQL coordination checks passed: '+checks);
 }finally{
  await a.query('ROLLBACK');await b.query('ROLLBACK');a.release();b.release();
  if(created){assert.match(schema,/^offboarding_race_[a-f0-9]{32}$/);await pg.query('DROP SCHEMA "'+schema+'" CASCADE');}
  await pg.end();
  if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
