import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runLifecycleSchemaAcceptance} from './account-offboarding-postgres';
runLifecycleSchemaAcceptance(async(db,f)=>{
 await db.query(await readFile('db/migrations/032_administrative_events.sql','utf8'));
 let checks=0;
 const event=(await db.query("INSERT INTO administrative_events(tenant_id,project_id,actor_id,subject_user_id,event_type,authority_evidence,changes) VALUES($1,$2,$3,$4,'project.member_added','{\"branch\":\"CENTRAL_IT\"}','{\"role\":\"REQUESTER\"}') RETURNING id",[f.tenant,f.project,f.actor,f.subject])).rows[0].id;
 const reject=async(sql:string,args:unknown[],code:string)=>{
  await db.query('SAVEPOINT expected_failure');
  let caught:unknown;try{await db.query(sql,args);}catch(error){caught=error;}
  await db.query('ROLLBACK TO SAVEPOINT expected_failure');
  assert.equal((caught as {code?:string})?.code,code);checks++;
 };
 await reject('UPDATE administrative_events SET changes=$2 WHERE id=$1',[event,'{}'],'55000');
 await reject('DELETE FROM administrative_events WHERE id=$1',[event],'55000');
 await reject('TRUNCATE administrative_events',[],'55000');
 await reject("INSERT INTO administrative_events(tenant_id,project_id,actor_id,event_type,authority_evidence,changes) VALUES($1,$2,$3,'project.member_added','{}','{}')",[f.tenant,f.foreignProject,f.actor],'23503');
 await reject("INSERT INTO administrative_events(tenant_id,event_type,authority_evidence,changes) VALUES($1,'project.member_added','{}','{}')",[f.tenant],'23514');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM administrative_events')).rows[0].n,1);checks++;
 console.log('Administrative event PostgreSQL checks passed: '+checks);
}).catch(error=>{console.error(error);process.exitCode=1;});