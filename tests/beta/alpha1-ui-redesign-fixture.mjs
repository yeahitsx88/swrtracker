import assert from 'node:assert/strict';
import {Pool} from 'pg';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
assert.equal(process.env.SWR_UI_REDESIGN,'1','Explicit opt-in to newly owned UI fixtures required');
const f=JSON.parse(await fs.readFile('.local-fixture.json','utf8'));
assert.match(f.schema,/^phase5_acceptance_[a-f0-9]{32}$/);
const values=Object.fromEntries((await fs.readFile('.local-runtime.env','utf8')).trim().split(/\r?\n/).filter(s=>s.includes('=')).map(s=>[s.slice(0,s.indexOf('=')),s.slice(s.indexOf('=')+1)]));
const url=new URL(values.DATABASE_URL);url.port='15492';
assert.equal(url.pathname,'/swr_team_isolated');
assert.equal(url.hostname,'127.0.0.1');
const pg=new Pool({connectionString:url.href});
try {
 const db=await pg.connect();
 try {
  await db.query('BEGIN');
  for(const [key,name,role,admin] of [['homeRequester','Jamie Morgan','REQUESTER',false],['homeAdmin','Alex Rivera','PROJECT_ADMIN',true],['combined','Morgan Lee','SURVEY_MANAGER',true],['combinedRequester','Casey Quinn','REQUESTER',true],['combinedSuperintendent','Sam Parker','SURVEY_SUPERINTENDENT',true],['disabled','Disabled member','REQUESTER',false]]) {
   f[key]=randomUUID();
   await db.query("INSERT INTO users(id,tenant_id,company_id,name,email,password_hash) VALUES($1,$2,$3,$4,$5,'fixture')",[f[key],f.tenant,f.company,name,f[key]+'@example.test']);
   await db.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)',[f.project,f[key],role]);
   if(admin)await db.query("INSERT INTO project_admin_grants(tenant_id,project_id,user_id,origin,granted_by) VALUES($1,$2,$3,'EXPLICIT',$4)",[f.tenant,f.project,f[key],f.actor]);
  }
  await db.query('UPDATE project_memberships SET access_disabled_at=NOW(),access_disabled_by=$2 WHERE user_id=$1',[f.disabled,f.actor]);
  await db.query('INSERT INTO aor_assignments(tenant_id,project_id,user_id,aor_node_id) VALUES($1,$2,$3,$4)',[f.tenant,f.project,f.combinedSuperintendent,f.area]);
  f.secondArea=randomUUID();
  await db.query("INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,name,code) VALUES($1,$2,$3,$4,'Southern Utilities','SOUTH')",[f.secondArea,f.tenant,f.project,f.level]);
  f.setupProject=randomUUID();
  await db.query("INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,'Setup verification','SETUP','FULL')",[f.setupProject,f.tenant]);
  await db.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'PROJECT_ADMIN')",[f.setupProject,f.homeAdmin]);
  await db.query("INSERT INTO project_admin_grants(tenant_id,project_id,user_id,origin,granted_by) VALUES($1,$2,$3,'EXPLICIT',$4)",[f.tenant,f.setupProject,f.homeAdmin,f.actor]);
  for(const key of ['homeRequester','manager','superintendent','chief','im','homeAdmin','combined'])await db.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[f.archivedProject,f[key],key==='homeRequester'?'REQUESTER':key==='homeAdmin'?'PROJECT_ADMIN':key==='manager'||key==='combined'?'SURVEY_MANAGER':key==='superintendent'?'SURVEY_SUPERINTENDENT':key==='chief'?'PARTY_CHIEF':'INSTRUMENT_MAN']);
  await db.query("INSERT INTO project_admin_grants(tenant_id,project_id,user_id,origin,granted_by) VALUES($1,$2,$3,'EXPLICIT',$4)",[f.tenant,f.archivedProject,f.homeAdmin,f.actor]);
  const statuses=['SUBMITTED','APPROVED','ASSIGNED','IN_PROGRESS','DELAYED','PENDING_FIELD_VALIDATION','RETURNED_FOR_CORRECTION','COMPLETED'];
  const today=new Date().toISOString().slice(0,10);
  for(let i=0;i<24;i++) {
   const id=randomUUID(),status=statuses[i%statuses.length],area=i%4===0?f.secondArea:f.area;
   const date=new Date(today+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+i%5-1);
   await db.query("INSERT INTO tickets(id,tenant_id,project_id,company_id,requester_id,workflow_variant,status,craft,description,aor_node_id,ticket_type,requested_date,ticket_number,assigned_party_chief_id,assigned_instrument_man_id,field_validation_reviewer_id,field_contact,submitted_at,first_submitted_at,completed_at) VALUES($1,$2,$3,$4,$5,'STANDARD_APPROVAL',$6,'Survey',$7,$8,$9,$10,$11,$12,$13,$14,'Jamie Morgan',NOW()-INTERVAL '5 days',NOW()-INTERVAL '5 days',CASE WHEN $6='COMPLETED' THEN NOW() ELSE NULL END)",[id,f.tenant,f.project,f.company,i%3===0?f.combinedRequester:f.homeRequester,status,['Foundation control points','Utility crossing verification','Pipe rack alignment','Access road topography','Boundary layout','Drainage as-built'][i%6],area,['LAYOUT','TOPO','AS_BUILT'][i%3],date.toISOString().slice(0,10),'SWR-'+String(1040+i),i%3===0?null:f.chief,i%3===0?null:f.im,status==='PENDING_FIELD_VALIDATION'?f.chief:null]);
  }
  for(let i=0;i<3;i++)await db.query("INSERT INTO tickets(id,tenant_id,project_id,company_id,requester_id,workflow_variant,status,craft,description) VALUES($1,$2,$3,$4,$5,'STANDARD_APPROVAL','DRAFT','Survey',$6)",[randomUUID(),f.tenant,f.project,f.company,f.homeRequester,['Parking lot survey','West-side drainage','Tree line layout'][i]]);
  await db.query('COMMIT');
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 await fs.writeFile('.local-fixture.json',JSON.stringify(f,null,2));
 await fs.writeFile('.local-ui-browser.env','DATABASE_URL='+url.href+'\nJWT_SECRET='+values.JWT_SECRET+'\nSWR_TEAM_POSTGRES=1\n');
 console.log('Owned redesign role and request fixtures ready.');
}finally{await pg.end();}


