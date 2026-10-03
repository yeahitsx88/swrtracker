import assert from 'node:assert/strict';
import {Pool} from 'pg';
import jwt from 'jsonwebtoken';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const url=new URL(process.env.DATABASE_URL??'');assert.equal(process.env.SWR_TEAM_POSTGRES,'1');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15489');assert.equal(url.pathname,'/swr_team_isolated');
const f=JSON.parse(await fs.readFile('.local-fixture.json','utf8'));assert.match(f.schema,/^phase5_acceptance_[a-f0-9]{32}$/);
const origin=process.env.SWR_ACCEPTANCE_ORIGIN??'http://127.0.0.1:3113';assert.match(origin,/^http:\/\/127\.0\.0\.1:\d+$/);
const {chromium}=await import(pathToFileURL(process.env.SWR_PLAYWRIGHT_MODULE).href);
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const pg=new Pool({connectionString:url.href}),context=await browser.newContext({viewport:{width:1440,height:1000}});
await context.addCookies([{name:'swr_session',value:jwt.sign({sub:f.actor,tenantId:f.tenant,sv:1},process.env.JWT_SECRET,{expiresIn:'1h',jwtid:randomUUID()}),url:origin,httpOnly:true,sameSite:'Lax'}]);
const page=await context.newPage();page.setDefaultTimeout(15000);let checks=0;const errors=[];page.on('pageerror',error=>errors.push(error.message));
const check=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);checks++;};
const db=await pg.connect();await db.query(`SET search_path TO "${f.schema}",public`);await fs.mkdir('.local-alpha1/browser',{recursive:true});
try{
 if(process.argv[2]==='capture'){
  const capture=randomUUID();await db.query("INSERT INTO users(id,tenant_id,company_id,name,email,password_hash) VALUES($1,$2,$3,'Acceptance requester',$4,'fixture')",[capture,f.tenant,f.company,capture+'@example.test']);await db.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'REQUESTER')",[f.project,capture]);
  for(const [label,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
   const fresh=await browser.newContext({viewport:{width,height}});await fresh.addCookies(await context.cookies());const shot=await fresh.newPage();
   await shot.goto(`${origin}/projects/${f.project}/admin`);await shot.getByRole('button',{name:'Project members and access',exact:true}).click();await shot.getByLabel('Filter project members',{exact:true}).fill('Acceptance requester');await shot.getByRole('row').filter({hasText:capture+'@example.test'}).getByRole('button',{name:'Preview access removal',exact:true}).click();
   const region=shot.getByRole('region',{name:'Remove from this project: Acceptance requester',exact:true});await region.getByLabel(/^Reason /).fill('Confirmed acceptance departure');await region.getByLabel('I confirm: remove from this project for Acceptance requester.',{exact:true}).check();
   await shot.evaluate(async()=>{document.activeElement?.blur();window.scrollTo(0,0);await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);});await shot.screenshot({path:`.local-alpha1/browser/${label}.png`,fullPage:true});
   await shot.goto(origin+'/accounts');await shot.getByLabel('Find a person',{exact:true}).fill('Acceptance requester');await shot.getByRole('row').filter({hasText:capture+'@example.test'}).getByRole('button',{name:'Preview tenant disable',exact:true}).click();await shot.getByRole('region',{name:'Disable tenant account: Acceptance requester',exact:true}).getByLabel(/^Reason /).waitFor();
   await shot.evaluate(async()=>{document.activeElement?.blur();window.scrollTo(0,0);await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);});await shot.screenshot({path:`.local-alpha1/browser/accounts-${label}.png`,fullPage:true});await fresh.close();
  }
  console.log('Final desktop/mobile administration captures complete.');
 }else{
 await page.goto(`${origin}/projects/${f.project}/admin`);await page.getByRole('button',{name:'Project members and access',exact:true}).click();
 await page.getByRole('link',{name:'Survey Operations',exact:true}).waitFor();await page.getByRole('link',{name:'Admin',exact:true}).waitFor();check(await page.getByRole('link',{name:'Admin',exact:true}).count(),1,'Combined-role navigation');
 await page.getByLabel('Filter project members',{exact:true}).fill('Browser departure');
 let initialFailed=false;await page.route(`**/api/projects/${f.project}/members/${f.browserSubject}/offboarding**`,async route=>{if(route.request().method()==='GET'&&!initialFailed){initialFailed=true;return route.fulfill({status:500,json:{error:{type:'InternalError',message:'Synthetic preview load failure'}}});}await route.continue();});
 await page.getByRole('row').filter({hasText:'Browser departure'}).getByRole('button',{name:'Preview access removal',exact:true}).click();
 const flow=page.getByRole('region',{name:'Remove from this project: Browser departure',exact:true});
 await flow.getByText('500: Synthetic preview load failure',{exact:true}).waitFor();await flow.getByRole('button',{name:'Reload evidence',exact:true}).click();checks++;await page.unroute(`**/api/projects/${f.project}/members/${f.browserSubject}/offboarding**`);
 await flow.getByText('No unresolved duty or continuity blockers in this scope.',{exact:true}).waitFor();checks++;
 await flow.getByLabel('Reason (10–1000 characters)',{exact:true}).fill('Confirmed browser project departure');
 await flow.getByLabel('I confirm: remove from this project for Browser departure.',{exact:true}).check();
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'.local-alpha1/browser/desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'.local-alpha1/browser/mobile.png',fullPage:true});
 check(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'Mobile page fits');
 await page.setViewportSize({width:1440,height:1000});
 let lost=true;const captures=[];
 await page.route(`**/api/projects/${f.project}/members/${f.browserSubject}/offboarding`,async route=>{
  if(route.request().method()!=='POST')return route.continue();
  captures.push({body:route.request().postDataJSON(),key:route.request().headers()['idempotency-key']});
  if(lost){lost=false;await route.fetch();await route.abort('failed');}else await route.continue();
 });
 await flow.getByRole('button',{name:'Remove from this project',exact:true}).click();await flow.getByRole('button',{name:'Retry same confirmed action',exact:true}).waitFor();
 check(await flow.getByLabel('Reason (10–1000 characters)',{exact:true}).isDisabled(),true,'Lost response freezes reason');check(await page.getByLabel('Filter project members',{exact:true}).isDisabled(),true,'Lost response freezes parent selection');
 check(await flow.getByRole('button',{name:'Reload evidence',exact:true}).isDisabled(),true,'Cannot replace uncertain intent');
 await flow.getByRole('button',{name:'Retry same confirmed action',exact:true}).click();await flow.getByText('Original confirmed operation replayed: Access disabled. History was retained.',{exact:true}).waitFor();check(await flow.locator('h3').evaluate(el=>document.activeElement===el),true,'Success restores focus to named scope');
 check(captures.length,2,'Only exact retry');check(captures[0],captures[1],'Stable key and immutable displayed body');check(captures[0].body.scope,{kind:'PROJECT_ACCESS',projectId:f.project},'No scope widening');
 check((await db.query('SELECT count(*)::int AS n FROM account_lifecycle_events WHERE subject_user_id=$1',[f.browserSubject])).rows[0].n,1,'No duplicate lifecycle transition');
 await page.unroute(`**/api/projects/${f.project}/members/${f.browserSubject}/offboarding`);
 // A fresh second subject proves every 409 requires deliberate reload and new consent.
 const stale=randomUUID();await db.query("INSERT INTO users(id,tenant_id,company_id,name,email,password_hash) VALUES($1,$2,$3,'Stale browser subject',$4,'fixture')",[stale,f.tenant,f.company,stale+'@example.test']);await db.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'REQUESTER')",[f.project,stale]);
 await page.reload();await page.getByRole('button',{name:'Project members and access',exact:true}).click();
 await page.getByLabel('Filter project members',{exact:true}).fill('Stale browser subject');await page.getByRole('row').filter({hasText:'Stale browser subject'}).getByRole('button',{name:'Preview access removal',exact:true}).click();const staleFlow=page.getByRole('region',{name:'Remove from this project: Stale browser subject',exact:true});await staleFlow.getByLabel('Reason (10–1000 characters)',{exact:true}).fill('Confirmed stale-state browser test');await staleFlow.getByLabel('I confirm: remove from this project for Stale browser subject.',{exact:true}).check();
 await page.route(`**/api/projects/${f.project}/members/${stale}/offboarding`,async route=>{if(route.request().method()==='POST')return route.fulfill({status:409,json:{error:{type:'ConflictError',message:'Synthetic stale state',code:'ANY_STALE'}}});await route.continue();});
 await staleFlow.getByRole('button',{name:'Remove from this project',exact:true}).click();await staleFlow.getByText('The evidence changed. Reload and confirm the displayed scope again.',{exact:true}).waitFor();
 check(await staleFlow.getByRole('button',{name:'Retry same confirmed action',exact:true}).isDisabled(),true,'Every 409 latched');
 await page.unroute(`**/api/projects/${f.project}/members/${stale}/offboarding`);await staleFlow.getByRole('button',{name:'Reload evidence',exact:true}).click();await staleFlow.getByLabel('Reason (10–1000 characters)',{exact:true}).waitFor();check(await staleFlow.getByLabel('I confirm: remove from this project for Stale browser subject.',{exact:true}).isChecked(),false,'Reload clears consent');
 await page.goto(origin+'/accounts');await page.getByLabel('Find a person',{exact:true}).fill('Browser departure');await page.getByRole('row').filter({hasText:'Browser departure'}).getByRole('button',{name:'Preview tenant disable',exact:true}).click();const tenant=page.getByRole('region',{name:'Disable tenant account: Browser departure',exact:true});await tenant.getByText('No unresolved duty or continuity blockers in this scope.',{exact:true}).waitFor();check(await tenant.getByText('This disables access across this tenant.',{exact:false}).count(),1,'Tenant scope explicit');
 await page.getByRole('button',{name:'Open review',exact:true}).waitFor();await page.getByRole('button',{name:'Open review',exact:true}).first().click();await page.getByRole('button',{name:'Open separate tenant account decision',exact:true}).click();
 const tenantEditors=page.getByRole('region',{name:'Disable tenant account: Browser departure',exact:true});await tenantEditors.nth(1).getByLabel(/^Reason /).waitFor();
 await tenantEditors.nth(0).getByLabel(/^Reason /).fill('Confirmed shared ownership acceptance');await tenantEditors.nth(0).getByLabel('I confirm: disable tenant account for Browser departure.',{exact:true}).check();
 let tenantAttempt=0;await page.route(`**/api/accounts/${f.browserSubject}/offboarding`,async route=>{if(route.request().method()!=='POST')return route.continue();tenantAttempt++;if(tenantAttempt===1)return route.abort('failed');return route.fulfill({status:409,json:{error:{type:'ConflictError',message:'Synthetic ownership stale result',code:'STALE'}}});});
 await tenantEditors.nth(0).getByRole('button',{name:'Disable tenant account',exact:true}).click();await tenantEditors.nth(0).getByRole('button',{name:'Retry same confirmed action',exact:true}).waitFor();
 check(await tenantEditors.nth(1).getByLabel(/^Reason /).isDisabled(),true,'Same-person mounted sibling frozen');check(await page.getByLabel('Review resolution reason (10–1000 characters)',{exact:true}).isDisabled(),true,'Open review frozen by account editor');
 check(await tenantEditors.nth(1).getByRole('button',{name:'Reload evidence',exact:true}).isDisabled(),true,'Sibling cannot release another editor');
 await tenantEditors.nth(0).getByRole('button',{name:'Retry same confirmed action',exact:true}).click();await tenantEditors.nth(0).getByText('The evidence changed. Reload and confirm the displayed scope again.',{exact:true}).waitFor();await page.unroute(`**/api/accounts/${f.browserSubject}/offboarding`);await tenantEditors.nth(0).getByRole('button',{name:'Reload evidence',exact:true}).click();await tenantEditors.nth(0).getByLabel(/^Reason /).waitFor();
 await page.getByLabel('Review resolution reason (10–1000 characters)',{exact:true}).fill('Project departure needs no tenant action');await page.getByLabel('I confirm this review resolution.',{exact:true}).check();check(await page.getByRole('button',{name:'Link separately confirmed tenant disable',exact:true}).isDisabled(),true,'Review cannot imply tenant disable');await page.getByRole('button',{name:'No further action',exact:true}).click();await page.getByText('Review resolved. No account action was inferred.',{exact:true}).waitFor();checks++;
 check((await db.query('SELECT deactivated_at FROM users WHERE id=$1',[f.browserSubject])).rows[0].deactivated_at,null,'No further action preserves account');
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'.local-alpha1/browser/accounts-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'.local-alpha1/browser/accounts-mobile.png',fullPage:true});check(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'Mobile accounts fit');
 await page.goto(`${origin}/projects/${f.archivedProject}/admin`);await page.getByRole('button',{name:'Project members and access',exact:true}).click();await page.getByRole('button',{name:'Preview access removal',exact:true}).click();await page.getByRole('region',{name:'Remove from this project: Departing requester',exact:true}).getByLabel(/^Reason /).waitFor();checks++;
 check(errors,[],'No browser runtime errors');console.log('Scoped offboarding production browser checks passed: '+checks);
 }
}finally{db.release();await pg.end();await browser.close();}
