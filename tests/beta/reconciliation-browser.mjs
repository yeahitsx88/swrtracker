// Actual live Team Management entry and identity/navigation; no prototype harness.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
assert.equal(process.env.SWR_RECONCILIATION,'1');
assert(process.env.SWR_PLAYWRIGHT_MODULE,'SWR_PLAYWRIGHT_MODULE is required before any fixture mutation');
const {chromium}=await import(pathToFileURL(process.env.SWR_PLAYWRIGHT_MODULE).href);
const f=JSON.parse(await readFile('.local-reconciliation-fixture.json','utf8'));assert.match(f.schema,/^reconcile_http_[a-f0-9]{32}$/);assert.equal(f.origin,'http://127.0.0.1:3320');
const origin='https://127.0.0.1:3321',browser=await chromium.launch({channel:'msedge',headless:true}),checks=[],captures=[],errors=[];
const check=(value,label)=>{assert(value,label);checks.push(label);};
async function login(who,width=1440){const context=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true,reducedMotion:'reduce'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/login?returnTo='+encodeURIComponent('/projects/'+f.project));await page.getByLabel('Tenant ID',{exact:true}).fill(f.tenant);await page.getByLabel('Email',{exact:true}).fill(f.people[who]+'@reconciliation.invalid');await page.getByLabel('Password',{exact:true}).fill(f.password);
 const response=page.waitForResponse(r=>r.url()===origin+'/api/auth/login'&&r.request().method()==='POST');await page.getByRole('button',{name:'Sign In',exact:true}).press('Enter');check((await response).status()===200,who+' actual credential login');await page.waitForURL(url=>!url.pathname.startsWith('/login'));return {context,page};}
async function capture(page,name){check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' has contained document width');const p='.local/reconciliation-captures/'+name+'.png';await page.screenshot({path:p});captures.push(p);}
try{
 for(const who of ['requester','viewer','superintendent','chief','instrument','tenantOnly']){const {context,page}=await login(who,who==='viewer'?390:1440);await page.goto(origin+'/projects/'+f.project);check(await page.locator('main').count()>0,who+' current authenticated project navigation');await capture(page,'role-'+who);await context.close();}
 const {context,page}=await login('manager');await page.goto(origin+'/projects/'+f.project+'/survey/teams');
 const launcher=page.getByRole('button',{name:'Open Visual Editor',exact:true});await launcher.waitFor();await launcher.press('Enter');await page.locator('.org-chart').waitFor();
 check(await page.locator('[data-person="'+f.people.instrument+'"]').count()===1,'Live entry shows current fixture Instrument Man');check(await page.getByText('Jordan Morgan',{exact:true}).count()===0,'Live chart contains no synthetic demo default');
 await capture(page,'live-chart-light-desktop');
 await page.locator('[data-person="'+f.people.instrument+'"] .org-card-actions button').click();
 await page.getByRole('dialog').last().getByRole('button',{name:/Acceptance otherChief/}).click();await page.getByRole('heading',{name:'Review Visual Crew Reassignment',exact:true}).waitFor();
 await page.getByRole('button',{name:'Cancel proposed move',exact:true}).click();check(await page.getByRole('heading',{name:'Review Visual Crew Reassignment',exact:true}).count()===0,'Live visual cancellation discards proposal');
 await page.getByRole('button',{name:'Close organization chart',exact:true}).press('Enter');check(await launcher.evaluate(e=>e===document.activeElement),'Live entry returns keyboard focus');
 // Color/theme persisted through existing account API; no product design change.
 const appearance=await context.request.put(origin+'/api/account/appearance',{headers:{'Idempotency-Key':randomUUID()},data:{scope:'PERSONAL',mode:'DARK'}});check(appearance.status()===200,'Manager selects Dark through current appearance API; got '+appearance.status());await page.reload();await page.setViewportSize({width:390,height:1000});await launcher.click();await page.locator('.org-chart').waitFor();await capture(page,'live-chart-dark-mobile');await page.getByRole('button',{name:'Close organization chart',exact:true}).click();
 await page.goto(origin+'/projects/'+f.archivedProject+'/survey/teams');const readOnly=page.getByRole('button',{name:/Open Survey Organization Chart \(Read-Only\)/});await readOnly.waitFor();await readOnly.click();await page.locator('.org-chart').waitFor();check(await page.locator('.org-card-actions').count()===0,'Archived live chart provides no move controls');await capture(page,'archived-chart-dark-mobile');await context.close();
 check(errors.length===0,'No browser page errors');
 await writeFile('audits/alpha1-reconciliation/browser-acceptance.json',JSON.stringify({checks,captureNames:captures.map(p=>p.split('/').at(-1)),fixtureKind:'fresh owned synthetic',entry:'actual /projects/[projectId]/survey/teams',limits:['Live commit/exact retry is a separate named case; this receipt covers credential navigation, live proposal cancellation, keyboard return and read-only states.']},null,2)+'\n');
 console.log('Live browser acceptance: '+checks.length+' named checks');
}finally{await browser.close();}
