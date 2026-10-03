import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
if(path.resolve(process.cwd()).toLowerCase()!==path.resolve('C:/Users/xwall/.codex/worktrees/phase5-isolation-assessment/SWRTracker').toLowerCase()||process.env.DATABASE_URL!=='postgresql://phase5_test:synthetic-local-test@127.0.0.1:15495/swr_phase5_isolation')throw new Error('Dedicated assessment worktree/database required.');
const root=path.join(process.cwd(),'.assessment'),f=JSON.parse(readFileSync(path.join(root,'fixtures.json'),'utf8')),s=JSON.parse(readFileSync(path.join(root,'adversarial-fixtures.json'),'utf8'));
const db=new Pool({connectionString:process.env.DATABASE_URL}),rows:any[]=[];
async function call(u:any,url:string,method='GET',body?:any){const h:any={};if(u?.cookie)h.cookie=u.cookie;if(body)h['Content-Type']='application/json';h['Idempotency-Key']=randomUUID();const r=await fetch('http://127.0.0.1:3115'+url,{method,headers:h,body:body?JSON.stringify(body):undefined,redirect:'manual'});const t=await r.text();let data:any;try{data=JSON.parse(t)}catch{data=t};return {status:r.status,data,headers:Object.fromEntries(r.headers.entries())};}
async function login(u:any){const r=await call(null,'/api/auth/login','POST',{tenantId:u.tenantId,email:u.email,password:f.password});u.cookie=r.headers['set-cookie'].split(';')[0];}
async function check(label:string,u:any,url:string,expected:number[],method='GET',body?:any){const r=await call(u,url,method,body);rows.push({label,user:u?.name??'Unauthenticated',method,url,expected,actual:r.status,result:expected.includes(r.status)?'PASS':'FAIL',body:r.data,cache:r.headers['cache-control']});return r;}
async function main(){
 const p=f.projects[0],q=f.projects[1],im=s.staff.im1,owner=f.users['A-coworker'],lead=f.users['A-lead'];await login(im);await login(owner);await login(lead);
 // Staffing POST is additive, so omission is not revocation; explicit controlled DB fixture change tests inactive-state enforcement.
 await check('Additive staffing accepts IM2 only',lead,`/api/projects/${p.id}/survey/staffing`,[200],'POST',{partyChiefId:s.staff.chief.id,areaId:p.aor,superintendentId:s.staff.superintendent.id,instrumentManIds:[s.staff.im2.id],confirmRoleChanges:false});
 const active=await db.query('SELECT deactivated_at FROM crew_rosters WHERE project_id=$1 AND instrument_man_id=$2',[p.id,im.id]);rows.push({label:'Omitting IM1 is additive, not removal',actual:active.rows});
 await db.query('UPDATE crew_rosters SET deactivated_at=NOW() WHERE project_id=$1 AND instrument_man_id=$2',[p.id,im.id]);
 rows.push({label:'Controlled SQL revocation applied to synthetic roster',actual:(await db.query('SELECT deactivated_at FROM crew_rosters WHERE project_id=$1 AND instrument_man_id=$2',[p.id,im.id])).rows});
 await check('FILE-001 inactive roster request denied',im,`/api/tickets/${p.ticket}`,[404]);
 await check('FILE-001 inactive roster metadata denied',im,`/api/tickets/${p.ticket}/attachments`,[404]);
 await check('FILE-001 inactive roster copied attachment URL denied',im,p.download,[404]);
 await check('Account agrees crew removed',im,`/api/account?projectId=${p.id}`,[200]);
 // Valid request existence oracle for unassigned project, compared with nonexistent ID.
 const a=f.users['A-requester'];await login(a);
 await check('AUTH-002 known unassigned-project request',a,`/api/tickets/${q.ticket}`,[404]);
 await check('AUTH-002 nonexistent request',a,`/api/tickets/${randomUUID()}`,[404]);
 // Additional resource families and valid denial payloads.
 const b=f.users['B-requester'];await login(b);
 for(const u of [a,b])for(const project of f.projects){const assigned=u.tenantId===project.tenantId&&(project.n===1||(u===b&&project.n===2));
  for(const suffix of ['survey/teams?limit=1&offset=0','survey/staffing?partyChiefId='+s.staff.chief.id,'company-authority','invites','whitelist','aor/assignments'])await check('Secondary resource role/membership denial',u,`/api/projects/${project.id}/${suffix}`,[403,404,405]);
  await check('Config unauthorized write',u,`/api/projects/${project.id}/request-config`,[403,404],'PATCH',{leadTimeEnforcementEnabled:true,leadTimeDays:2,maxAttachmentsPerTicket:4});
  await check('Project archive unauthorized',u,`/api/projects/${project.id}/archive`,[403,404],'POST',{});
  if(!assigned)await check('Denied project account',u,`/api/account?projectId=${project.id}`,[403]);
 }
 // Completion persistence fixture: server exposes read-only completed objects; no move endpoint exists.
 await db.query(`UPDATE tickets SET status='COMPLETED' WHERE id=$1`,[p.ticket]);
 await check('Completed attachment persists',owner,p.download,[200]);
 await db.query(`UPDATE tickets SET status='DRAFT' WHERE id=$1`,[p.ticket]);
 writeFileSync(path.join(root,'revocation-results.json'),JSON.stringify(rows,null,2));
 console.log(JSON.stringify({total:rows.length,failures:rows.filter(r=>r.result==='FAIL').map(r=>({label:r.label,actual:r.actual,expected:r.expected}))},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.end());
