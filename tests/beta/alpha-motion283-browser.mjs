import {playwrightModuleURL} from '../playwright-runtime.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
assert.equal(process.env.SWR_ALPHA_ACCEPTANCE,'283');
const dir='.local/alpha-closure283';
await fs.mkdir(dir,{recursive:true});
assert.equal(await fs.stat(dir+'/motion-results.json').then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e}),false,'Preserve completed receipt');
const f=JSON.parse(await fs.readFile('.local/alpha-closure282/role-fixture.json','utf8'));
assert.match(f.schema,/^alpha_tables282_[a-f0-9]{32}$/);
assert.equal(f.origin,'http://127.0.0.1:3315');
const {chromium}=await import(playwrightModuleURL);
const browser=await chromium.launch({channel:'msedge',headless:true}),checks=[],errors=[];
async function check(value,label){assert(value,label);checks.push(label);await fs.writeFile(dir+'/motion-progress.json',JSON.stringify({checks,errors}));}
try {
 for(const [who,width] of [['manager',1440],['viewer',390]])for(const motion of ['reduce','no-preference']) {
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:motion});
  await context.addCookies([{name:'swr_session',value:f.tokens[who],url:f.origin,httpOnly:true,sameSite:'Lax'}]);
  await context.addInitScript(()=>{window.__pageFades=[];const original=Element.prototype.animate;Element.prototype.animate=function(frames,options){if(this.classList.contains('project-page'))window.__pageFades.push({path:location.pathname,duration:options.duration});return original.call(this,frames,options);};});
  const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(f.origin+'/projects/'+f.project+'/requests?view=requests');
  await p.getByRole('region',{name:'Filtered requests',exact:true}).locator('tbody tr').first().waitFor();
  await check(await p.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches)===(motion==='reduce'),who+' '+motion+' actual browser preference');
  if(width===390)await p.getByRole('button',{name:'Project navigation',exact:true}).click();
  const home=p.getByRole('link',{name:'Home',exact:true});await home.focus();await p.keyboard.press('Enter');
  await p.waitForURL(f.origin+'/projects/'+f.project+'/home');
  await p.locator('.project-page:not([hidden])').waitFor();
  if(width===390)await p.getByRole('button',{name:'Project navigation',exact:true}).click();
  const back=p.getByRole('link',{name:'All Requests',exact:true});await back.focus();await p.keyboard.press('Enter');
  await p.waitForURL(f.origin+'/projects/'+f.project+'/requests');
  await p.getByRole('heading',{name:'Project Review',exact:true}).waitFor();
  const fades=await p.evaluate(()=>window.__pageFades);
  await check(motion==='reduce'?fades.length===0:fades.length>=2&&fades.every(a=>a.duration===180),who+' '+motion+' shared page transition honors actual preference across keyboard SPA navigation');
  await check(await p.locator('.project-page:not([hidden])').isVisible(),who+' '+motion+' authorized content remains visible after navigation');
  await check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),who+' '+motion+' navigation preserves contained document overflow');
  await context.close();
 }
 await check(errors.length===0,'No motion/navigation browser errors');
 await fs.writeFile(dir+'/motion-results.json',JSON.stringify({checks:checks.length,cases:checks,errors,limits:['Read-only observations on retained owned282 current production runtime; no authority reset or appearance mutation.','Manager desktop and Viewer mobile exercise shared transition and keyboard sidebar/drawer, not interactive login or every role permutation.','No new visual capture claim.']}));
 console.log(JSON.stringify({checks:checks.length,errors:errors.length}));
}finally{await browser.close();}
