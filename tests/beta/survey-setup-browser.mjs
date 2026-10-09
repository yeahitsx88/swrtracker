import {playwrightModuleURL} from '../playwright-runtime.mjs';
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {randomUUID} from 'node:crypto';import jwt from 'jsonwebtoken';import {Pool} from 'pg';
assert.equal(process.env.SWR_SURVEY_WORKFLOW_TEST,'1');
const f=JSON.parse(await fs.readFile('.local-survey-ui.json','utf8')),r=JSON.parse(await fs.readFile('.local-survey-roles.json','utf8')),owned=JSON.parse(await fs.readFile('.local-survey-workflow-db.json','utf8'));
const url=new URL(owned.databaseUrl);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15495');assert.equal(url.pathname,'/swr_survey_workflow');assert.equal(f.origin,'http://127.0.0.1:3150');
const db=new Pool({connectionString:url.href}),project=randomUUID();
await db.query("INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,'Fresh survey setup check','ACTIVE','FULL')",[project,f.tenant]);
for(const [id,role] of [[f.manager,'SURVEY_MANAGER'],[r.ss,'SURVEY_SUPERINTENDENT']])await db.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)',[project,id,role]);
const {chromium}=await import(playwrightModuleURL);const browser=await chromium.launch({channel:'msedge',headless:true});
const checks=[];function check(v,label){assert(v,label);checks.push(label);}
async function session(id){const c=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});await c.addCookies([{name:'swr_session',value:jwt.sign({sub:id,tenantId:f.tenant,sv:1},f.secret,{algorithm:'HS256',expiresIn:'1h',jwtid:randomUUID()}),url:f.origin,httpOnly:true,sameSite:'Lax'}]);return c;}
try{
 const manager=await session(f.manager),p=await manager.newPage();const home=`${f.origin}/projects/${project}/home`;
 await p.goto(home);const tip=p.getByRole('complementary',{name:'Survey team setup reminder'});await tip.waitFor();check(true,'Manager without a team sees setup guidance on Home');
 await tip.getByRole('button',{name:'Not now',exact:true}).click();await tip.waitFor({state:'hidden'});check(true,'Reminder can be dismissed without blocking Home');
 await p.reload();await tip.getByRole('link',{name:'Set up your team',exact:true}).click();const guide=p.locator('#survey-setup');await guide.getByRole('button',{name:'Open Areas',exact:true}).waitFor();
 check(await guide.getAttribute('open')!==null,'Home link opens the permanent setup guide');
 await guide.getByRole('button',{name:'Open Areas',exact:true}).click();await p.getByLabel('Area name',{exact:true}).fill('Setup Area');await p.getByLabel('Area code',{exact:true}).fill('SETUP');await p.getByRole('button',{name:'Create Area',exact:true}).click();await p.getByText('Area created. It is available to requesters and teams.',{exact:true}).waitFor();check(true,'Guide leads to working Area creation');
 await guide.getByRole('button',{name:'Open teams',exact:true}).click();check(await p.getByRole('tab',{name:'Teams',exact:true}).getAttribute('aria-selected')==='true','Guide opens team management');
 for(const width of [1440,390]){await p.setViewportSize({width,height:1000});await guide.scrollIntoViewIfNeeded();await p.screenshot({path:`.local-survey-setup-${width}.png`,fullPage:false});check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Setup guide fits '+width+'px viewport');}
 const area=(await db.query('SELECT id FROM aor_nodes WHERE project_id=$1 AND code=$2',[project,'SETUP'])).rows[0].id;
 const created=await manager.request.post(`${f.origin}/api/projects/${project}/survey/teams`,{headers:{'Idempotency-Key':randomUUID()},data:{teamId:null,expectedVersion:null,name:'First team',areaId:area,areaIds:[area],leadUserId:r.ss,memberIds:[r.ss]}});check(created.status()===201,'First team is created through the authorized API');
 await Promise.all([p.waitForResponse(response=>response.url().includes('/survey/teams?')&&response.status()===200),p.goto(home)]);await p.getByRole('button',{name:'Refresh Home',exact:true}).waitFor();check(await tip.count()===0,'Reminder disappears after a real team exists');
 const ss=await session(r.ss),sp=await ss.newPage();await sp.goto(home);await sp.getByRole('button',{name:'Refresh Home',exact:true}).waitFor();check(await sp.getByRole('complementary',{name:'Survey team setup reminder'}).count()===0,'Superintendent is not shown Manager setup guidance');
 console.log(JSON.stringify({checks},null,2));
}catch(error){for(const context of browser.contexts())for(const page of context.pages())console.error((await page.locator('body').innerText()).slice(0,2000));throw error;}finally{await browser.close();await db.end();}
