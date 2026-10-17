
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {NextRequest} from 'next/server';
import {runLifecycleSchemaAcceptance} from './account-offboarding-postgres';
import {UserRepository} from '../../src/modules/identity/infrastructure/user.repository';
import {requestPasswordReset,resetPassword,hashPasswordResetToken} from '../../src/modules/identity/application/password-reset';
import {handlePostRegister} from '../../src/app/api/auth/register/handler';
import {createUser} from '../../src/modules/identity/application/create-user';
import {handlePostLogout} from '../../src/app/api/auth/logout/handler';
import {signToken,requireActiveAuth} from '../../src/lib/auth';
import {beginAuthenticatedMutation,type withTransaction} from '../../src/lib/with-transaction';
import {ValidationError,UnauthorizedError} from '../../src/shared/errors';
import type {DbClient,UUID} from '../../src/shared/types';

runLifecycleSchemaAcceptance(async(db,f)=>{
 await db.query(await readFile('db/migrations/032_administrative_events.sql','utf8'));
 const repo=new UserRepository(),user=randomUUID() as UUID,reset=randomUUID() as UUID;
 const company=(await db.query('SELECT company_id FROM users WHERE id=$1',[f.actor])).rows[0].company_id;
 await db.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,'Reset fixture','original-hash')",[user,f.tenant,company,user+'@example.test']);
 await db.query("INSERT INTO project_memberships(project_id,user_id,role,access_disabled_at,access_disabled_by) VALUES($1,$2,'REQUESTER',now(),$3)",[f.project,user,f.actor]);
 const token='synthetic-reset-'+reset,now=new Date();
 await repo.savePasswordResetToken(db,{id:reset,tenantId:f.tenant as UUID,userId:user,tokenHash:hashPasswordResetToken(token),expiresAt:new Date(now.getTime()+3600000),usedAt:null,createdAt:now});
 let checks=0,auditFailure=false;
 const client:DbClient={query:async<T extends object>(sql:string,params?:unknown[])=>{
   if(auditFailure&&sql.includes('INSERT INTO administrative_events'))throw Error('Injected identity audit failure');
   return db.query<T>(sql,params);
 }};
 const tx:typeof withTransaction=async(fn,mutation)=>{
   await db.query('SAVEPOINT identity_route');
   try{if(mutation)await beginAuthenticatedMutation(client,mutation);const result=await fn(client);await db.query('RELEASE SAVEPOINT identity_route');return result;}
   catch(error){await db.query('ROLLBACK TO SAVEPOINT identity_route');throw error;}
 };
 const state=async()=> (await db.query("SELECT jsonb_build_object('user',(SELECT jsonb_build_object('hash',password_hash,'sv',session_version,'disabled',deactivated_at) FROM users WHERE id=$1),'token',(SELECT to_jsonb(p) FROM password_reset_tokens p WHERE id=$2),'membership',(SELECT to_jsonb(m) FROM project_memberships m WHERE project_id=$3 AND user_id=$1)) AS state",[user,reset,f.project])).rows[0].state;
 const before=await state();
 auditFailure=true;
 await assert.rejects(tx(c=>resetPassword(repo,c,{token,newPassword:'synthetic-new-password'})),/Injected identity audit failure/);checks++;
 assert.deepEqual(await state(),before);checks++;
 auditFailure=false;
 await db.query('UPDATE users SET deactivated_at=now(),deactivated_by=$2 WHERE id=$1',[user,f.actor]);
 const disabled=await state();
 await assert.rejects(tx(c=>resetPassword(repo,c,{token,newPassword:'synthetic-new-password'})),ValidationError);checks++;
 assert.deepEqual(await state(),disabled);checks++;
 assert.deepEqual(await tx(c=>requestPasswordReset(repo,c,{tenantId:f.tenant as UUID,email:user+'@example.test'})),{resetToken:null});checks++;
 // Test-only restoration of a synthetic fixture; no public reactivation contract.
 await db.query('UPDATE users SET deactivated_at=NULL,deactivated_by=NULL WHERE id=$1',[user]);
 await tx(c=>resetPassword(repo,c,{token,newPassword:'synthetic-new-password'}));
 assert.equal((await state()).user.sv,2);checks++;
 assert.deepEqual((await state()).membership,before.membership);checks++;
 assert.ok((await state()).token.used_at);checks++;
 await assert.rejects(tx(c=>resetPassword(repo,c,{token,newPassword:'another-synthetic-password'})),ValidationError);checks++;
 assert.equal((await state()).user.sv,2);checks++;
 assert.equal((await db.query("SELECT count(*)::int AS n FROM administrative_events WHERE event_type='password.reset_completed'")).rows[0].n,1);checks++;
 const oldSecret=process.env.JWT_SECRET;process.env.JWT_SECRET='identity-atomic-synthetic-secret';
 try{
  const bearer=signToken(user,f.tenant as UUID,2);
  const req=()=>new NextRequest('http://localhost/api/auth/logout',{method:'POST',headers:{cookie:'swr_session='+bearer}});
  auditFailure=true;
  assert.equal((await handlePostLogout(req(),tx)).status,500);checks++;
  assert.equal((await db.query('SELECT count(*)::int AS n FROM revoked_auth_sessions WHERE user_id=$1',[user])).rows[0].n,0);checks++;
  await requireActiveAuth(req(),client);checks++;
  auditFailure=false;
  assert.equal((await handlePostLogout(req(),tx)).status,200);checks++;
  await assert.rejects(requireActiveAuth(req(),client),UnauthorizedError);checks++;
  assert.equal((await db.query("SELECT count(*)::int AS n FROM administrative_events WHERE event_type='session.logged_out'")).rows[0].n,1);checks++;
  assert.equal((await handlePostLogout(req(),tx)).status,200);checks++;
  assert.equal((await db.query("SELECT count(*)::int AS n FROM administrative_events WHERE event_type='session.logged_out'")).rows[0].n,1);checks++;
 }finally{if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;}

 const invite=randomUUID(),invitedEmail=invite+'@example.test';
 await db.query("INSERT INTO invites(tenant_id,project_id,company_id,email,role,token,invited_by,expires_at) VALUES($1,$2,$3,$4,'REQUESTER',$5,$6,now()+interval '1 hour')",[f.tenant,f.project,company,invitedEmail,invite,f.actor]);
 const registration=()=>new NextRequest('http://localhost/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
   tenantId:f.tenant,email:invitedEmail,password:'synthetic-new-account-password',name:'Invited fixture',inviteToken:invite,
 })});
 const registrationDeps={db:client,createRepo:()=>repo,createUser,withTransaction:tx};
 auditFailure=true;
 assert.equal((await handlePostRegister(registration(),registrationDeps)).status,500);checks++;
 assert.equal((await db.query('SELECT count(*)::int AS n FROM users WHERE email=$1',[invitedEmail])).rows[0].n,0);checks++;
 assert.equal((await db.query('SELECT accepted_at FROM invites WHERE token=$1',[invite])).rows[0].accepted_at,null);checks++;
 auditFailure=false;
 const registered=await handlePostRegister(registration(),registrationDeps);
 assert.equal(registered.status,201);checks++;
 const registeredId=(await registered.json()).user.id;
 assert.equal((await db.query('SELECT count(*)::int AS n FROM project_memberships WHERE project_id=$1 AND user_id=$2',[f.project,registeredId])).rows[0].n,1);checks++;
 assert.ok((await db.query('SELECT accepted_at FROM invites WHERE token=$1',[invite])).rows[0].accepted_at);checks++;
 assert.equal((await handlePostRegister(registration(),registrationDeps)).status,400);checks++;
 await db.query('UPDATE users SET deactivated_at=now(),deactivated_by=$2 WHERE id=$1',[registeredId,f.actor]);
 const disabledInvite=randomUUID();
 await db.query("INSERT INTO invites(tenant_id,project_id,company_id,email,role,token,invited_by,expires_at) VALUES($1,$2,$3,$4,'REQUESTER',$5,$6,now()+interval '1 hour')",[f.tenant,f.project,company,invitedEmail,disabledInvite,f.actor]);
 const disabledRegistration=new NextRequest('http://localhost/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
   tenantId:f.tenant,email:invitedEmail,password:'synthetic-new-account-password',name:'Invited fixture',inviteToken:disabledInvite,
 })});
 assert.equal((await handlePostRegister(disabledRegistration,registrationDeps)).status,409);checks++;
 assert.ok((await db.query('SELECT deactivated_at FROM users WHERE id=$1',[registeredId])).rows[0].deactivated_at);checks++;
 assert.equal((await db.query('SELECT accepted_at FROM invites WHERE token=$1',[disabledInvite])).rows[0].accepted_at,null);checks++;
 const requested=await tx(c=>requestPasswordReset(repo,c,{tenantId:f.tenant as UUID,email:user+'@example.test'}));
 assert.ok(requested.resetToken);checks++;
 const requestAudit=(await db.query("SELECT actor_id,subject_user_id,authority_evidence FROM administrative_events WHERE event_type='password.reset_requested'")).rows[0];
 assert.equal(requestAudit.actor_id,null,'Anonymous reset request must not invent the account owner as its actor');checks++;
 assert.equal(requestAudit.subject_user_id,user);checks++;
 console.log('Identity reset/logout/registration atomic PostgreSQL checks passed: '+checks);
}).catch(error=>{console.error(error);process.exitCode=1;});
