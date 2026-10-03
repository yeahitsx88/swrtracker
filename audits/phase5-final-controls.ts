import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
if(path.resolve(process.cwd()).toLowerCase()!==path.resolve('C:/Users/xwall/.codex/worktrees/phase5-isolation-assessment/SWRTracker').toLowerCase())throw new Error('Dedicated assessment worktree required.');
const root=path.join(process.cwd(),'.assessment'),f=JSON.parse(readFileSync(path.join(root,'fixtures.json'),'utf8')),rows:any[]=[];
async function request(u:any,url:string,method='GET',body?:any){const headers:any={};if(u?.cookie)headers.cookie=u.cookie;if(method!=='GET')headers['Idempotency-Key']=randomUUID();if(body&&!(body instanceof FormData))headers['content-type']='application/json';const r=await fetch('http://127.0.0.1:3115'+url,{method,headers,body:body instanceof FormData?body:body?JSON.stringify(body):undefined,redirect:'manual'});const text=await r.text();let data:any;try{data=JSON.parse(text)}catch{data=text};return {status:r.status,data,headers:Object.fromEntries(r.headers.entries())};}
async function test(label:string,u:any,url:string,expected:number[],method='GET',body?:any){const r=await request(u,url,method,body);rows.push({label,user:u?.name??'Unauthenticated',method,url,expected,actual:r.status,result:expected.includes(r.status)?'PASS':'FAIL',body:r.data,cache:r.headers['cache-control']});return r;}
async function main(){for(const k of ['A-requester','B-requester','A-admin','A-coworker']){const u=f.users[k],r=await request(null,'/api/auth/login','POST',{tenantId:u.tenantId,email:u.email,password:f.password});u.cookie=r.headers['set-cookie'].split(';')[0];}
 for(const p of f.projects){const allowed=f.users[`${p.company}-requester`];if(p.n===1||(p.company==='B'&&p.n===2)){
 const made=await test('Assigned project create positive control',allowed,'/api/tickets',[201],'POST',{projectId:p.id,aorNodeId:p.aor,departmentId:p.department,ticketType:'LAYOUT',fieldContact:'Synthetic',description:`Own ${p.name} positive control`,requestedDate:'2026-12-01'});
 await test('Own direct request positive control',allowed,`/api/tickets/${made.data.ticket.id}`,[200]);
 const form=new FormData();form.set('purpose','REQUEST_INSTRUCTION');form.set('file',new File([`Own ${p.name} synthetic attachment`],`OWN_${p.name}_TEST.txt`,{type:'text/plain'}));
 const upload=await test('Own attachment upload positive control',allowed,`/api/tickets/${made.data.ticket.id}/attachments`,[201],'POST',form);
 await test('Own attachment download positive control',allowed,upload.data.attachment.downloadUrl,[200]);
 }
 const wrong=f.users[p.company==='A'?'B-requester':'A-requester'];
 const deniedForm=new FormData();deniedForm.set('purpose','REQUEST_INSTRUCTION');deniedForm.set('file',new File(['Denied synthetic upload'],'DENIED.txt',{type:'text/plain'}));
 await test('Cross-tenant upload denied',wrong,`/api/tickets/${p.ticket}/attachments`,[404],'POST',deniedForm);
 await test('Unauthenticated file denied',null,p.download,[401]);await test('Unauthenticated attachment metadata denied',null,`/api/tickets/${p.ticket}/attachments`,[401]);
 }
 const p=f.projects[0],admin=f.users['A-admin'];
 await test('Admin cannot add foreign-tenant user',admin,`/api/projects/${p.id}/members`,[403,404],'POST',{userId:f.users['B-requester'].id,role:'REQUESTER'});
 await test('Admin cannot add member to foreign-tenant project',admin,`/api/projects/${f.projects[2].id}/members`,[403,404],'POST',{userId:f.users['A-requester'].id,role:'REQUESTER'});
 writeFileSync(path.join(root,'final-controls.json'),JSON.stringify(rows,null,2));console.log(JSON.stringify({total:rows.length,failures:rows.filter(r=>r.result==='FAIL')},null,2));}
main().catch(e=>{console.error(e);process.exitCode=1;});
