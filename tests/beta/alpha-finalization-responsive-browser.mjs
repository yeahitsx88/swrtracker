import {playwrightModuleURL} from '../playwright-runtime.mjs';
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {randomUUID} from 'node:crypto';import {pathToFileURL} from 'node:url';
const run=process.env.SWR_ALPHA_EVIDENCE??'197';assert.ok(['197','206'].includes(run));const evidenceDir=run==='206'?'.local/alpha-closure206':'.local/alpha-acceptance197',capturePrefix=run==='206'?'alpha-closure206':'alpha-acceptance197';
assert.equal(process.env.SWR_ALPHA_ACCEPTANCE,'197');const f=JSON.parse(await fs.readFile(evidenceDir+'/role-fixture.json','utf8')),origin=process.env.SWR_ALPHA_ORIGIN??'http://127.0.0.1:3210';assert.ok(['http://127.0.0.1:3210','http://127.0.0.1:3222'].includes(origin),'Owned pinned local runtime required');
const {chromium}=await import(playwrightModuleURL),browser=await chromium.launch({channel:'msedge',headless:true}),checks=[],captures=[],errors=[];function check(v,n){assert(v,n);checks.push(n);}
async function shot(p,name){const path='.impeccable/review/'+capturePrefix+'-'+name+'.png';await p.screenshot({path,fullPage:false});captures.push(path);}
try{
 for(const who of ['requester','manager','superintendent','chief','instrument','viewer','admin','tenantOnly']){
  const c=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});await c.addCookies([{name:'swr_session',value:f.tokens[who],url:origin,httpOnly:true,sameSite:'Lax'}]);
  for(const mode of ['LIGHT','DARK']){
   const appearance=await c.request.put(origin+'/api/account/appearance',{data:{scope:'PERSONAL',mode},headers:{'Idempotency-Key':randomUUID()}});check(appearance.status()===200,who+' actual personal '+mode);
   for(const width of [1440,390]){
    if(mode==='LIGHT'&&width===1440)continue;
    const p=await c.newPage();p.on('pageerror',e=>errors.push(who+': '+e.message));await p.setViewportSize({width,height:width===390?760:1000});await p.goto(origin+'/projects/'+f.project+'/home');await p.locator('.project-context').waitFor();if(who!=='tenantOnly')await p.locator('.home-stats').waitFor();check(await p.locator('html').getAttribute('data-theme')===mode.toLowerCase(),who+' '+width+' current semantic '+mode);check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),who+' '+width+' '+mode+' contained overflow');
    await p.getByRole('button',{name:'Refresh Home',exact:true}).focus();check(await p.evaluate(()=>document.activeElement?.textContent.includes('Refresh Home')),who+' '+width+' '+mode+' keyboard primary control');await shot(p,who+'-'+mode.toLowerCase()+'-'+width);
    if(width===390){await p.getByRole('button',{name:'Project navigation',exact:true}).click();const d=p.getByRole('dialog');await d.waitFor();check(await d.getByRole('link',{name:'Home',exact:true}).getAttribute('aria-current')==='page',who+' mobile drawer selected Home');await p.keyboard.press('Escape');await d.waitFor({state:'hidden'});check(await p.getByRole('button',{name:'Project navigation',exact:true}).evaluate(n=>n===document.activeElement),who+' mobile Escape restores navigation focus');}
    await p.close();
   }
  }
  await c.close();
 }
 check(errors.length===0,'No responsive role Home page errors');await fs.writeFile(evidenceDir+'/responsive-results.json',JSON.stringify({checks:checks.length,cases:checks,captures,pageErrors:errors},null,2));console.log(JSON.stringify({checks:checks.length,captures:captures.length,pageErrors:errors}));
}catch(e){console.error(String(e.message).split('Call log:')[0]);const pages=browser.contexts().flatMap(c=>c.pages());if(pages.length)await pages.at(-1).screenshot({path:evidenceDir+'/responsive-failure.png',fullPage:true});process.exitCode=1;}finally{await browser.close();}
