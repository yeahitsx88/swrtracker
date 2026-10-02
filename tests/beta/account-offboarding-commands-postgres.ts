import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { NextRequest } from 'next/server';
import { runLifecycleSchemaAcceptance } from './account-offboarding-postgres';
import { getPool } from '../../src/lib/db';
import { signToken } from '../../src/lib/auth';
import { handleOffboarding } from '../../src/app/api/accounts/[userId]/offboarding/handler';
import { GET as readReview,POST as resolveReview } from '../../src/app/api/accounts/offboarding-reviews/[reviewId]/route';
import { dispatchAdministrativeNotifications } from '../../src/modules/identity/infrastructure/administrative-notification-outbox';
import type { DbClient } from '../../src/shared/types';
import type { OffboardingScope } from '../../src/lib/contracts/account-offboarding';
import type { UUID } from '../../src/shared/types';

runLifecycleSchemaAcceptance(async(db,f)=>{
  await db.query(await readFile('db/migrations/032_administrative_events.sql','utf8'));
  await db.query("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'TENANT_ADMIN')",[f.tenant,f.actor]);
  await db.query("UPDATE project_memberships SET role='SURVEY_MANAGER' WHERE project_id=$1 AND user_id=$2",[f.project,f.actor]);
  await db.query('UPDATE users SET deactivated_at=NULL,deactivated_by=NULL,session_version=1 WHERE tenant_id=$1',[f.tenant]);
  await db.query('UPDATE project_memberships SET access_disabled_at=NULL,access_disabled_by=NULL WHERE project_id=$1',[f.project]);
  const app=getPool(),oldQuery=app.query,oldConnect=app.connect,oldSecret=process.env.JWT_SECRET;
  process.env.JWT_SECRET='offboarding-synthetic-command-secret';
  let failAt='',checks=0;
  app.query=db.query.bind(db) as typeof app.query;
  app.connect=(async()=>({query:async(sql:string,params?:unknown[])=>{
    if(sql==='BEGIN')return db.query('SAVEPOINT offboarding_route');
    if(sql==='COMMIT'&&failAt==='COMMIT')throw Error('Injected commit failure before durable commit');
    if(sql==='COMMIT')return db.query('RELEASE SAVEPOINT offboarding_route');
    if(sql==='ROLLBACK')return db.query('ROLLBACK TO SAVEPOINT offboarding_route');
    if(failAt && sql.includes(failAt))throw Error('Injected atomic write failure');
    return db.query(sql,params);
  },release:()=>{}})) as typeof app.connect;
  const local:OffboardingScope={kind:'PROJECT_ACCESS',projectId:f.project as UUID},global:OffboardingScope={kind:'TENANT_ACCOUNT'};
  const cookie=()=> 'swr_session='+signToken(f.actor as UUID,f.tenant as UUID,1);
  const call=(scope:OffboardingScope,subject=f.subject,body?:unknown,key=randomUUID())=>handleOffboarding(new NextRequest('http://localhost/api/offboarding',{
    method:body?'POST':'GET',headers:{cookie:cookie(),'content-type':'application/json','idempotency-key':key},body:body?JSON.stringify(body):undefined}),scope,subject);
  const preview=async(scope:OffboardingScope,subject=f.subject)=>{const response=await call(scope,subject);assert.equal(response.status,200,JSON.stringify(await response.clone().json()));checks++;return (await response.json()).preview;};
  const command=(scope:OffboardingScope,p: {snapshot:string},subject=f.subject)=>({scope,subjectUserId:subject,reason:'Confirmed synthetic departure',snapshot:p.snapshot,confirmed:true});
  const count=async(table:string)=>(await db.query('SELECT count(*)::int AS n FROM '+table)).rows[0].n;
  const preservation=async()=>{const value:Record<string,unknown>={};for(const table of ['tickets','ticket_events','attachments','companies','tenant_memberships','aor_assignments','crew_rosters','survey_reporting_links'])value[table]=(await db.query('SELECT to_jsonb(t) AS row FROM '+table+' t ORDER BY to_jsonb(t)::text')).rows;return value;};
  try{
    const before=await preservation(),reviewBefore=await count('account_offboarding_reviews'),outboxBefore=await count('administrative_notification_outbox');
    const p=await preview(local);assert.deepEqual(p.blockers,[]);checks++;
    const frozen=command(local,p),key=randomUUID();
    const response=await call(local,f.subject,frozen,key);assert.equal(response.status,200,JSON.stringify(await response.clone().json()));checks++;
    const result=(await response.json()).result;assert.equal(result.changed,true);assert.equal(result.centralReview,'QUEUED');checks+=2;
    assert.equal(await count('account_offboarding_reviews'),reviewBefore+1);assert.equal(await count('administrative_notification_outbox'),outboxBefore+1);checks+=2;
    assert.equal((await db.query('SELECT deactivated_at,session_version FROM users WHERE id=$1',[f.subject])).rows[0].deactivated_at,null);checks++;
    assert.equal((await db.query('SELECT session_version FROM users WHERE id=$1',[f.subject])).rows[0].session_version,2);checks++;
    assert.deepEqual(await preservation(),before);checks++;
    const replay=await call(local,f.subject,frozen,key);assert.equal(replay.status,200);const replayBody=await replay.json();assert.deepEqual(replayBody.result,result);assert.equal(replayBody.replayed,true);checks+=3;
    const eventEvidence=(await db.query('SELECT authority_evidence FROM account_lifecycle_events WHERE id=$1',[result.eventId])).rows[0].authority_evidence;
    assert.equal(eventEvidence.previewEvidence.authority.branch,'CENTRAL_IT');assert.ok(eventEvidence.previewEvidence.authority.tenantMembership.id);assert.ok(eventEvidence.previewEvidence.actor.companyId);checks+=3;
    const noOp=await call(local,f.subject,frozen);assert.equal(noOp.status,200);assert.equal((await noOp.json()).result.changed,false);checks+=2;
    assert.equal(await count('account_offboarding_reviews'),reviewBefore+1);checks++;
    assert.equal((await call(local,f.subject,{...frozen,reason:'Changed departure reason'},key)).status,409);checks++;
    const eventCount=await count('account_lifecycle_events');
    await db.query("UPDATE tenant_memberships SET role='BILLING_VIEWER' WHERE user_id=$1",[f.actor]);
    await db.query('UPDATE project_admin_grants SET revoked_at=NOW(),revoked_by=$2 WHERE user_id=$1',[f.actor,f.actor]);
    assert.equal((await call(local,f.subject,frozen,key)).status,403,'authority is rechecked before saved results');checks++;
    assert.equal(await count('account_lifecycle_events'),eventCount);checks++;
    await db.query("UPDATE tenant_memberships SET role='TENANT_ADMIN' WHERE user_id=$1",[f.actor]);
    const gp=await preview(global);assert.deepEqual(gp.blockers,[]);checks++;
    const globalResult=await call(global,f.subject,command(global,gp));assert.equal(globalResult.status,200);checks++;
    const tenantResult=(await globalResult.json()).result;assert.equal(tenantResult.changed,true);checks++;
    const reviewCtx={params:Promise.resolve({reviewId:result.reviewId})};
    const reviewResponse=await readReview(new NextRequest('http://localhost/api/review',{headers:{cookie:cookie()}}),reviewCtx);
    assert.equal(reviewResponse.status,200);checks++;
    const review=(await reviewResponse.json());
    const reviewBody={reviewId:result.reviewId,disposition:'TENANT_ACCOUNT_DISABLED',reason:'Separately confirmed tenant action',tenantEventId:result.eventId,snapshot:review.snapshot,confirmed:true};
    const reviewReq=(body:unknown,key=randomUUID())=>new NextRequest('http://localhost/api/review',{method:'POST',headers:{cookie:cookie(),'content-type':'application/json','idempotency-key':key},body:JSON.stringify(body)});
    assert.equal((await resolveReview(reviewReq(reviewBody),reviewCtx)).status,409,'local event cannot serve as tenant disable evidence');checks++;
    assert.equal((await db.query('SELECT status FROM account_offboarding_reviews WHERE id=$1',[result.reviewId])).rows[0].status,'PENDING');checks++;
    const correctBody={...reviewBody,tenantEventId:tenantResult.eventId},reviewKey=randomUUID();
    assert.equal((await resolveReview(reviewReq(correctBody,reviewKey),reviewCtx)).status,200);checks++;
    assert.equal((await resolveReview(reviewReq(correctBody,reviewKey),reviewCtx)).status,200,'resolution retry is idempotent');checks++;
    // Fake transport only. Leases/retries cannot repeat the account transition.
    const transaction=async<T>(fn:(held:DbClient)=>Promise<T>):Promise<T>=>{
      await db.query('SAVEPOINT administrative_delivery');
      try{const value=await fn({query:db.query.bind(db)});await db.query('RELEASE SAVEPOINT administrative_delivery');return value;}
      catch(error){await db.query('ROLLBACK TO SAVEPOINT administrative_delivery');throw error;}
    };
    const transitionCount=await count('account_lifecycle_events');
    await dispatchAdministrativeNotifications(db,transaction,{send:async()=>{throw Error('Synthetic provider failure');}});
    const failed=(await db.query('SELECT delivered_at,last_error,lease_token FROM administrative_notification_outbox WHERE review_id=$1',[result.reviewId])).rows[0];
    assert.equal(failed.delivered_at,null);assert.equal(failed.lease_token,null);assert.ok(failed.last_error);checks+=3;
    await db.query('UPDATE administrative_notification_outbox SET available_at=NOW() WHERE review_id=$1',[result.reviewId]);
    const sentIds:string[]=[];
    await dispatchAdministrativeNotifications(db,transaction,{send:async message=>{sentIds.push(String(message.metadata?.idempotencyKey));}});
    assert.equal(sentIds.length,1);checks++;
    await dispatchAdministrativeNotifications(db,transaction,{send:async()=>{throw Error('Delivered rows must not dispatch again');}});
    assert.equal(await count('account_lifecycle_events'),transitionCount);checks++;
    const historical=await call(local,f.subject,frozen,key);const historicalBody=await historical.json();assert.equal(historicalBody.replayed,true);assert.deepEqual(historicalBody.result,result);checks+=2;
    const afterGlobal=await call(local,f.subject,frozen);assert.equal(afterGlobal.status,200);assert.equal((await afterGlobal.json()).result.outcome,'ACCOUNT_ALREADY_DISABLED');checks+=2;
    assert.equal((await db.query('SELECT session_version FROM users WHERE id=$1',[f.subject])).rows[0].session_version,3);checks++;
    // New resolved-duty subjects exercise event/outbox/ledger failure rollback independently.
    const company=(await db.query('SELECT company_id FROM users WHERE id=$1',[f.actor])).rows[0].company_id;
    for(const failure of ['UPDATE project_memberships','UPDATE users','COMMIT','INSERT INTO account_lifecycle_events','INSERT INTO account_offboarding_reviews','INSERT INTO administrative_notification_outbox','UPDATE api_idempotency']){
      const user=randomUUID();await db.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,'Rollback subject','fixture')",[user,f.tenant,company,user+'@example.test']);
      await db.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'REQUESTER')",[f.project,user]);
      const pp=await preview(local,user),counts=[];
      for(const table of ['account_lifecycle_events','account_offboarding_reviews','administrative_notification_outbox','api_idempotency'])counts.push(await count(table));
      failAt=failure;
      assert.equal((await call(local,user,command(local,pp,user))).status,500,failure);checks++;
      failAt='';
      const afterCounts=[];for(const table of ['account_lifecycle_events','account_offboarding_reviews','administrative_notification_outbox','api_idempotency'])afterCounts.push(await count(table));
      assert.deepEqual(afterCounts,counts);checks++;
      assert.equal((await db.query('SELECT access_disabled_at FROM project_memberships WHERE user_id=$1',[user])).rows[0].access_disabled_at,null);checks++;
      assert.equal((await db.query('SELECT session_version FROM users WHERE id=$1',[user])).rows[0].session_version,1);checks++;
    }
    console.log('Offboarding command PostgreSQL checks passed: '+checks);
  }finally{app.query=oldQuery;app.connect=oldConnect;if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;}
}).catch(error=>{console.error(error);process.exitCode=1;});
