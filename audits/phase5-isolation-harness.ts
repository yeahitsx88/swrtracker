import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

if (path.resolve(process.cwd()).toLowerCase() !== path.resolve('C:/Users/xwall/.codex/worktrees/phase5-isolation-assessment/SWRTracker').toLowerCase()
  || process.env.DATABASE_URL !== 'postgresql://phase5_test:synthetic-local-test@127.0.0.1:15495/swr_phase5_isolation') {
  throw new Error('Run only from the pinned assessment worktree with the dedicated synthetic database URL.');
}
const db = new Pool({connectionString: process.env.DATABASE_URL});
const base = 'http://127.0.0.1:3115';
const out = path.join(process.cwd(), '.assessment');
mkdirSync(out, {recursive:true});
const fixturePath = path.join(out,'fixtures.json');
const password = 'SyntheticOnly!2026';
const projects:any[] = [];
const users:any = {};
const rows:any[] = [];
async function seed() {
  const hash = await bcrypt.hash(password, 10);
  for (const company of ['A','B']) {
    const tenantId=randomUUID(), companyId=randomUUID(), gcId=randomUUID();
    await db.query('INSERT INTO tenants(id,name) VALUES($1,$2)',[tenantId,`Synthetic Company ${company} tenant`]);
    await db.query('INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,$3,$4),($5,$2,$6,$7)',[companyId,tenantId,`Company ${company}`,'SUBCONTRACTOR',gcId,`Company ${company} IT`,'GC']);
    for (const role of ['requester','admin','projectIT','coworker','lead']) {
      const u={id:randomUUID(),tenantId,companyId:role==='requester'||role==='coworker'?companyId:gcId,email:`${company.toLowerCase()}-${role}@example.invalid`,name:`Synthetic ${company} ${role}`,role};
      users[`${company}-${role}`]=u;
      await db.query('INSERT INTO users(id,tenant_id,company_id,email,name,password_hash,auth_method) VALUES($1,$2,$3,$4,$5,$6,$7)',[u.id,tenantId,u.companyId,u.email,u.name,hash,'LOCAL']);
      if(role==='admin')await db.query('INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,$3)',[tenantId,u.id,'TENANT_ADMIN']);
    }
    for(let n=1;n<=(company==='A'?2:3);n++) {
      const p={id:randomUUID(),tenantId,companyId,company,n,name:`${company}-Project-${n}`,aor:randomUUID(),level:randomUUID(),department:randomUUID(),ticket:randomUUID(),owner:users[`${company}-coworker`].id};
      projects.push(p);
      await db.query('INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,$3,$4,$5)',[p.id,tenantId,p.name,'ACTIVE','SLIM']);
      await db.query('INSERT INTO aor_levels(id,project_id,tenant_id,depth,label) VALUES($1,$2,$3,0,$4)',[p.level,p.id,tenantId,'Area']);
      await db.query('INSERT INTO aor_nodes(id,project_id,tenant_id,level_id,name,code) VALUES($1,$2,$3,$4,$5,$6)',[p.aor,p.id,tenantId,p.level,`${p.name} area`,`${company}${n}`]);
      await db.query('INSERT INTO departments(id,project_id,tenant_id,name,manager_title,created_by) VALUES($1,$2,$3,$4,$5,$6)',[p.department,p.id,tenantId,`${p.name} Civil`,'Manager',users[`${company}-admin`].id]);
      for(const [key,role] of [['coworker','REQUESTER'],['lead','SURVEY_MANAGER'],['projectIT','PROJECT_ADMIN']] as const)await db.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)',[p.id,users[`${company}-${key}`].id,role]);
      if(n===1||(company==='B'&&n===2))await db.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)',[p.id,users[`${company}-requester`].id,'REQUESTER']);
      await db.query(`INSERT INTO tickets(id,tenant_id,project_id,aor_node_id,company_id,requester_id,workflow_variant,status,craft,description,requested_date,ticket_type,department_id,field_contact) VALUES($1,$2,$3,$4,$5,$6,'STANDARD_APPROVAL','DRAFT','Civil',$7,'2026-12-01','LAYOUT',$8,'Synthetic contact')`,[p.ticket,tenantId,p.id,p.aor,companyId,p.owner,`CONFIDENTIAL SYNTHETIC ${p.name}`,p.department]);
    }
  }
  // Additional same-tenant company boundary, distinct from the A/B tenant matrix.
  const a=projects[0], foreignCompany=randomUUID(), foreignUser=randomUUID(), foreignTicket=randomUUID();
  await db.query('INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,$3,$4)',[foreignCompany,a.tenantId,'Company C same tenant','SUBCONTRACTOR']);
  const c={id:foreignUser,tenantId:a.tenantId,companyId:foreignCompany,email:'c-requester@example.invalid',name:'Synthetic C requester',role:'requester'};
  users['C-requester']=c;
  await db.query('INSERT INTO users(id,tenant_id,company_id,email,name,password_hash,auth_method) VALUES($1,$2,$3,$4,$5,$6,$7)',[c.id,c.tenantId,c.companyId,c.email,c.name,hash,'LOCAL']);
  await db.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)',[a.id,c.id,'REQUESTER']);
  await db.query(`INSERT INTO tickets(id,tenant_id,project_id,aor_node_id,company_id,requester_id,workflow_variant,status,craft,description,requested_date,ticket_type,department_id,field_contact) VALUES($1,$2,$3,$4,$5,$6,'STANDARD_APPROVAL','DRAFT','Civil','COMPANY C CONFIDENTIAL','2026-12-01','LAYOUT',$7,'Synthetic contact')`,[foreignTicket,c.tenantId,a.id,a.aor,c.companyId,c.id,a.department]);
  const f={projects,users,sameTenantTicket:foreignTicket,password};
  writeFileSync(fixturePath,JSON.stringify(f,null,2));
  console.log('Synthetic seed ready: 2 tenants, 5 projects, 11 users, 6 baseline requests.');
}
async function call(user:any,route:string,method='GET',body?:any) {
  const headers:any={};if(user?.cookie)headers.cookie=user.cookie;
  if(method!=='GET')headers['Idempotency-Key']=randomUUID();
  if(body && !(body instanceof FormData))headers['Content-Type']='application/json';
  const r=await fetch(base+route,{method,headers,body:body instanceof FormData?body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'});
  const text=await r.text();let data:any;try{data=JSON.parse(text)}catch{data=text.slice(0,300)}
  return {status:r.status,data,headers:Object.fromEntries(r.headers.entries())};
}
async function test(user:any,route:string,expected:number[],method='GET',body?:any,label=route) {
  const r=await call(user,route,method,body);
  rows.push({user:user?.name??'Unauthenticated',method,route,label,expected,actual:r.status,result:expected.includes(r.status)?'PASS':'FAIL',body:r.data,cache:r.headers['cache-control']});
  return r;
}
async function run() {
  const f=JSON.parse(await (await import('node:fs/promises')).readFile(fixturePath,'utf8'));
  Object.assign(users,f.users);projects.push(...f.projects);
  for(const u of Object.values(users) as any[]) {
    const r=await call(null,'/api/auth/login','POST',{tenantId:u.tenantId,email:u.email,password:f.password});
    if(r.status!==200)throw new Error(`Login failed ${u.email}: ${JSON.stringify(r)}`);
    u.cookie=r.headers['set-cookie'].split(';')[0];
  }
  for(const p of projects) {
    const form=new FormData();form.set('purpose','REQUEST_INSTRUCTION');
    form.set('file',new File([`SYNTHETIC ONLY; owner Company ${p.company}; project ${p.name}; request ${p.ticket}`],`COMPANY_${p.company}_PROJECT_${p.n}_CONFIDENTIAL_TEST.txt`,{type:'text/plain'}));
    const r=await test(users[`${p.company}-coworker`],`/api/tickets/${p.ticket}/attachments`,[201],'POST',form,'Owner uploads synthetic attachment');
    p.attachment=r.data.attachment?.id;p.download=r.data.attachment?.downloadUrl;
    if(!p.attachment)throw new Error('Upload failed');
  }
  const cform=new FormData();cform.set('purpose','REQUEST_INSTRUCTION');cform.set('file',new File(['Company C same-tenant synthetic data'],'COMPANY_C_CONFIDENTIAL_TEST.txt',{type:'text/plain'}));
  const cr=await test(users['C-requester'],`/api/tickets/${f.sameTenantTicket}/attachments`,[201],'POST',cform);
  f.sameTenantAttachment=cr.data.attachment.id;
  for(const company of ['A','B']) {
    const u=users[`${company}-requester`];
    const listing=await test(u,'/api/projects',[200]);
    const expectedIds=projects.filter(p=>p.company===company&&(p.n===1||(company==='B'&&p.n===2))).map(p=>p.id).sort();
    rows.push({user:u.name,label:'Exact project listing excludes denied projects',expected:expectedIds,actual:listing.data.projects?.map((p:any)=>p.id).sort(),result:JSON.stringify(expectedIds)===JSON.stringify(listing.data.projects?.map((p:any)=>p.id).sort())?'PASS':'FAIL'});
    for(const p of projects) {
      const allowed=expectedIds.includes(p.id),deny=p.company===company?[403]:[403,404];
      for(const suffix of ['','&limit=1&offset=1','&search=CONFIDENTIAL','&companyId='+p.companyId+'&tenantId='+p.tenantId,'&status=DRAFT','&requesterId='+p.owner])await test(u,`/api/tickets?projectId=${p.id}${suffix}`,allowed?[200]:deny);
      for(const resource of ['aor','request-config','departments','metrics','review','notifications'])await test(u,`/api/projects/${p.id}/${resource}`,allowed?(resource==='review'?[200,403]:[200,403]):deny);
      for(const suffix of ['','/history','/attachments',`/attachments/${p.attachment}`])await test(u,`/api/tickets/${p.ticket}${suffix}`,allowed?[404]:p.company===company?[403]:[404]);
      await test(u,`/api/tickets/${p.ticket}`,[403,404],'PATCH',{description:'UNAUTHORIZED MODIFICATION'});
      for(const action of ['submit','approve','assign','start','complete','requester-cancel','return','elevate-priority'])await test(u,`/api/tickets/${p.ticket}/${action}`,[403,404,400],'POST',{reason:'Synthetic denied action reason',urgentReason:'Synthetic',assignedInstrumentManId:u.id});
      await test(u,`/api/tickets/${p.ticket}`,[405],'DELETE');
      if(!allowed)await test(u,'/api/tickets',deny,'POST',{projectId:p.id,aorNodeId:p.aor,ticketType:'LAYOUT',fieldContact:'Synthetic',description:'DENIED CREATE',requestedDate:'2026-12-01'});
      for(const route of [`/projects/${p.id}/my-requests`,`/projects/${p.id}/tickets/${p.ticket}`])await test(u,route,[200,307],'GET',undefined,'UI shell HTTP; data enforcement checked separately');
      await test(u,`/api/projects/${p.id}/members`,[403]);
      await test(u,`/api/projects/${p.id}/members`,[403],'POST',{userId:u.id,role:'SURVEY_MANAGER'});
    }
    for(const route of ['/api/companies','/api/tenant-memberships','/api/project-templates','/api/ops/diagnostics'])await test(u,route,[403,405]);
    await test(u,'/api/tenant-memberships',[403],'POST',{userId:u.id,role:'TENANT_ADMIN'});
    await test(u,`/api/tickets/${f.sameTenantTicket}`,[company==='A'?404:404]);
    await test(u,`/api/tickets/${f.sameTenantTicket}/attachments/${f.sameTenantAttachment}`,[404]);
    for(const malformed of ['not-a-uuid','00000000-0000-0000-0000-000000000000'])await test(u,`/api/tickets/${malformed}`,[400,403,404]);
    await test(u,`/api/tickets?projectId=${projects[0].id}&projectId=${projects[4].id}`,[400,403]);
  }
  const a=projects[0],u=users['A-requester'];
  const created=await test(u,'/api/tickets',[201],'POST',{projectId:a.id,aorNodeId:a.aor,departmentId:a.department,ticketType:'LAYOUT',fieldContact:'Synthetic',description:'Authorized requester lifecycle',requestedDate:'2026-12-01',companyId:projects[2].companyId,tenantId:projects[2].tenantId,requesterId:users['B-requester'].id});
  const own=created.data.ticket.id;
  const form=new FormData();form.set('purpose','REQUEST_INSTRUCTION');form.set('file',new File(['Company A Project 1 own upload synthetic content'],'COMPANY_A_PROJECT_1_CONFIDENTIAL_TEST.txt',{type:'text/plain'}));
  const upload=await test(u,`/api/tickets/${own}/attachments`,[201],'POST',form);const aid=upload.data.attachment.id;
  await test(u,`/api/tickets/${own}/attachments/${aid}`,[200]);
  await test(users['B-requester'],`/api/tickets/${own}/attachments/${aid}`,[404]);
  await test(null,`/api/tickets/${own}/attachments/${aid}`,[401]);
  await test(u,`/api/tickets/${a.ticket}/attachments/${aid}`,[404]);
  await test(u,`/api/tickets/${own}/attachments/${a.attachment}`,[404]);
  await test(u,`/api/tickets/${own}`,[200],'PATCH',{description:'Edited synthetic request'});
  await test(u,`/api/tickets/${own}/submit`,[200],'POST',{departmentId:a.department});
  await test(u,`/api/tickets/${own}/attachments/${aid}`,[200]);
  await test(u,`/api/tickets/${own}/requester-cancel`,[200],'POST',{reason:'Synthetic cancellation for persistence test'});
  await test(u,`/api/tickets/${own}/attachments/${aid}`,[200]);
  await test(u,`/api/tickets/${own}/history`,[200]);
  // Sequential ID guessing and direct storage paths never serve files.
  for(const id of ['1','2',randomUUID()])await test(u,`/api/tickets/${own}/attachments/${id}`,[400,404]);
  const keys=await db.query('SELECT storage_key FROM attachments WHERE id=$1',[aid]);
  for(const prefix of ['/.data/attachments/','/attachments/','/api/attachments/'])await test(null,prefix+keys.rows[0].storage_key,[404]);
  await test(users['A-projectIT'],`/api/projects/${a.id}/notifications`,[200]);
  await test(users['A-projectIT'],`/api/tickets/${own}`,[404]);
  await test(users['A-admin'],'/api/projects',[200]);
  await test(users['A-admin'],`/api/tickets/${own}`,[403]);
  // Revoke membership without logout: copied authorized URL must immediately fail.
  await db.query('DELETE FROM project_memberships WHERE project_id=$1 AND user_id=$2',[a.id,u.id]);
  await test(u,`/api/tickets/${own}/attachments/${aid}`,[403]);
  await test(u,`/api/tickets/${own}`,[403]);
  await test(u,'/api/projects',[200]);
  await db.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)',[a.id,u.id,'REQUESTER']);
  const savedCookie=u.cookie;
  await test(u,'/api/auth/logout',[200],'POST');u.cookie=savedCookie;
  await test(u,`/api/tickets/${own}/attachments/${aid}`,[401]);
  await test(u,'/api/projects',[401]);
  const b=users['B-requester'];await db.query('UPDATE users SET deactivated_at=NOW(),session_version=session_version+1 WHERE id=$1',[b.id]);
  await test(b,'/api/projects',[401]);await test(b,`/api/tickets/${projects[2].ticket}/attachments/${projects[2].attachment}`,[401]);
  await db.query('UPDATE users SET deactivated_at=NULL WHERE id=$1',[b.id]);
  const integrity=await db.query(`SELECT a.id,a.ticket_id,t.project_id,t.company_id,a.tenant_id,a.storage_key,a.content_sha256 FROM attachments a JOIN tickets t ON t.id=a.ticket_id`);
  writeFileSync(path.join(out,'integrity.json'),JSON.stringify(integrity.rows,null,2));
  writeFileSync(path.join(out,'results.json'),JSON.stringify(rows,null,2));
  writeFileSync(fixturePath,JSON.stringify({...f,projects,users:Object.fromEntries(Object.entries(users).map(([key,value]:any)=>[key,{...value,cookie:undefined}])),ownTicket:own,ownAttachment:aid},null,2));
  console.log(JSON.stringify({total:rows.length,pass:rows.filter(x=>x.result==='PASS').length,fail:rows.filter(x=>x.result==='FAIL').length,failures:rows.filter(x=>x.result==='FAIL')},null,2));
}
async function main(){try { if(process.argv[2]==='seed')await seed();else await run(); } finally {await db.end();}}
main().catch(e=>{console.error(e);process.exitCode=1;});
