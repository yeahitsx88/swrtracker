// Standalone migration proof. Run only against a new disposable, empty database.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {Pool} from 'pg';
const id=(n:number)=>`97000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function main(){
 const url=new URL(process.env.DATABASE_URL??'');
 assert.equal(process.env.SWR_TEAM_POSTGRES,'1');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15489');assert.equal(url.pathname,'/swr_team_isolated');
 const pg=new Pool({connectionString:url.href,max:1});const db=await pg.connect();let checks=0;
 try{
  assert.equal((await db.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_name='tenants'")).rows[0].n,0,'Standalone proof requires an empty database');checks++;
  await db.query('CREATE TABLE _migrations(id SERIAL PRIMARY KEY,filename TEXT NOT NULL UNIQUE,applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  for(const file of readdirSync('db/migrations').filter(f=>f.endsWith('.sql')&&f<'030').sort()){
   await db.query('BEGIN');await db.query(readFileSync(`db/migrations/${file}`,'utf8'));await db.query('INSERT INTO _migrations(filename) VALUES($1)',[file]);await db.query('COMMIT');
  }
  await db.query('INSERT INTO tenants(id,name) VALUES($1,$2)',[id(1),'Reviewer migration proof']);
  await db.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'Synthetic','GC')",[id(2),id(1)]);
  await db.query("INSERT INTO projects(id,tenant_id,name,status) VALUES($1,$2,'Synthetic','ACTIVE')",[id(3),id(1)]);
  await db.query("INSERT INTO users(id,tenant_id,company_id,email,password_hash,name) VALUES($1,$2,$3,'migration@example.invalid','not-a-password','Synthetic')",[id(4),id(1),id(2)]);
  for(const [i,action] of ['RESPONSIBILITY_GRANTED','RESPONSIBILITY_REVOKED','COMPANY_AUTHORITY_GRANTED','COMPANY_AUTHORITY_REVOKED'].entries()){
   await db.query('INSERT INTO access_grant_events(id,tenant_id,project_id,company_id,subject_user_id,actor_id,action,grant_id) VALUES($1,$2,$3,$4,$5,$5,$6,$7)',[id(10+i),id(1),id(3),id(2),id(4),action,id(20+i)]);
  }
  const before=(await db.query('SELECT to_jsonb(e) AS evidence FROM access_grant_events e ORDER BY id')).rows;
  const file='030_survey_reviewer_resolution_evidence.sql';
  if(existsSync(`db/migrations/${file}`)){
   await db.query('BEGIN');await db.query(readFileSync(`db/migrations/${file}`,'utf8'));await db.query('INSERT INTO _migrations(filename) VALUES($1)',[file]);await db.query('COMMIT');
  }
  await db.query('BEGIN');
  assert.equal((await db.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name='access_grant_events' AND column_name='resolution_evidence'")).rows[0].n,1,'030 must add resolution_evidence');checks++;
  assert.deepEqual((await db.query("SELECT to_jsonb(e)-'resolution_evidence' AS evidence FROM access_grant_events e ORDER BY id")).rows,before);checks++;
  assert.equal((await db.query('SELECT count(*)::int AS n FROM access_grant_events WHERE resolution_evidence IS NULL')).rows[0].n,4);checks++;
  for(const event of [id(10),id(11)]){await db.query('UPDATE access_grant_events SET resolution_evidence=$2 WHERE id=$1',[event,{version:1}]);checks++;}
  for(const value of ['[]','true','7','"text"','null']){
   await db.query('SAVEPOINT invalid_evidence');
   await assert.rejects(db.query('UPDATE access_grant_events SET resolution_evidence=$2::jsonb WHERE id=$1',[id(10),value]),(e:any)=>e.code==='23514');checks++;
   await db.query('ROLLBACK TO SAVEPOINT invalid_evidence');
  }
  for(const event of [id(12),id(13)]){
   await db.query('SAVEPOINT invalid_action');await assert.rejects(db.query('UPDATE access_grant_events SET resolution_evidence=$2 WHERE id=$1',[event,{version:1}]),(e:any)=>e.code==='23514');checks++;await db.query('ROLLBACK TO SAVEPOINT invalid_action');
  }
  await db.query('UPDATE access_grant_events SET resolution_evidence=NULL');
  assert.deepEqual((await db.query("SELECT to_jsonb(e)-'resolution_evidence' AS evidence FROM access_grant_events e ORDER BY id")).rows,before);checks++;
  console.log(`PASS ${checks} standalone reviewer migration checks`);
 }finally{await db.query('ROLLBACK');db.release();await pg.end();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
