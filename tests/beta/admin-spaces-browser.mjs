// Explicitly opted-in, newly owned design fixture. Never changes retained demo state.
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {pathToFileURL} from 'node:url';import {randomUUID} from 'node:crypto';import jwt from 'jsonwebtoken';
assert.equal(process.env.SWR_ADMIN_DESIGN,'1');const origin=process.env.SWR_ACCEPTANCE_ORIGIN;assert.equal(origin,'http://127.0.0.1:3125');
const f=JSON.parse(await fs.readFile('.local-admin-fixture.json','utf8')),retained=JSON.parse(await fs.readFile('.local-demo-fixture.json','utf8'));assert.match(f.schema,/^phase5_acceptance_[a-f0-9]{32}$/);assert.notEqual(f.schema,retained.schema);assert.ok(f.enriched);
const {chromium}=await import(pathToFileURL(process.env.SWR_PLAYWRIGHT_MODULE).href);const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),captures=[],checks=[];
const out='.impeccable/review/administration/current';await fs.mkdir(out,{recursive:true});
async function shot(page,name){await page.evaluate(()=>window.scrollTo(0,0));await page.evaluate(()=>document.fonts.ready);const file=out+'/'+name+'.png';await page.screenshot({path:file,fullPage:true});captures.push(file);}
async function context(role,theme,width){const c=await browser.newContext({viewport:{width,height:884},colorScheme:theme,reducedMotion:'reduce'});await c.addCookies([{name:'swr_session',value:jwt.sign({sub:f[role],tenantId:f.tenant,sv:1},process.env.JWT_SECRET,{expiresIn:'1h'}),url:origin}]);const response=await c.request.put(origin+'/api/account/appearance',{headers:{'Idempotency-Key':randomUUID()},data:{scope:'PERSONAL',mode:theme.toUpperCase()}});assert.equal(response.status(),200);return c;}
try{
 for(const [role,route,title]of [['itOnly','/accounts','Tenant Accounts and Central IT Reviews'],['localAdmin',`/projects/${f.project}/admin`,'Project Administration']])for(const theme of ['light','dark'])for(const width of [1864,797,390]){
  const c=await context(role,theme,width),p=await c.newPage();await p.goto(origin+route);await p.getByRole('heading',{name:title,exact:true,level:1}).waitFor();await p.waitForLoadState('networkidle');
  assert.equal(await p.getByRole('button',{name:'Menu',exact:true}).count(),0);assert.equal(await p.locator('html').evaluate(e=>e.scrollWidth<=window.innerWidth+1),true,'Document overflow');
  assert.equal(await p.locator('.heading-with-help > .heading-help-trigger').count()>0,true);assert.equal(await p.locator('.administration-jump-links a').count()>=2,true);
  if(role==='itOnly')assert.equal(await p.locator('.project-sidebar').getByRole('link',{name:'Tenant Accounts',exact:true,includeHidden:true}).count(),1);
  else assert.equal(await p.locator('.project-sidebar').getByRole('link',{name:'Tenant Accounts',exact:true,includeHidden:true}).count(),0);
  for(const table of await p.locator('.record-scrollable:visible').all())assert.ok(await table.evaluate(e=>e.clientHeight<=354));
  for(const badge of await p.locator('.administration-state-column .badge:visible').all())assert.equal(await badge.evaluate(e=>getComputedStyle(e).whiteSpace),'nowrap');
  await shot(p,`${role}-${theme}-${width}`);checks.push(`${role} ${theme} ${width}: shell, headings/help, anchors, containment, badges`);
  if(role==='localAdmin'&&theme==='light'&&width===1864){
   const input=p.getByRole('textbox',{name:'Filter eligible accounts',exact:true});await input.fill('retained navigation text');await p.getByRole('navigation',{name:'Project Administration sections'}).getByRole('link',{name:'Companies',exact:true}).click();assert.equal(await input.inputValue(),'retained navigation text');await input.fill('');
   await p.getByRole('button',{name:'Project Members and Access',exact:true}).click();await p.getByRole('button',{name:'Independent Project Admin Assignments',exact:true}).click();await shot(p,'project-members-and-grants-desktop');
   const row=p.getByRole('row').filter({hasText:'Duty Superintendent'}).first();await row.getByRole('button',{name:'Preview access removal',exact:true}).click();await p.getByText('Resolve these blockers before disabling access:', {exact:true}).waitFor();await p.waitForLoadState('networkidle');await shot(p,'project-access-blockers-desktop');checks.push('Section navigation retains editor values; project scope and actual blocker preview remain visible');
  }
  if(role==='itOnly'&&theme==='light'&&width===390){await p.getByRole('button',{name:'Open review',exact:true}).first().click();await p.getByText('Original local lifecycle evidence:',{exact:false}).waitFor();await shot(p,'central-review-mobile');checks.push('Durable Central IT review presents original local evidence and separate tenant decision');}
  await c.close();
 }
 for(const [role,route,name]of [['projectAdmin',`/projects/${f.setupProject}/admin`,'setup-admin-desktop'],['projectAdmin',`/projects/${f.archivedProject}/admin`,'archived-admin-desktop'],['itOnly','/projects','it-project-inventory-desktop']]){
  const c=await context(role,'light',1864),p=await c.newPage();await p.goto(origin+route);await p.waitForLoadState('networkidle');assert.equal(await p.locator('html').evaluate(e=>e.scrollWidth<=window.innerWidth+1),true);
  if(name.startsWith('setup'))await p.getByRole('heading',{name:'Project Setup',exact:true}).waitFor();
  if(name.startsWith('archived')){await p.getByText('This archived project retains history.',{exact:false}).waitFor();assert.equal(await p.getByRole('heading',{name:'Project Access Settings',exact:true}).count(),0);}
  await shot(p,name);checks.push(name+': current authority and lifecycle affordances');await c.close();
 }
 const c=await context('manager','light',1864);for(const route of['/api/accounts',`/api/projects/${f.project}/diagnostics`])assert.equal((await c.request.get(origin+route)).status(),403);await c.close();checks.push('Manager without independent grant denied Tenant IT and project diagnostics APIs');
 await fs.writeFile('.local-admin-ui-results.json',JSON.stringify({checks,captures},null,2));console.log(`Administrative design browser checks passed: ${checks.length}; settled captures: ${captures.length}`);
}finally{await browser.close();}
