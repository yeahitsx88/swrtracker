import {playwrightModuleURL} from '../playwright-runtime.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {Pool} from 'pg';
import jwt from 'jsonwebtoken';
assert.equal(process.env.SWR_D7_TEST,'1');
const origin='http://127.0.0.1:3214',own=JSON.parse(await fs.readFile('.local/alpha-acceptance197/ownership.json','utf8'));
assert.equal(own.owner,'Alpha acceptance197');assert.equal(own.hostPort,15500);assert.match(own.container,/^swr-alpha-acceptance197-db-[a-f0-9]{8}$/);
const settings=Object.fromEntries((await fs.readFile('.local/alpha-acceptance197/production-correct/runtime.env','utf8')).split(/\r?\n/).filter(s=>s.includes('=')).map(s=>{const i=s.indexOf('=');return [s.slice(0,i),s.slice(i+1)];}));
const url=new URL(settings.DATABASE_URL);assert.equal(url.port,'15500');assert.equal(url.pathname,'/swr_team_isolated');url.hostname='127.0.0.1';
const pool=new Pool({connectionString:url.href}),tenant=randomUUID(),company=randomUUID(),template=randomUUID(),people={admin:randomUUID(),central:randomUUID()},projects={SETUP:randomUUID(),ACTIVE:randomUUID(),ARCHIVED:randomUUID()},tokens={};
const checks=[],captures=[],errors=[];
function check(value,message){assert(value,message);checks.push(message);}
await pool.query("INSERT INTO tenants(id,name) VALUES($1,'Owned D7 199')",[tenant]);
await pool.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'Owned D7 GC','GC')",[company,tenant]);
await pool.query("INSERT INTO project_templates(id,tenant_id,name,crew_build,aor_depth,aor_level_labels,discipline_groups) VALUES($1,$2,'Established D7 template','FULL',1,'[\"Area\"]','[]')",[template,tenant]);
for(const [who,id] of Object.entries(people)){
 await pool.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,$5,'fixture')",[id,tenant,company,id+'@example.test','D7 '+who]);
 tokens[who]=jwt.sign({sub:id,tenantId:tenant,sv:1},settings.JWT_SECRET,{expiresIn:'1h'});
}
await pool.query("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'TENANT_ADMIN')",[tenant,people.central]);
for(const [status,id] of Object.entries(projects)){
 await pool.query('INSERT INTO projects(id,tenant_id,name,status,crew_build,template_id) VALUES($1,$2,$3,$4,\'FULL\',$5)',[id,tenant,'Owned D7 '+status,status,template]);
 await pool.query('INSERT INTO project_companies(tenant_id,project_id,company_id,associated_by) VALUES($1,$2,$3,$4)',[tenant,id,company,people.central]);
 for(const person of Object.values(people))await pool.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'REQUESTER')",[id,person]);
 await pool.query("INSERT INTO project_admin_grants(tenant_id,project_id,user_id,origin,granted_by) VALUES($1,$2,$3,'EXPLICIT',$4)",[tenant,id,people.admin,people.central]);
}
const {chromium}=await import(playwrightModuleURL),browser=await chromium.launch({channel:'msedge',headless:true});
try{
 for(const who of ['admin','central'])for(const mode of ['LIGHT','DARK'])for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});await context.addCookies([{name:'swr_session',value:tokens[who],url:origin,httpOnly:true,sameSite:'Lax'}]);
  assert.equal((await context.request.put(origin+'/api/account/appearance',{data:{scope:'PERSONAL',mode},headers:{'Idempotency-Key':randomUUID()}})).status(),200);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/projects/'+projects.SETUP+'/admin/settings');
  const heading=page.getByRole('heading',{name:'Project Template',exact:true});await heading.waitFor();await heading.scrollIntoViewIfNeeded();
  await page.getByText('Governing template selection is locked.',{exact:false}).waitFor();check(await page.getByRole('button',{name:'Review template selection',exact:true}).count()===0,who+' no rejected selection '+mode+' '+width);
  check(await page.getByRole('combobox',{name:'Applicable template (Setup only)'}).count()===0,'No template switch form '+who+' '+mode+' '+width);
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No page overflow '+who+' '+mode+' '+width);
  const reference=page.getByText('Template ID',{exact:true});await reference.focus();await page.keyboard.press('Enter');await page.getByText(template,{exact:true}).waitFor();check(await reference.evaluate(el=>el.parentElement.open),'Keyboard exposes governed template identifier');
  const path='.impeccable/review/d7-'+who+'-'+mode.toLowerCase()+'-'+width+'.png';await page.screenshot({path});captures.push(path);
  await context.close();
 }
 for(const who of ['admin','central']){
  const context=await browser.newContext();await context.addCookies([{name:'swr_session',value:tokens[who],url:origin}]);
  for(const id of Object.values(projects))check((await context.request.patch(origin+'/api/projects/'+id+'/template',{data:{templateId:template,confirmed:true},headers:{'Idempotency-Key':randomUUID()}})).status()===(who==='admin'&&id!==projects.ARCHIVED?403:409),'Actual HTTP denies '+who+' established '+id);
  await context.close();
 }
 assert.deepEqual(errors,[]);const rows=(await pool.query('SELECT template_id,crew_build FROM projects WHERE tenant_id=$1',[tenant])).rows;check(rows.length===3&&rows.every(r=>r.template_id===template&&r.crew_build==='FULL'),'Actual project configuration preserved');
 await fs.writeFile('.local/d1-d8/browser-receipt.json',JSON.stringify({checks,captures,errors,tenant,projects},null,2));console.log('D7 current browser checks: '+checks.length+'; captures: '+captures.length);
}finally{await browser.close();await pool.end();}
