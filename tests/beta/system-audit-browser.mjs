import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {Pool} from 'pg';
import jwt from 'jsonwebtoken';
assert.equal(process.env.SWR_D8_TEST,'1');const origin='http://127.0.0.1:3215';
const own=JSON.parse(await fs.readFile('.local/alpha-acceptance197/ownership.json','utf8'));assert.equal(own.owner,'Alpha acceptance197');assert.equal(own.hostPort,15500);assert.match(own.container,/^swr-alpha-acceptance197-db-[a-f0-9]{8}$/);
const settings=Object.fromEntries((await fs.readFile('.local/alpha-acceptance197/production-correct/runtime.env','utf8')).split(/\r?\n/).filter(s=>s.includes('=')).map(s=>{const i=s.indexOf('=');return [s.slice(0,i),s.slice(i+1)];}));
const url=new URL(settings.DATABASE_URL);assert.equal(url.port,'15500');assert.equal(url.pathname,'/swr_team_isolated');url.hostname='127.0.0.1';process.env.DATABASE_URL=url.href;process.env.JWT_SECRET=settings.JWT_SECRET;
const pg=new Pool({connectionString:url.href}),tenant=randomUUID(),foreign=randomUUID(),company=randomUUID(),project=randomUUID(),requester=randomUUID(),manager=randomUUID(),ticket=randomUUID(),level=randomUUID(),area=randomUUID();
const checks=[],captures=[],errors=[];function check(value,label){assert(value,label);checks.push(label);}
await pg.query("INSERT INTO tenants(id,name) VALUES($1,'Owned D8 browser'),($2,'Owned foreign D8')",[tenant,foreign]);
await pg.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'Owned GC','GC')",[company,tenant]);
await pg.query("INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,'Owned system history','ACTIVE','FULL')",[project,tenant]);
for(const [id,name] of [[requester,'D8 Requester'],[manager,'D8 Manager']])await pg.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,$5,'fixture')",[id,tenant,company,id+'@example.test',name]);
await pg.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'REQUESTER'),($1,$3,'SURVEY_MANAGER')",[project,requester,manager]);
await pg.query("INSERT INTO aor_levels(id,tenant_id,project_id,depth,label) VALUES($1,$2,$3,0,'Area')",[level,tenant,project]);
await pg.query("INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,name,code) VALUES($1,$2,$3,$4,'Owned Area','D8')",[area,tenant,project,level]);
await pg.query("INSERT INTO tickets(id,tenant_id,project_id,company_id,requester_id,aor_node_id,ticket_type,requested_date,workflow_variant,status,craft,description,ticket_number,submitted_at,first_submitted_at) VALUES($1,$2,$3,$4,$5,$6,'LAYOUT',CURRENT_DATE+7,'STANDARD_APPROVAL','SUBMITTED','Survey','Owned system audit verification','D8-0001',NOW()-interval '72 hours',NOW()-interval '72 hours')",[ticket,tenant,project,company,requester,area]);
await pg.query("INSERT INTO ticket_events(tenant_id,ticket_id,actor_id,event_type,payload) VALUES($1,$2,$3,'ticket.submitted','{}')",[tenant,ticket,requester]);
const {runNotificationWorkerCycle}=await import('../../src/modules/notification/application/worker.ts'),{NotificationRepository}=await import('../../src/modules/notification/infrastructure/index.ts'),{PgBackgroundJobRunRepository}=await import('../../src/modules/notification/infrastructure/job-run.repository.ts'),{withTenantNotificationTransaction}=await import('../../src/lib/notification-worker-transaction.ts'),{getPool}=await import('../../src/lib/db.ts');
const repo=new NotificationRepository(),sent=[];process.env.SYSTEM_ACTOR_ID=requester;
const result=await runNotificationWorkerCycle({db:getPool(),runRepo:new PgBackgroundJobRunRepository(),transport:{send:async message=>{sent.push(message);}},withTenantLifecycle:withTenantNotificationTransaction,repo:{listApproverTimeoutCandidates:(db,now,scope)=>repo.listApproverTimeoutCandidates(db,now,scope??tenant),listVacancyEscalationCandidates:async()=>[],listOrphanWorkflowCandidates:async()=>[],reassignOrphanWorkflowTicket:async()=>{throw Error('Unexpected reassignment');}}});
check(result.unlockedCount===1&&sent.length===1,'Actual bounded background dispatch emits one system escalation');
const rows=(await pg.query('SELECT actor_id,actor_kind FROM ticket_events WHERE tenant_id=$1 AND ticket_id=$2 ORDER BY created_at,id',[tenant,ticket])).rows;check(rows.length===2&&rows.some(r=>r.actor_kind==='SYSTEM'&&r.actor_id===null)&&rows.some(r=>r.actor_kind==='USER'&&r.actor_id===requester),'Configured employee is ignored; human submission retained');
const {chromium}=await import(pathToFileURL(process.env.SWR_PLAYWRIGHT_MODULE).href),browser=await chromium.launch({channel:'msedge',headless:true}),token=jwt.sign({sub:requester,tenantId:tenant,sv:1},settings.JWT_SECRET,{expiresIn:'1h'});
try{
 for(const mode of ['LIGHT','DARK'])for(const width of [1440,390]){
  const c=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});await c.addCookies([{name:'swr_session',value:token,url:origin}]);
  assert.equal((await c.request.put(origin+'/api/account/appearance',{data:{scope:'PERSONAL',mode},headers:{'Idempotency-Key':randomUUID()}})).status(),200);
  const response=await c.request.get(origin+'/api/tickets/'+ticket+'/history');assert.equal(response.status(),200);const body=await response.json();check(body.history.some(e=>e.actor?.kind==='SYSTEM'&&e.actor.name==='SWRTracker System'&&e.actor.id===null),'Authenticated history canonical system identity '+mode+' '+width);check(body.history.some(e=>e.actor?.id===requester&&e.actor.name==='D8 Requester'),'Human attribution preserved '+mode+' '+width);
  const page=await c.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/projects/'+project+'/tickets/'+ticket);const system=page.getByText('SWRTracker System',{exact:true}).first();await system.waitFor();await system.scrollIntoViewIfNeeded();check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Contained history table '+mode+' '+width);const path='.impeccable/review/d8-history-'+mode.toLowerCase()+'-'+width+'.png';await page.screenshot({path});captures.push(path);await c.close();
 }
 assert.deepEqual(errors,[]);await fs.writeFile('.local/d1-d8/d8/browser-receipt.json',JSON.stringify({checks,captures,errors,tenant,project,ticket},null,2));console.log('D8 actual worker/HTTP/browser checks: '+checks.length+'; captures: '+captures.length);
}finally{await browser.close();await pg.end();await getPool().end();}
