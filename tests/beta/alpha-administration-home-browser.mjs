import {playwrightModuleURL} from '../playwright-runtime.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
assert.equal(process.env.SWR_ALPHA_HOME_TEST,'207');
const own=JSON.parse(await fs.readFile('.local/alpha-acceptance197/ownership.json','utf8'));assert.equal(own.owner,'Alpha acceptance197');assert.equal(own.hostPort,15500);
const f=JSON.parse(await fs.readFile('.local/alpha-closure206/role-fixture.json','utf8')),origin='http://127.0.0.1:3223';
const {chromium}=await import(playwrightModuleURL),browser=await chromium.launch({channel:'msedge',headless:true}),checks=[],captures=[],errors=[];
function check(v,n){assert(v,n);checks.push(n);}
try{
 const c=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});await c.addCookies([{name:'swr_session',value:f.tokens.tenantOnly,url:origin,httpOnly:true,sameSite:'Lax'}]);
 const identity=await c.request.get(origin+'/api/account');check(identity.status()===200,'Global self-account remains available without project membership');
 check((await c.request.get(origin+'/api/account?projectId='+f.project)).status()===403,'Project-specific assignment profile still requires current membership');
 check((await c.request.get(origin+'/api/tickets?projectId='+f.project)).status()===403,'Independent administration grants no operational request list');
 const page=await c.newPage(),requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(new URL(r.url()).pathname+new URL(r.url()).search));
 for(const mode of ['LIGHT','DARK']){
  check((await c.request.put(origin+'/api/account/appearance',{data:{scope:'PERSONAL',mode},headers:{'Idempotency-Key':randomUUID()}})).status()===200,'Actual personal '+mode);
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:width===390?760:1000});await page.goto(origin+'/projects/'+f.project+'/home');await page.getByRole('heading',{name:'Welcome, Acceptance tenantOnly',exact:true}).waitFor();
   check(await page.locator('.project-context-role').innerText()==='Project administration','Administration label appears exactly once '+mode+width);
   check(await page.locator('.home-workspace [role="alert"]').count()===0,'Ordinary admin-only workspace has no failed-member alert '+mode+width);
   check(await page.locator('.home-stats').count()===0,'No operational Home counts '+mode+width);
   check(await page.getByRole('link',{name:'Open Project Administration',exact:true}).isVisible(),'Existing administration action remains visible '+mode+width);
   check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Contained page overflow '+mode+width);
   await page.getByRole('button',{name:'Refresh Home',exact:true}).focus();check(await page.evaluate(()=>document.activeElement.textContent.includes('Refresh Home')),'Keyboard refresh reachable '+mode+width);
   const path='.impeccable/review/alpha-closure207-admin-only-'+mode.toLowerCase()+'-'+width+'.png';await page.screenshot({path,fullPage:false});captures.push(path);
   if(width===390){await page.getByRole('button',{name:'Project navigation',exact:true}).click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});check(await page.getByRole('button',{name:'Project navigation',exact:true}).evaluate(n=>n===document.activeElement),'Drawer Escape restores focus '+mode);}
  }
 }
 for(const [state,project] of [['SETUP',f.setupProject],['ARCHIVED',f.archivedProject]]){await page.goto(origin+'/projects/'+project+'/home');await page.getByRole('heading',{name:'Welcome, Acceptance tenantOnly',exact:true}).waitFor();check(await page.locator('.home-workspace [role="alert"]').count()===0,state+' admin-only identity has no false error');check(await page.locator('.home-stats').count()===0,state+' remains administration-only');}
 await page.route('**/api/account',r=>r.fulfill({status:503,json:{error:{message:'Owned greeting unavailable',type:'ServiceUnavailableError',code:'OWNED_GREETING_FAILURE'}}}));await page.getByRole('button',{name:'Refresh Home',exact:true}).click();await page.getByRole('alert').filter({hasText:'Owned greeting unavailable'}).waitFor();check(await page.getByRole('link',{name:'Open Project Administration',exact:true}).isVisible(),'Real identity failure remains visible without hiding administration');
 await page.unroute('**/api/account');await page.getByRole('button',{name:'Refresh Home',exact:true}).click();await page.getByRole('heading',{name:'Welcome, Acceptance tenantOnly',exact:true}).waitFor();check(await page.locator('.home-workspace [role="alert"]').count()===0,'Actual refresh recovers identity read');
 check(!requests.some(p=>p.startsWith('/api/account?projectId=')),'Home requests only self identity, no project assignment profile');
 check(!requests.some(p=>p.startsWith('/api/tickets?')||p.includes('/metrics?')),'Admin-only Home never requests ordinary project workload');
 const combined=await browser.newContext();await combined.addCookies([{name:'swr_session',value:f.tokens.requesterAdmin,url:origin,httpOnly:true,sameSite:'Lax'}]);const other=await combined.newPage();await other.goto(origin+'/projects/'+f.project+'/home');await other.locator('.home-stats').waitFor();check(await other.locator('.project-context-role').innerText()==='Requester \u00b7 Project administration','Combined operational and independent authority both remain labeled');await combined.close();
 check(errors.length===0,'No runtime page errors');await fs.writeFile('.local/alpha-closure207/browser-results.json',JSON.stringify({checks,captures,pageErrors:errors},null,2));console.log('Administration-only Home: '+checks.length+' checks, '+captures.length+' captures');await c.close();
}finally{await browser.close();}
