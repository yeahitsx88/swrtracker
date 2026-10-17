import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import jwt from 'jsonwebtoken';
import {Pool} from 'pg';
assert.equal(process.env.SWR_ROLE_ACCESS,'1');
const f=JSON.parse(await fs.readFile(process.env.SWR_ROLE_FIXTURE_FILE??'.local-roleaudit-fixture.json','utf8'));
const retained=JSON.parse(await fs.readFile('.local-demo-fixture.json','utf8'));assert.notEqual(f.schema,retained.schema);assert.match(f.schema,/^phase5_acceptance_[a-f0-9]{32}$/);
const url=new URL(process.env.DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15493');assert.equal(url.pathname,'/swr_team_isolated');url.searchParams.set('options','-c search_path='+f.schema+',public');
const db=new Pool({connectionString:url.href,max:4}),origin=process.env.SWR_ACCEPTANCE_ORIGIN;assert.match(origin,/^http:\/\/127\.0\.0\.1:\d+$/);
let checks=0,requesterSupport;const evidence=[];
const roles={TenantAdmin:'itOnly',ProjectAdmin:'localAdmin',SurveyManager:'manager',Superintendent:'superintendent',PartyChief:'chief',InstrumentMan:'im',Requester:'subject',Viewer:'viewer'};
async function request(actor,path,body,method=body?'POST':'GET',key=randomUUID()){
 const state=(await db.query('SELECT tenant_id,session_version FROM users WHERE id=$1',[f[actor]])).rows[0];assert(state);
 const cookie='swr_session='+jwt.sign({sub:f[actor],tenantId:state.tenant_id,sv:state.session_version},process.env.JWT_SECRET,{expiresIn:'1h'});
 const r=await fetch(origin+path,{method,headers:{cookie,'content-type':'application/json','Idempotency-Key':key},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});
 return {status:r.status,body:await r.json(),reference:r.headers.get('x-request-id')};
}
function check(value,label){assert(value,label);checks++;evidence.push(label);}
const base=`/api/projects/${f.project}`;
try{
 check((await db.query('SELECT current_schema() s')).rows[0].s===f.schema,'Owned schema guard');
 for(const [role,actor] of Object.entries(roles)){
  const admin=['TenantAdmin','ProjectAdmin'].includes(role);
  check((await request(actor,base+'/diagnostics')).status===(admin?200:403),role+' diagnostics authority');
  check((await request(actor,'/api/roles',{name:role+' Role '+randomUUID(),baseRole:'VIEWER',confirmed:true})).status===(role==='TenantAdmin'?201:403),role+' custom-role creation authority');
  if(role!=='TenantAdmin')check((await request(actor,base+'/administrators',{userId:f.subject,enabled:true,confirmed:true})).status===403,role+' cannot grant Project Admin');
  const support=await request(actor,base+'/help-desk',{subject:role+' assistance',description:'Synthetic reproduction steps and assistance request.',confirmed:true});check(support.status===201,role+' can submit help desk ticket');
  const id=support.body.ticket.id;if(role==='Requester')requesterSupport=id;
  check((await request(actor,base+'/help-desk/'+id,{version:1,message:'Synthetic follow-up detail.',confirmed:true},'PATCH')).status===200,role+' can reply to own support');
  if(!admin)check((await request(actor,base+'/help-desk/'+id,{version:2,message:'Unauthorized status change.',status:'RESOLVED',confirmed:true},'PATCH')).status===403,role+' cannot change support status');
 }
 const mine=await request('subject',base+'/help-desk'),other=await request('viewer',base+'/help-desk');check(mine.body.tickets.every(t=>t.requesterId===f.subject)&&other.body.tickets.every(t=>t.requesterId===f.viewer),'Members see only their own support tickets');
 const id=requesterSupport;check((await request('viewer',base+'/help-desk/'+id)).status===404,'Another member cannot inspect support conversation');
 const action={version:2,message:'Escalated with scoped evidence.',status:'ESCALATED',confirmed:true},key=randomUUID();
 const pair=await Promise.all([request('localAdmin',base+'/help-desk/'+id,action,'PATCH',key),request('localAdmin',base+'/help-desk/'+id,action,'PATCH',key)]);check(pair.every(r=>r.status===200),'Concurrent same-key help desk decision replays');
 check((await db.query('SELECT count(*)::int n FROM project_support_messages WHERE ticket_id=$1',[id])).rows[0].n===2,'Concurrent reply appended once');
 check((await request('localAdmin',base+'/help-desk/'+id,{...action,message:'Changed'},'PATCH',key)).status===409,'Help desk exact-body mismatch requires reload');
 check((await request('itOnly','/api/help-desk')).body.tickets[0].status==='ESCALATED','Tenant queue prioritizes escalation');
 check((await request('localAdmin','/api/help-desk')).status===403,'Project Admin cannot read tenant queue');
 const employee={companyId:f.company,name:'Role Audit Employee',email:randomUUID()+'@example.test',password:'Synthetic-Only-2026!',role:'REQUESTER',projectAdmin:false,confirmed:true};
 const created=await request('localAdmin',base+'/employees',employee);check(created.status===201,'Project Admin creates ordinary employee');
 check((await request('localAdmin',base+'/employees',{...employee,email:randomUUID()+'@example.test',projectAdmin:true})).status===403,'Project Admin cannot provision another administrator');
 const adminCreated=await request('itOnly',base+'/employees',{...employee,email:randomUUID()+'@example.test',projectAdmin:true});check(adminCreated.status===201&&adminCreated.body.employee.projectAdmin===true,'Tenant Admin provisions independent Project Admin');
 const role=await request('itOnly','/api/roles',{name:'Shared Construction Role '+randomUUID(),baseRole:'VIEWER',confirmed:true}),catalog=role.body.role;
 const user=created.body.employee.id,version=(await db.query('SELECT session_version FROM users WHERE id=$1',[user])).rows[0].session_version;
 const assign=await request('localAdmin',base+'/members/'+user+'/role',{role:'VIEWER',customRoleId:catalog.id,customRoleVersion:catalog.version,sessionVersion:version,confirmed:true},'PATCH');check(assign.status===200,'Project Admin assigns exact custom Viewer template');
 check((await request('itOnly','/api/roles/'+catalog.id,{version:catalog.version,confirmed:true},'DELETE')).status===409,'Assigned custom role cannot be deleted');
 check((await request('foreignAdmin',base+'/diagnostics')).status===404,'Foreign tenant diagnostics denied');
 const malformed=await request('manager',base+'/members?limit=0');check(malformed.status===400,'Scoped malformed request recorded as 400');
 const diagnostic=await request('localAdmin',base+'/diagnostics');check(diagnostic.body.errors.some(e=>e.status===400&&e.actorName==='Actual Manager')&&diagnostic.body.errors.some(e=>e.status===403&&e.actorName==='Read Only Viewer'),'Diagnostics names scoped 400 and 403 actors');
 check(diagnostic.body.health.requestCount>0&&diagnostic.body.health.currentSamples>0&&diagnostic.body.health.baselineSamples===0,'Diagnostics uses actual timing samples and leaves absent baseline empty');
 check(!JSON.stringify(diagnostic.body).includes(employee.password),'Diagnostics excludes credential bodies');
 const snapshot=await db.query('SELECT count(*)::int n FROM project_request_observations');
 await db.query(`CREATE OR REPLACE FUNCTION fail_roleaudit_observation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic observation failure'; END $$`);await db.query('CREATE TRIGGER roleaudit_observation_fault BEFORE INSERT ON project_request_observations FOR EACH ROW EXECUTE FUNCTION fail_roleaudit_observation()');
 try{check((await request('manager',base+'/members')).status===200,'Observation failure preserves business response');}finally{await db.query('DROP TRIGGER roleaudit_observation_fault ON project_request_observations');}
 check((await db.query('SELECT count(*)::int n FROM project_request_observations')).rows[0].n===snapshot.rows[0].n,'Failed observation does not persist partial metadata');
 const blocker=await db.connect();await blocker.query('BEGIN');
 try{await blocker.query('SELECT id FROM tenants WHERE id=$1 FOR UPDATE',[f.tenant]);const started=performance.now();check((await request('manager',base+'/members')).status===200,'Telemetry lifecycle lock timeout preserves successful read');check(performance.now()-started<1500,'Best-effort telemetry does not wait indefinitely behind lifecycle mutation');}finally{await blocker.query('ROLLBACK');blocker.release();}
 console.log('Role access production HTTP checks passed: '+checks);
 await fs.writeFile('.local-roleaudit-http-results.json',JSON.stringify({checks,evidence},null,2));
}finally{await db.end();}

