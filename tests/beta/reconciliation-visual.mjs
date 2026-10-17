import {playwrightModuleURL} from '../playwright-runtime.mjs';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
assert.equal(process.env.SWR_RECONCILIATION,'1');
const f=JSON.parse(await readFile('.local-reconciliation-fixture.json','utf8'));assert.match(f.schema,/^reconcile_http_[a-f0-9]{32}$/);assert.equal(f.origin,'http://127.0.0.1:3320');
const {chromium}=await import(playwrightModuleURL),browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000},ignoreHTTPSErrors:true,reducedMotion:'reduce'}),page=await context.newPage(),origin='https://127.0.0.1:3321',checks=[],errors=[];
await context.addCookies([{name:'swr_session',value:f.tokens.manager,url:origin,httpOnly:true,sameSite:'Lax'}]);page.on('pageerror',e=>errors.push(e.message));
try{
 for(const mode of ['LIGHT','DARK']){assert.equal((await context.request.put(origin+'/api/account/appearance',{headers:{'Idempotency-Key':randomUUID()},data:{scope:'PERSONAL',mode}})).status(),200);
  for(const width of [1440,390])for(const [label,path]of [['home','/home'],['operations','/survey/operations'],['review','/survey/review']]){
   await page.setViewportSize({width,height:1000});await page.goto(origin+'/projects/'+f.project+path);await page.waitForLoadState('networkidle');assert(!/Loading (?:your project workspace|authorized requests|queue health|requests)/.test(await page.locator('main').innerText()),'Capture requires loaded '+label);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'.local/reconciliation-captures/alignment-'+label+'-'+mode.toLowerCase()+'-'+width+'.png'});checks.push(label+' '+mode+' '+width+' loaded and contained');
  }
 }
 assert.equal(errors.length,0);await writeFile('audits/alpha1-reconciliation/visual-inspection.json',JSON.stringify({checks,pageErrors:errors,renderedFrom:'shipping Docker runtime, owned project fixture',limits:['Desktop/mobile Edge viewports in both themes; visual contact-sheet inspection is separately recorded in final receipt.']},null,2)+'\n');console.log('Loaded visual acceptance: '+checks.length+' cases');
}finally{await browser.close();}
