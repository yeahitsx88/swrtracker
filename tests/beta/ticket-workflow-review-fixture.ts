import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {signToken} from '../../src/lib/auth';
import type {UUID} from '../../src/shared/types';

async function main(){
const url=new URL(process.env.DATABASE_URL??'');
assert.equal(process.env.SWR_FINALIZATION_TEST,'1');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15498');assert.equal(url.pathname,'/swr_finalization_184');
const pool=new Pool({connectionString:url.href}),db=await pool.connect();
assert.equal((await db.query("SELECT count(*)::int n FROM pg_tables WHERE schemaname='public'")).rows[0].n,0,'Refuse any existing database schema');
const tenant=randomUUID(),foreignTenant=randomUUID(),company=randomUUID(),foreignCompany=randomUUID(),project=randomUUID(),otherProject=randomUUID(),foreignProject=randomUUID(),area=randomUUID(),level=randomUUID();
const roles:Record<string,string>={manager:'SURVEY_MANAGER',chief:'PARTY_CHIEF',instrument:'INSTRUMENT_MAN',requester:'REQUESTER',viewer:'VIEWER',superintendent:'SURVEY_SUPERINTENDENT',otherChief:'PARTY_CHIEF',otherInstrument:'INSTRUMENT_MAN',foreignManager:'SURVEY_MANAGER',otherManager:'SURVEY_MANAGER'};
const people=Object.fromEntries(Object.keys(roles).map(key=>[key,randomUUID()]));
const tickets=Object.fromEntries(['work','delay','inability','reject','stop','legacy','leadership','fault'].map(key=>[key,randomUUID()]));
try{
 await db.query('BEGIN');for(const file of (await readdir(resolve('db/migrations'))).filter(f=>f.endsWith('.sql')).sort())await db.query(await readFile(resolve('db/migrations',file),'utf8'));
 await db.query("INSERT INTO tenants(id,name) VALUES($1,'Owned Finalization 184'),($2,'Foreign Finalization 184')",[tenant,foreignTenant]);
 await db.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'Owned GC','GC'),($3,$4,'Foreign GC','GC')",[company,tenant,foreignCompany,foreignTenant]);
 for(const [id,t,name] of [[project,tenant,'Owned Finalization 184'],[otherProject,tenant,'Other Project 184'],[foreignProject,foreignTenant,'Foreign Project 184']])await db.query("INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,$3,'ACTIVE','FULL')",[id,t,name]);
 for(const [key,role] of Object.entries(roles)){
  const foreign=key==='foreignManager';await db.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,$5,'no-password-fixture')",[people[key],foreign?foreignTenant:tenant,foreign?foreignCompany:company,key+'@finalization184.invalid','Owned '+key]);
  await db.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)',[foreign?foreignProject:key==='otherManager'?otherProject:project,people[key],role]);
 }
 await db.query("INSERT INTO aor_levels(id,tenant_id,project_id,depth,label) VALUES($1,$2,$3,0,'Area')",[level,tenant,project]);
 await db.query("INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,name,code) VALUES($1,$2,$3,$4,'Owned Area','OWN184')",[area,tenant,project,level]);
 for(const key of ['chief','superintendent','otherChief'])await db.query('INSERT INTO aor_assignments(tenant_id,project_id,user_id,aor_node_id) VALUES($1,$2,$3,$4)',[tenant,project,people[key],area]);
 await db.query('INSERT INTO survey_reporting_links(tenant_id,project_id,superintendent_id,party_chief_id,aor_node_id,assigned_by) VALUES($1,$2,$3,$4,$5,$6)',[tenant,project,people.superintendent,people.chief,area,people.manager]);
 await db.query('INSERT INTO crew_rosters(tenant_id,project_id,party_chief_id,instrument_man_id) VALUES($1,$2,$3,$4)',[tenant,project,people.chief,people.instrument]);
 for(const [key,id] of Object.entries(tickets)){
  const status=key==='legacy'?'PENDING_PC_APPROVAL':key==='work'?'ASSIGNED':key==='leadership'?'SUBMITTED':'IN_PROGRESS';
  await db.query("INSERT INTO tickets(id,tenant_id,project_id,company_id,requester_id,workflow_variant,status,craft,description,aor_node_id,ticket_type,requested_date,original_requested_date,ticket_number,first_submitted_at,assigned_party_chief_id,assigned_instrument_man_id,pending_pc_outcome,survey_lead_id) VALUES($1,$2,$3,$4,$5,'STANDARD_APPROVAL',$6,'Survey',$7,$8,'LAYOUT',CURRENT_DATE+7,CURRENT_DATE+7,$9,NOW(),$10,$11,$12,$13)",[id,tenant,project,company,people.requester,status,'Owned '+key+' workflow',area,'ALPHA184-'+key,key==='leadership'?null:people.chief,key==='leadership'?null:people.instrument,key==='legacy'?'DELAYED':null,people.manager]);
 }
 await db.query('COMMIT');
 const tokens=Object.fromEntries(Object.keys(roles).map(key=>[key,signToken(people[key] as UUID,(key==='foreignManager'?foreignTenant:tenant) as UUID)]));
 await writeFile('.local/finalization/fixture.json',JSON.stringify({ownership:'new empty loopback15498/swr_finalization_184',tenant,foreignTenant,company,project,otherProject,foreignProject,area,people,tickets,tokens,origin:'http://127.0.0.1:3185'}));
 console.log('Fresh owned fixture prepared with current migrations; retained data untouched.');
}catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();await pool.end();}

}
void main().catch(error=>{console.error(error);process.exitCode=1;});
