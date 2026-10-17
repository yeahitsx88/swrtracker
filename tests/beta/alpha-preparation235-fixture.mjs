import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import jwt from 'jsonwebtoken';
assert.equal(process.env.SWR_PREPARATION_CYCLE,'235');
const dir=process.env.SWR_PREPARATION_CONFIRMATION==='1'?'.local/alpha-closure235-confirmation':'.local/alpha-closure235';
assert.equal(process.env.SWR_TEAM_POSTGRES,'1');
const url=new URL(process.env.DATABASE_URL);
assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15500');assert.equal(url.pathname,'/swr_team_isolated');
assert.equal(await readFile(dir+'/fixture.json').then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;}),false,'A new owned fixture must not overwrite an existing run.');
const own=JSON.parse(await readFile('.local/alpha-acceptance197/ownership.json','utf8'));assert.equal(own.owner,'Alpha acceptance197');
const schema='alpha_preparation235_'+randomUUID().replaceAll('-',''),pool=new Pool({connectionString:url.href}),db=await pool.connect();
const f={schema,tenant:randomUUID(),company:randomUUID(),project:randomUUID(),level:randomUUID(),area:randomUUID(),area2:randomUUID(),area3:randomUUID(),people:{},tokens:{},origin:process.env.SWR_PREPARATION_CONFIRMATION==='1'?'http://127.0.0.1:3265':'http://127.0.0.1:3264'};
const roles={manager:'SURVEY_MANAGER',superintendent:'SURVEY_SUPERINTENDENT',destinationLead:'SURVEY_SUPERINTENDENT',chief:'PARTY_CHIEF',instrument:'INSTRUMENT_MAN',instrument2:'INSTRUMENT_MAN',requester:'REQUESTER',viewer:'VIEWER',otherRequester:'REQUESTER',projectAdmin:'REQUESTER',tenantOnly:'REQUESTER',combinedAdmin:'REQUESTER',unlinkedChief:'PARTY_CHIEF',unlinkedInstrument:'INSTRUMENT_MAN'};
try{
 await db.query(`CREATE SCHEMA "${schema}"`);await db.query(`SET search_path TO "${schema}",public`);
 for(const file of (await readdir('db/migrations')).filter(x=>x.endsWith('.sql')).sort()){await db.query(await readFile('db/migrations/'+file,'utf8'));assert.equal((await db.query('SELECT current_schema() AS name')).rows[0].name,schema);}
 await db.query('BEGIN');
 await db.query("INSERT INTO tenants(id,name) VALUES($1,'Owned field review235')",[f.tenant]);
 await db.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'Owned GC','GC')",[f.company,f.tenant]);
 await db.query("INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,'Owned initial Setup acceptance','SETUP','FULL')",[f.project,f.tenant]);
 for(const [key,role] of Object.entries(roles)){const id=f.people[key]=randomUUID();await db.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,$5,'no-login-fixture')",[id,f.tenant,f.company,id+'@example.test','Parity '+key]);await db.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)',[f.project,id,role]);f.tokens[key]=jwt.sign({sub:id,tenantId:f.tenant,sv:1},process.env.JWT_SECRET,{expiresIn:'2h',jwtid:randomUUID()});}
 await db.query("INSERT INTO aor_levels(id,tenant_id,project_id,depth,label) VALUES($1,$2,$3,0,'Area')",[f.level,f.tenant,f.project]);
 for(const [id,name] of [[f.area,'Source Area'],[f.area2,'Transfer Area'],[f.area3,'Retained Coverage']])await db.query('INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,name,code) VALUES($1,$2,$3,$4,$5,$6)',[id,f.tenant,f.project,f.level,name,id]);
 for(const [key,areas] of [['superintendent',[f.area,f.area2]],['destinationLead',[f.area2,f.area3]],['chief',[f.area,f.area2]],['unlinkedChief',[f.area]]])for(const area of areas)await db.query('INSERT INTO aor_assignments(tenant_id,project_id,user_id,aor_node_id) VALUES($1,$2,$3,$4)',[f.tenant,f.project,f.people[key],area]);
 await db.query('INSERT INTO survey_reporting_links(tenant_id,project_id,superintendent_id,party_chief_id,aor_node_id,assigned_by) VALUES($1,$2,$3,$4,$5,$6)',[f.tenant,f.project,f.people.superintendent,f.people.chief,f.area,f.people.manager]);
 for(const key of ['instrument','instrument2'])await db.query('INSERT INTO crew_rosters(tenant_id,project_id,party_chief_id,instrument_man_id) VALUES($1,$2,$3,$4)',[f.tenant,f.project,f.people.chief,f.people[key]]);
 await db.query('INSERT INTO crew_rosters(tenant_id,project_id,party_chief_id,instrument_man_id) VALUES($1,$2,$3,$4)',[f.tenant,f.project,f.people.unlinkedChief,f.people.unlinkedInstrument]);
 f.department=randomUUID();await db.query("INSERT INTO departments(id,tenant_id,project_id,name,manager_title,created_by) VALUES($1,$2,$3,'Owned Survey','Survey',$4)",[f.department,f.tenant,f.project,f.people.manager]);
 for(const key of ['tenantOnly','combinedAdmin'])await db.query("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'TENANT_ADMIN')",[f.tenant,f.people[key]]);
 for(const key of ['projectAdmin','combinedAdmin'])await db.query("INSERT INTO project_admin_grants(tenant_id,project_id,user_id,origin,granted_by) VALUES($1,$2,$3,'EXPLICIT',$4)",[f.tenant,f.project,f.people[key],f.people.tenantOnly]);
 f.otherProject=randomUUID();await db.query("INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,'Owned other project','ACTIVE','FULL')",[f.otherProject,f.tenant]);
 f.reviewGrants={};
 for(const [key,area] of [['superintendent',f.area],['destinationLead',f.area2]]){const id=f.reviewGrants[key]=randomUUID();await db.query("INSERT INTO project_responsibility_grants(id,tenant_id,project_id,user_id,aor_node_id,responsibility,granted_by) VALUES($1,$2,$3,$4,$5,'SURVEY_REVIEWER',$6)",[id,f.tenant,f.project,f.people[key],area,f.people.projectAdmin]);}
 await db.query('COMMIT');
 const host=new URL(url);host.hostname='127.0.0.1';host.port='15500';host.searchParams.set('options','-c search_path='+schema+',public');const runtime=new URL(host);runtime.hostname='host.docker.internal';
 await writeFile(dir+'/fixture.json',JSON.stringify(f));await writeFile(dir+'/host-runtime.env','DATABASE_URL='+host.href+'\nJWT_SECRET='+process.env.JWT_SECRET+'\n');await writeFile(dir+'/runtime.env','DATABASE_URL='+runtime.href+'\nJWT_SECRET='+process.env.JWT_SECRET+'\nSWR_ATTACHMENT_ROOT=/tmp/member235-files\n');
 console.log('Fresh fully migrated UUID schema and owned organization created; no retained fixture modified.');
}finally{await db.query('ROLLBACK');db.release();await pool.end();}
