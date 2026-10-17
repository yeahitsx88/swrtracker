// Rehearsal support only. No production code changes, outbound mail, or retained fixtures.
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {randomUUID,randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import {Pool} from 'pg';

const root='.local-customer-rehearsal';
const mode=process.argv[2];
const baseline='6becd3bd541f58271e70cafd6a5da82162b44051';
const container='swr-area-unlink-ui-f590f61c';
const config=JSON.parse(execFileSync('docker',['inspect',container],{encoding:'utf8'}))[0];
assert.equal(config.NetworkSettings.Ports['5432/tcp'][0].HostPort,'15489');
const env=Object.fromEntries(config.Config.Env.map(s=>{const i=s.indexOf('=');return [s.slice(0,i),s.slice(i+1)];}));
assert.equal(env.POSTGRES_DB,'swr_team_isolated');
const url=new URL('postgresql://127.0.0.1:15489/swr_team_isolated');
url.username=env.POSTGRES_USER||'postgres';url.password=env.POSTGRES_PASSWORD;
const pool=new Pool({connectionString:url.href});
const persist=(file,value)=>fs.writeFile(file,JSON.stringify(value,null,2)+'\n');
try {
 if(mode==='setup') {
  await fs.mkdir(root); // Refuse to overwrite an existing human rehearsal.
  const manifest={baseline,createdAt:new Date().toISOString(),assistedBootstrap:true,datasets:{}};
  for(const kind of ['auto','human']) {
   const f={schema:'customer_rehearsal_'+randomUUID().replaceAll('-',''),port:kind==='auto'?3115:3116,password:randomBytes(18).toString('base64url'),actors:{}};
   for(const k of ['tenant','foreignTenant','company','foreignCompany'])f[k]=randomUUID();
   const db=await pool.connect();
   try {
    await db.query('BEGIN');await db.query(`CREATE SCHEMA "${f.schema}"`);
    await db.query(`SET LOCAL search_path TO "${f.schema}",public`);
    for(const m of (await fs.readdir('db/migrations')).filter(n=>n.endsWith('.sql')).sort())await db.query(await fs.readFile('db/migrations/'+m,'utf8'));
    await db.query("INSERT INTO tenants(id,name) VALUES($1,'SYNTHETIC Cedar Ridge Construction'),($2,'SYNTHETIC Stonebridge Utilities')",[f.tenant,f.foreignTenant]);
    await db.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'Cedar Ridge GC','GC'),($3,$4,'Stonebridge GC','GC')",[f.company,f.tenant,f.foreignCompany,f.foreignTenant]);
    const hash=await bcrypt.hash(f.password,12);
    for(const [key,name,foreign] of [['admin','Alex Morgan — client Tenant Admin',false],['foreignAdmin','Jordan Lee — second client Admin',true]]) {
     const a={id:randomUUID(),name,email:key.toLowerCase()+'@rehearsal.example.test',tenantId:foreign?f.foreignTenant:f.tenant};f.actors[key]=a;
     await db.query('INSERT INTO users(id,tenant_id,company_id,name,email,password_hash) VALUES($1,$2,$3,$4,$5,$6)',[a.id,a.tenantId,foreign?f.foreignCompany:f.company,a.name,a.email,hash]);
     await db.query("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'TENANT_ADMIN')",[a.tenantId,a.id]);
    }
    await db.query('COMMIT');
   }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
   manifest.datasets[kind]=f;
   const runtime=new URL(url);runtime.hostname='host.docker.internal';runtime.searchParams.set('options','-c search_path='+f.schema+',public');
   await fs.writeFile(`${root}/${kind}.env`,`DATABASE_URL=${runtime.href}\nJWT_SECRET=${randomBytes(64).toString('hex')}\n`);
   await persist(root+'/manifest.json',manifest);
  }
  const h=manifest.datasets.human;
  await fs.writeFile(root+'/HUMAN-ACCESS.md',`# Local synthetic credentials\n\nAssisted bootstrap: this is NOT successful application onboarding. Keep this file local.\n\nOpen http://localhost:${h.port}/login without query parameters first.\n\nTenant ID: ${h.tenant}\nEmail: ${h.actors.admin.email}\nPassword: ${h.password}\n\nFirst role: Alex Morgan, client Tenant Admin. No projects exist yet.\n\nSecond tenant: ${h.foreignTenant}\nSecond admin: ${h.actors.foreignAdmin.email}\nSame synthetic password.\n`);
  console.log('Two isolated bootstrap datasets created. Credentials are in the ignored local access file.');
 } else if(mode==='http') {
  const manifest=JSON.parse(await fs.readFile(root+'/manifest.json','utf8')),f=manifest.datasets.auto;
  assert.match(f.schema,/^customer_rehearsal_[a-f0-9]{32}$/);
  const db=await pool.connect();await db.query(`SET search_path TO "${f.schema}",public`);
  const results=[],runId=randomUUID();
  const request=async(path,body,cookie)=>{const r=await fetch(`http://127.0.0.1:${f.port}`+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','idempotency-key':randomUUID(),...(cookie?{cookie}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
  const record=(id,actor,expected,observed,pass)=>{results.push({id,actor,expected,observed,status:pass?'PASS':'FAIL',at:new Date().toISOString()});};
  const login=async(key)=>{const a=f.actors[key],r=await request('/api/auth/login',{tenantId:a.tenantId,email:a.email,password:f.password});assert.equal(r.status,200);return r.cookie;};
  try {
   let r=await request('/api/tenants',{name:'Synthetic prospect'});record('A01','Axiom operator','Provisioning is unavailable via public endpoint; acquisition handoff remains assisted',r.status,r.status===404);
   r=await request('/api/auth/login',{email:f.actors.admin.email,password:f.password});record('A02','Client admin','Observe missing Tenant ID rejection',r.status,r.status===400);
   const admin=await login('admin'),foreign=await login('foreignAdmin');
   record('A03','Client admin','Normal password authentication after assisted bootstrap','HTTP 200',true);
   r=await request('/api/projects',{name:'SYNTHETIC Northbank Pump Station',crewBuild:'FULL'},admin);record('A04','Client admin','Create project through application API',r.status,r.status===201);assert.equal(r.status,201);const project=r.body.project.id;
   r=await request('/api/projects',{name:'SYNTHETIC Second Project',crewBuild:'FULL'},admin);assert.equal(r.status,201);const otherProject=r.body.project.id;
   r=await request('/api/companies',{name:'SYNTHETIC Precision Earthworks',type:'SUBCONTRACTOR'},admin);assert.equal(r.status,201);const company=r.body.company.id;
   r=await request(`/api/projects/${project}/companies`,{companyId:company,confirmed:true},admin);assert.equal(r.status,200,JSON.stringify(r.body));
   r=await request(`/api/projects/${project}/invites`,{email:'intruder@rehearsal.example.test',companyId:company},foreign);record('A05','Foreign admin','Other tenant cannot invite into client project',r.status,[403,404].includes(r.status));
   const invite=async(email)=>{const response=await request(`/api/projects/${project}/invites`,{email,companyId:company},admin);assert.equal(response.status,201);return response.body.inviteToken;};
   const email='requester-'+runId+'@rehearsal.example.test',token=await invite(email);
   const body={tenantId:f.tenant,email,password:f.password,name:'Riley Chen — subcontractor requester',inviteToken:token};
   for(const [id,patch,label] of [['A06',{tenantId:f.foreignTenant},'wrong tenant'],['A07',{email:'wrong@rehearsal.example.test'},'wrong email'],['A08',{companyId:f.foreignCompany},'wrong company'],['A09',{inviteToken:randomBytes(32).toString('hex')},'altered token']]) {
    r=await request('/api/auth/register',{...body,...patch});record(id,'Invite recipient','Reject '+label,r.status,r.status===400);
   }
   r=await request('/api/auth/register',{...body,projectId:otherProject,role:'TENANT_ADMIN'},foreign);record('A10','Invite recipient with foreign session','Create only token-bound requester despite extra role/project fields',r.status,r.status===201);assert.equal(r.status,201);const user=r.body.user.id;
   const membership=(await db.query('SELECT project_id,role FROM project_memberships WHERE user_id=$1',[user])).rows;
   record('A11','Invite recipient','Exactly one token-bound REQUESTER membership',membership,membership.length===1&&membership[0].project_id===project&&membership[0].role==='REQUESTER');
   const authority=(await db.query('SELECT count(*)::int AS n FROM tenant_memberships WHERE user_id=$1',[user])).rows[0].n;record('A12','Invite recipient','No tenant authority granted by supplied role',authority,authority===0);
   r=await request('/api/auth/register',body);record('A13','Invite recipient','Used invite cannot be accepted again',r.status,r.status===400);
   for(const [id,type] of [['A14','expired'],['A15','canceled']]) {
    const address=type+'-'+runId+'@rehearsal.example.test',t=await invite(address);
    await db.query(type==='expired'?"UPDATE invites SET expires_at=NOW()-INTERVAL '1 day' WHERE token=$1":"UPDATE invites SET canceled_at=NOW() WHERE token=$1",[t]);
    r=await request('/api/auth/register',{...body,email:address,inviteToken:t});record(id,'Invite recipient','Reject '+type+' invitation (state arranged in owned fixture)',r.status,r.status===400);
   }
   const existingToken=await invite(email);r=await request('/api/auth/register',{...body,inviteToken:existingToken});record('A16','Existing requester','Observe existing-account invitation behavior',r.status,[400,409].includes(r.status));
   const requester=await request('/api/auth/login',{tenantId:f.tenant,email,password:f.password});assert.equal(requester.status,200);
   r=await request('/api/projects',{name:'Unauthorized project'},requester.cookie);record('A17','Requester','Cannot create tenant project',r.status,r.status===403);
   r=await request('/api/projects',undefined,foreign);record('A18','Foreign admin','No primary tenant projects in discovery',r.body.projects,!r.body.projects.some(p=>p.id===project));
   await db.query('UPDATE users SET session_version=session_version+1 WHERE id=$1',[user]);
   r=await request('/api/projects',undefined,requester.cookie);record('A19','Requester','Old real login session rejected after fixture revocation',r.status,r.status===401);
   await persist(root+'/automated-context.json',{project,otherProject,company,user});
  } finally {
   db.release();await fs.mkdir('audits/customer-lifecycle-rehearsal',{recursive:true});
   await persist('audits/customer-lifecycle-rehearsal/automated-results.json',{baseline,runAt:new Date().toISOString(),scope:'Initial provisioning/authentication/invitation wave only; not full lifecycle acceptance',assisted:['Tenant and first admin SQL bootstrap','Expiry/cancellation/session-version fixture arrangement'],results});
  }
  console.log(JSON.stringify({checks:results.length,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length}));
  if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
 } else throw Error('Use setup or http. No implicit reset or cleanup.');
}finally{await pool.end();}
