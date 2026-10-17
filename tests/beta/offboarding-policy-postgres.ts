import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {NextRequest} from 'next/server';
import {runLifecycleSchemaAcceptance} from './account-offboarding-postgres';
import {getPool} from '../../src/lib/db';
import {signToken} from '../../src/lib/auth';
import {handleOffboarding} from '../../src/app/api/accounts/[userId]/offboarding/handler';
import {AccountOffboardingRepository} from '../../src/modules/identity/infrastructure/account-offboarding.repository';
import type {UUID} from '../../src/shared/types';
import type {OffboardingScope} from '../../src/lib/contracts/account-offboarding';
runLifecycleSchemaAcceptance(async(db,f)=>{
 await db.query(await readFile('db/migrations/032_administrative_events.sql','utf8'));
 await db.query('UPDATE users SET deactivated_at=NULL,deactivated_by=NULL,session_version=1 WHERE tenant_id=$1',[f.tenant]);
 await db.query('UPDATE project_memberships SET access_disabled_at=NULL,access_disabled_by=NULL WHERE project_id=$1',[f.project]);
 await db.query("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'TENANT_ADMIN')",[f.tenant,f.actor]);
 const app=getPool(),oldQuery=app.query,oldConnect=app.connect,oldSecret=process.env.JWT_SECRET;process.env.JWT_SECRET='offboarding-policy-synthetic-secret';let checks=0;
 app.query=db.query.bind(db) as typeof app.query;app.connect=(async()=>({query:async(sql:string,params?:unknown[])=>sql==='BEGIN'?db.query('SAVEPOINT policy_request'):sql==='COMMIT'?db.query('RELEASE SAVEPOINT policy_request'):sql==='ROLLBACK'?db.query('ROLLBACK TO SAVEPOINT policy_request'):db.query(sql,params),release:()=>{}})) as typeof app.connect;
 const global:OffboardingScope={kind:'TENANT_ACCOUNT'},local:OffboardingScope={kind:'PROJECT_ACCESS',projectId:f.project as UUID};
 const call=(scope:OffboardingScope,subject=f.subject,body?:unknown,key=randomUUID(),actor=f.actor,token?:string)=>handleOffboarding(new NextRequest('http://localhost/api/policy',{method:body?'POST':'GET',headers:{cookie:'swr_session='+(token??signToken(actor as UUID,f.tenant as UUID,1)),'content-type':'application/json','idempotency-key':key},body:body?JSON.stringify(body):undefined}),scope,subject);
 const expect=async(response:Response,status=200)=>{assert.equal(response.status,status,JSON.stringify(await response.clone().json()));checks++;return response.json();};
 const preview=async(scope:OffboardingScope,user=f.subject)=>(await expect(await call(scope,user))).preview;
 const command=(scope:OffboardingScope,p:{snapshot:string},user=f.subject)=>({scope,subjectUserId:user,reason:'Confirmed policy acceptance',snapshot:p.snapshot,confirmed:true});
 const company=(await db.query('SELECT company_id FROM users WHERE id=$1',[f.actor])).rows[0].company_id;
 const person=async(role?:string,project=f.project)=>{const user=randomUUID();await db.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,'Policy person','fixture')",[user,f.tenant,company,user+'@example.test']);if(role)await db.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)',[project,user,role]);return user;};
 try{
  await expect(await call(global,f.actor),403);await expect(await call(global,randomUUID()),404);
  const foreign=(await db.query('SELECT id FROM users WHERE tenant_id<>$1 LIMIT 1',[f.tenant])).rows[0].id;await expect(await call(global,foreign),404);await expect(await call(global,foreign,undefined,randomUUID(),f.subject),403);
  const lone=await preview(global);assert.equal(lone.blockers.some((b:{code:string})=>b.code==='LAST_SURVEY_MANAGER'),true);checks++;await expect(await call(global,f.subject,command(global,lone)),409);
  await db.query("UPDATE project_memberships SET role='REQUESTER' WHERE project_id=$1 AND user_id=$2",[f.project,f.subject]);
  const noProject=await person();const np=await preview(global,noProject);assert.deepEqual(np.blockers,[]);checks++;await expect(await call(global,noProject,command(global,np,noProject)));
  const gc=await preview(global);await db.query('UPDATE users SET session_version=session_version+1 WHERE id=$1',[f.subject]);await expect(await call(global,f.subject,command(global,gc)),409);await db.query('UPDATE users SET session_version=1 WHERE id=$1',[f.subject]);
  const active=await preview(local),original=command(local,active),key=randomUUID();await expect(await call(local,f.subject,{...original,reactivate:true}),400);
  await expect(await call(local,f.subject,original,key));await expect(await call(local,f.subject,{...original,reason:'Changed reason forbidden'},key),409);await expect(await call(local,f.subject,original));
  const archived=await person('REQUESTER');await db.query("UPDATE projects SET status='ARCHIVED' WHERE id=$1",[f.project]);const ap=await preview(local,archived);await expect(await call(local,archived,command(local,ap,archived)));assert.equal((await db.query('SELECT status FROM projects WHERE id=$1',[f.project])).rows[0].status,'ARCHIVED');checks++;
  await db.query("UPDATE projects SET status='ACTIVE' WHERE id=$1",[f.project]);
  const other=randomUUID();await db.query("INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,'Other active','ACTIVE','FULL')",[other,f.tenant]);
  const scoped=await person('REQUESTER');await db.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'SURVEY_MANAGER')",[other,scoped]);
  const sp=await preview(local,scoped);assert.deepEqual(sp.blockers,[]);checks++;const scopedRemoval=await expect(await call(local,scoped,command(local,sp,scoped)));const wider=await preview(global,scoped);assert.equal(wider.blockers.some((b:{code:string;projectId:string})=>b.code==='LAST_SURVEY_MANAGER'&&b.projectId===other),true);checks++;await expect(await call(global,scoped,command(global,wider,scoped)),409);assert.equal((await db.query('SELECT status FROM account_offboarding_reviews WHERE id=$1',[scopedRemoval.result.reviewId])).rows[0].status,'PENDING');checks++;
  // Local disable preserves independent Central IT authority and makes the limit explicit.
  const central=await person('REQUESTER');await db.query("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'TENANT_ADMIN')",[f.tenant,central]);const cp=await preview(local,central);assert.equal(cp.retainsCentralIT,true);checks++;await expect(await call(local,central,command(local,cp,central)));
  // Tenant continuity evidence exists even without a project identity.
  await db.query("DELETE FROM tenant_memberships WHERE user_id=$1",[central]);
  const state=await new AccountOffboardingRepository().readState(db,{tenantId:f.tenant as UUID,userId:f.actor as UUID,sessionVersion:1},global,f.actor as UUID);assert.equal(state!.blockers.some(b=>b.code==='LAST_TENANT_ADMIN'&&b.projectId===null),true);checks++;
  const sub=randomUUID();await db.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'Ineligible','SUBCONTRACTOR')",[sub,f.tenant]);const subActor=await person('REQUESTER');await db.query('UPDATE users SET company_id=$2 WHERE id=$1',[subActor,sub]);await db.query("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'TENANT_ADMIN')",[f.tenant,subActor]);await expect(await call(global,scoped,undefined,randomUUID(),subActor),403);
  await expect(await call(global,scoped,undefined,randomUUID(),f.actor,'forged-token'),401);
  // A02: Central IT does not need a fabricated operational membership.
  const centralOnly=await person();await db.query("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'TENANT_ADMIN')",[f.tenant,centralOnly]);
  const noProjects=await person();const cpOnly=(await expect(await call(global,noProjects,undefined,randomUUID(),centralOnly))).preview;
  await expect(await call(global,noProjects,command(global,cpOnly,noProjects),randomUUID(),centralOnly));
  assert.equal((await db.query('SELECT count(*)::int AS n FROM project_memberships WHERE user_id=$1',[centralOnly])).rows[0].n,0);checks++;
  // A11/A17: bounded deterministic pages stay bound to the original full-set witness.
  const many=await person(),projectIds:string[]=[];
  for(let i=0;i<30;i++){const project=randomUUID();projectIds.push(project);await db.query("INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,'Blocker page','ACTIVE','FULL')",[project,f.tenant]);await db.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'SURVEY_MANAGER')",[project,many]);}
  const first=await preview(global,many);assert.equal(first.blockerTotal,30);assert.equal(first.blockers.length,25);checks+=2;
  const page=async(snapshot:string)=>handleOffboarding(new NextRequest(`http://localhost/api/policy?offset=25&snapshot=${snapshot}`,{headers:{cookie:'swr_session='+signToken(f.actor as UUID,f.tenant as UUID,1)}}),global,many);
  const second=(await expect(await page(first.snapshot))).preview;assert.equal(second.blockers.length,5);assert.equal(second.snapshot,first.snapshot);checks+=2;
  const witness=await new AccountOffboardingRepository().readState(db,{tenantId:f.tenant as UUID,userId:f.actor as UUID,sessionVersion:1},global,many as UUID);
  assert.ok(JSON.stringify(witness!.evidence).length<5000);checks++;
  await db.query("UPDATE projects SET status='ARCHIVED' WHERE id=$1",[projectIds[0]]);await expect(await page(first.snapshot),409);
  console.log('Offboarding policy PostgreSQL checks passed: '+checks);
 }finally{app.query=oldQuery;app.connect=oldConnect;if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;}
}).catch(error=>{console.error(error);process.exitCode=1;});
