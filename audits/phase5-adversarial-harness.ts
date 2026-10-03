import {Pool} from 'pg';
import bcrypt from 'bcrypt';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
if(path.resolve(process.cwd()).toLowerCase()!==path.resolve('C:/Users/xwall/.codex/worktrees/phase5-isolation-assessment/SWRTracker').toLowerCase()||process.env.DATABASE_URL!=='postgresql://phase5_test:synthetic-local-test@127.0.0.1:15495/swr_phase5_isolation')throw new Error('Dedicated assessment worktree/database required.');
const db=new Pool({connectionString:process.env.DATABASE_URL});
const root=path.join(process.cwd(),'.assessment');
const f=JSON.parse(readFileSync(path.join(root,'fixtures.json'),'utf8'));
const p=f.projects[0],q=f.projects[1],rows:any[]=[];
const base='http://127.0.0.1:3115';
async function call(u:any,url:string,method='GET',body?:any,key=randomUUID()){
 const h:any={};if(u?.cookie)h.cookie=u.cookie;if(method!=='GET')h['Idempotency-Key']=key;
 if(body&&!(body instanceof FormData))h['Content-Type']='application/json';
 const r=await fetch(base+url,{method,headers:h,body:body instanceof FormData?body:body?JSON.stringify(body):undefined,redirect:'manual'});
 const txt=await r.text();let data:any;try{data=JSON.parse(txt)}catch{data=txt};return {status:r.status,data,headers:Object.fromEntries(r.headers.entries())};
}
async function login(u:any){const r=await call(null,'/api/auth/login','POST',{tenantId:u.tenantId,email:u.email,password:f.password});if(r.status!==200)throw new Error('login '+JSON.stringify(r));u.cookie=r.headers['set-cookie'].split(';')[0];}
async function check(label:string,u:any,url:string,expected:number[],method='GET',body?:any,key?:string){const r=await call(u,url,method,body,key);rows.push({label,user:u?.name??'Unauthenticated',method,url,expected,actual:r.status,result:expected.includes(r.status)?'PASS':'FAIL',body:r.data,cache:r.headers['cache-control']});return r;}
async function main(){
 for(const key of ['A-admin','A-lead','A-requester','A-projectIT','A-coworker','C-requester','B-admin'])await login(f.users[key]);
 const hash=await bcrypt.hash(f.password,10),staff:any={};
 const gc=f.users['A-lead'].companyId;
 for(const role of ['superintendent','chief','im1','im2']){
  const u={id:randomUUID(),tenantId:p.tenantId,companyId:gc,name:`Synthetic A ${role}`,email:`${role}@example.invalid`};staff[role]=u;
  await db.query('INSERT INTO users(id,tenant_id,company_id,name,email,password_hash,auth_method) VALUES($1,$2,$3,$4,$5,$6,$7)',[u.id,u.tenantId,gc,u.name,u.email,hash,'LOCAL']);
  await db.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)',[p.id,u.id,role==='superintendent'?'SURVEY_SUPERINTENDENT':role==='chief'?'PARTY_CHIEF':'INSTRUMENT_MAN']);await login(u);
 }
 await db.query(`UPDATE projects SET crew_build='FULL' WHERE id=$1`,[p.id]);
 const forbiddenArea=randomUUID();
 await db.query('INSERT INTO aor_nodes(id,project_id,tenant_id,level_id,name,code) VALUES($1,$2,$3,$4,$5,$6)',[forbiddenArea,p.id,p.tenantId,p.level,'Unauthorized Area B','DENIED']);
 await db.query('INSERT INTO aor_assignments(project_id,tenant_id,user_id,aor_node_id) VALUES($1,$2,$3,$4)',[p.id,p.tenantId,staff.superintendent.id,p.aor]);
 for(const u of [staff.im1,staff.im2])await db.query('INSERT INTO crew_rosters(project_id,tenant_id,party_chief_id,instrument_man_id) VALUES($1,$2,$3,$4)',[p.id,p.tenantId,staff.chief.id,u.id]);
 const direct={projectId:p.id,aorNodeId:forbiddenArea,workflowVariant:'DIRECT_ASSIGNMENT',requesterId:f.users['A-coworker'].id,assignedPartyChiefId:staff.chief.id,assignedInstrumentManId:staff.im2.id,departmentId:p.department,ticketType:'LAYOUT',fieldContact:'Synthetic contact',description:'AUTH-001 forbidden Area direct assignment',requestedDate:'2026-12-01'};
 const created=await check('AUTH-001 Superintendent creates outside authorized Area',staff.superintendent,'/api/tickets',[403,404],'POST',direct);
 if(created.status===201){await check('AUTH-001 Superintendent cannot read newly created forbidden-Area request',staff.superintendent,`/api/tickets/${created.data.ticket.id}`,[404]);}
 const delayed=randomUUID();
 await db.query(`INSERT INTO tickets(id,tenant_id,project_id,aor_node_id,company_id,requester_id,workflow_variant,status,craft,description,requested_date,ticket_type,department_id,field_contact,assigned_party_chief_id,assigned_instrument_man_id) VALUES($1,$2,$3,$4,$5,$6,'STANDARD_APPROVAL','DELAYED','Civil','Delayed teammate synthetic request','2026-12-01','LAYOUT',$7,'Synthetic',$8,$9)`,[delayed,p.tenantId,p.id,p.aor,p.companyId,f.users['A-coworker'].id,p.department,staff.chief.id,staff.im2.id]);
 await check('Crew visibility positive control',staff.im1,`/api/tickets/${delayed}`,[200]);
 const canceled=await check('REQ-001 IM1 field-cancels IM2 delayed ticket',staff.im1,`/api/tickets/${delayed}/field-cancel`,[403],'POST',{reason:'Unauthorized teammate cancellation'});
 const persisted=await db.query('SELECT status,pending_pc_outcome FROM tickets WHERE id=$1',[delayed]);rows.push({label:'REQ-001 database outcome',actual:persisted.rows});
 // Attachment revocation through the supported Survey Manager staffing operation.
 await db.query('UPDATE tickets SET assigned_party_chief_id=$2,assigned_instrument_man_id=$3 WHERE id=$1',[p.ticket,staff.chief.id,staff.im2.id]);
 await check('Active crew copied attachment positive control',staff.im1,p.download,[200]);
 await check('Manager removes IM1 from chief roster',f.users['A-lead'],`/api/projects/${p.id}/survey/staffing`,[200],'POST',{partyChiefId:staff.chief.id,areaId:p.aor,superintendentId:null,instrumentManIds:[staff.im2.id],confirmRoleChanges:false});
 const roster=await db.query('SELECT deactivated_at FROM crew_rosters WHERE project_id=$1 AND instrument_man_id=$2',[p.id,staff.im1.id]);rows.push({label:'Revoked roster is inactive',actual:roster.rows});
 await check('FILE-001 revoked crew cannot download former teammate attachment',staff.im1,p.download,[404]);
 await check('FILE-001 revoked crew cannot read former teammate request',staff.im1,`/api/tickets/${p.ticket}`,[404]);
 // Explicit company view: same-company read, never cross-company, no mutation, then revocation.
 const a=f.users['A-requester'];
 const grant=await check('IT grants scoped company view',f.users['A-projectIT'],`/api/projects/${p.id}/company-authority`,[201],'POST',{userId:a.id});
 await check('Company view permits coworker request',a,`/api/tickets/${p.ticket}`,[200]);
 await check('Company view permits coworker attachment',a,p.download,[200]);
 await check('Company view excludes Company C request',a,`/api/tickets/${f.sameTenantTicket}`,[404]);
 await check('Company view cannot edit coworker request',a,`/api/tickets/${p.ticket}`,[403],'PATCH',{description:'Denied company viewer edit'});
 const gid=grant.data.grant?.id;
 if(gid)await check('IT revokes scoped company view',f.users['A-projectIT'],`/api/projects/${p.id}/company-authority/${gid}`,[200],'DELETE');
 await check('Revoked company view copied file URL denied',a,p.download,[404]);
 // Lifecycle persistence and byte integrity.
 const all=await db.query('SELECT id,ticket_id,tenant_id,storage_key,content_sha256 FROM attachments');
 for(const r of all.rows){const bytes=readFileSync(path.join(root,'attachments',r.storage_key));rows.push({label:'Attachment SHA256 disk integrity',attachmentId:r.id,result:createHash('sha256').update(bytes).digest('hex')===r.content_sha256?'PASS':'FAIL'});}
 const original=await check('Owner byte persistence original',f.users['A-coworker'],p.download,[200]);
 const form=new FormData();form.set('purpose','REQUEST_INSTRUCTION');form.set('file',new File(['Second synthetic file same filename different bytes'],`COMPANY_A_PROJECT_1_CONFIDENTIAL_TEST.txt`,{type:'text/plain'}));
 const upload=await check('Same filename upload receives distinct object',f.users['A-coworker'],`/api/tickets/${p.ticket}/attachments`,[201],'POST',form);
 const after=await check('First object unchanged after same filename upload',f.users['A-coworker'],p.download,[200]);rows.push({label:'No overwrite',result:original.data===after.data?'PASS':'FAIL',firstId:p.attachment,secondId:upload.data.attachment?.id});
 await db.query(`UPDATE projects SET status='ARCHIVED' WHERE id=$1`,[p.id]);
 await check('Archived request attachment remains readable by owner',f.users['A-coworker'],p.download,[200]);
 await db.query(`UPDATE projects SET status='ACTIVE' WHERE id=$1`,[p.id]);
 // Wrong-project AOR and malicious identity payload remain fenced.
 await check('Requester substitutes different-project Area',a,'/api/tickets',[404],'POST',{...direct,workflowVariant:'STANDARD_APPROVAL',aorNodeId:q.aor});
 for(const user of [a,f.users['B-admin']])for(const proj of f.projects)if(proj.tenantId!==user.tenantId){await check('Account cross-tenant project',user,`/api/account?projectId=${proj.id}`,[403]);await check('Tenant-admin config cross-tenant',user,`/api/projects/${proj.id}/request-config`,[403,404]);}
 // Idempotency replay after membership removal must deny, even same key.
 const body={projectId:p.id,aorNodeId:p.aor,departmentId:p.department,ticketType:'LAYOUT',fieldContact:'Synthetic',description:'Replay test',requestedDate:'2026-12-01'},key=randomUUID();
 await check('Create replay positive control',a,'/api/tickets',[201],'POST',body,key);
 await db.query('DELETE FROM project_memberships WHERE project_id=$1 AND user_id=$2',[p.id,a.id]);
 await check('Revoked membership idempotency replay denied',a,'/api/tickets',[403],'POST',body,key);
 await db.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)',[p.id,a.id,'REQUESTER']);
 writeFileSync(path.join(root,'adversarial-results.json'),JSON.stringify(rows,null,2));
 writeFileSync(path.join(root,'adversarial-fixtures.json'),JSON.stringify({staff:Object.fromEntries(Object.entries(staff).map(([k,v]:any)=>[k,{...v,cookie:undefined}])),forbiddenArea,delayed,directTicket:created.data.ticket?.id},null,2));
 console.log(JSON.stringify({total:rows.length,failures:rows.filter(r=>r.result==='FAIL')},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.end());
