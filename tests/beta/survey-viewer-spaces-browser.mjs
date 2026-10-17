import {playwrightModuleURL} from '../playwright-runtime.mjs';
// Real production-browser acceptance; newly owned fixtures and explicit opt-in only.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import jwt from 'jsonwebtoken';

assert.equal(process.env.SWR_SURVEY_VIEWER,'1');
const f=JSON.parse(await fs.readFile('.local-spaces-fixture.json','utf8'));
const retained=JSON.parse(await fs.readFile('.local-demo-fixture.json','utf8'));
assert.match(f.schema,/^phase5_acceptance_[a-f0-9]{32}$/);
assert.notEqual(f.schema,retained.schema);
const origin=process.env.SWR_ACCEPTANCE_ORIGIN;
assert.match(origin,/^http:\/\/127\.0\.0\.1:\d+$/);
const {chromium}=await import(playwrightModuleURL);
const browser=await chromium.launch({headless:true,executablePath:process.env.SWR_BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const output='.impeccable/review/survey-viewer/final';
await fs.mkdir(output,{recursive:true});
let checks=0;const captures=[],failures=[];
function check(actual,expected,message){try{assert.deepEqual(actual,expected,message);}catch(e){failures.push(e.message);console.log('FAIL '+message);}checks++;}
function token(id){return jwt.sign({sub:id,tenantId:f.tenant,sv:1},process.env.JWT_SECRET,{expiresIn:'1h',jwtid:randomUUID()});}
async function shot(page,name,fullPage=true){await page.evaluate(()=>document.fonts.ready);if(fullPage)await page.evaluate(()=>window.scrollTo(0,0));const path=`${output}/${name}.png`;await page.screenshot({path,fullPage});captures.push(path);}
async function shell(page,width){
 check(await page.getByRole('button',{name:'Menu',exact:true}).count(),0,'No redundant Menu');
 check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No document overflow');
 if(width===1864)check(await page.locator('.project-sidebar').evaluate(n=>n.getBoundingClientRect().left),0,'Sidebar anchored to left frame');
 else{await page.getByRole('button',{name:'Project navigation',exact:true}).click();check(await page.locator('dialog.project-navigation-drawer').evaluate(n=>n.open),true,'Shared mobile drawer');await page.keyboard.press('Escape');}
}
async function plannedContrast(page){check(await page.locator('.tone-planned').evaluateAll(ns=>ns.every(n=>{const s=getComputedStyle(n),lum=c=>c.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0),a=lum(s.color),b=lum(s.backgroundColor);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5;})),true,'Planned statuses meet small-text contrast');}
async function help(page,title,text,width){
 const trigger=page.getByRole('button',{name:`About ${title}`,exact:true}).first();await trigger.scrollIntoViewIfNeeded();
 check(await trigger.evaluate(n=>n.getBoundingClientRect().width>=44&&n.getBoundingClientRect().height>=44),true,'44px help target');
 if(width===390)await trigger.tap();else await trigger.focus();
 const id=await trigger.getAttribute('aria-describedby');await page.waitForFunction(id=>document.getElementById(id)?.matches(':popover-open'),id);
 const tip=page.locator(`[id="${id}"]`);check((await tip.textContent()).includes(text),true,'Preserved guidance');
 check(await tip.evaluate(n=>{const r=n.getBoundingClientRect();return r.left>=15&&r.top>=15&&r.right<=innerWidth-15&&r.bottom<=innerHeight-15;}),true,'Help contained in viewport');
 check(await tip.evaluate(n=>{const s=getComputedStyle(n),lum=c=>c.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0),a=lum(s.color),b=lum(s.backgroundColor);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5;}),true,'Help contrast');
 const before=page.url();await page.keyboard.press('Escape');check(page.url(),before,'Help does not navigate');
 await page.waitForFunction(id=>!document.getElementById(id)?.matches(':popover-open'),id);
}
try{
 for(const role of ['manager','superintendent','chief','viewer','localAdmin'])for(const mode of ['LIGHT','DARK'])for(const width of [1864,390]){
  const cookie='swr_session='+token(f[role]);
  check((await fetch(origin+'/api/account/appearance',{method:'PUT',headers:{cookie,'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:JSON.stringify({scope:'PERSONAL',mode})})).status,200,'Owned fixture appearance saved');
  const c=await browser.newContext({viewport:{width,height:884},hasTouch:width===390,reducedMotion:'reduce'});
  await c.addCookies([{name:'swr_session',value:token(f[role]),url:origin,httpOnly:true,sameSite:'Lax'}]);
  const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));const name=`${role}-${mode}-${width}`,base=`${origin}/projects/${f.project}`;
  console.log('Inspect '+name);
  try{
  await p.goto(base+'/home');await p.locator('.home-heading h1').waitFor();await p.locator('.home-stats').waitFor();await shell(p,width);
  check(await p.locator('html').getAttribute('data-theme'),mode.toLowerCase(),'Actual rendered theme');
  if(['viewer','localAdmin'].includes(role)){
   await p.goto(base+'/requests');await p.locator('.review-status-chart').waitFor();await shell(p,width);
   await help(p,'Project Review','Read-only requests',width);await help(p,'Request Filters','Date filters exclude',width);await help(p,'Recorded Status','Select a status',width);
   await shot(p,name+'-review');
   await p.getByRole('button',{name:'Expand chart grid',exact:true}).click();
   await p.getByRole('button',{name:'Recorded Chart Values',exact:true}).click();
   check(await p.locator('.record-scrollable').count(),4,'All four chart tables bounded');
   const region=p.getByRole('region',{name:'status distribution table',exact:true});await region.scrollIntoViewIfNeeded();
   check(await region.evaluate(n=>getComputedStyle(n).maxHeight==='352px'&&getComputedStyle(n).overflowY==='auto'),true,'Bounded scroll table');
   check(await region.locator('thead').evaluate(n=>getComputedStyle(n).position),'sticky','Sticky heading');
   check(await region.locator('.chart-review-action').evaluateAll(ns=>ns.every(n=>getComputedStyle(n).whiteSpace==='nowrap'&&n.getBoundingClientRect().height>=44)),true,'Single-line 44px actions');
   await region.evaluate(n=>{n.scrollLeft=n.scrollWidth;n.scrollTop=120;});await shot(p,name+'-chart-table',false);
   const action=region.getByRole('button',{name:'Review requests',exact:true}).first();await action.click();await p.locator('section[aria-label="Filtered requests"] .status-badge').first().waitFor();
   check(new URL(p.url()).searchParams.get('view'),'requests','Chart drill-down');
   check(await p.locator('.status-badge').evaluateAll(ns=>ns.every(n=>getComputedStyle(n).whiteSpace==='nowrap')),true,'Single-line status bubbles');
   await plannedContrast(p);
   const table=p.getByRole('region',{name:'reviewed requests on this page table',exact:true});await table.scrollIntoViewIfNeeded();await table.evaluate(n=>n.scrollLeft=n.scrollWidth);await shot(p,name+'-requests',false);
   await table.getByRole('link',{name:'Open request details',exact:true}).first().click();await p.waitForURL(u=>/\/tickets\//.test(u.pathname));await p.locator('.detail-header').waitFor();await shell(p,width);await shot(p,name+'-details');
   check(await p.getByRole('button',{name:/Approve|Assign crew|Reject request|Begin work/,exact:true}).count(),0,'Viewer details remain read-only');
   check(await p.getByRole('link',{name:'Drafts',exact:true}).count(),0,'No requester-only Drafts link');await plannedContrast(p);
   await p.getByRole('link',{name:'Back to All Requests',exact:true}).click();await p.locator('.review-status-chart').waitFor();check(new URL(p.url()).pathname,`/projects/${f.project}/requests`,'Viewer return uses authorized review');
   if(role==='viewer'){
    check((await fetch(origin+`/api/projects/${f.project}/survey/teams`,{headers:{cookie}})).status,403,'Viewer team access denied');
    check((await fetch(origin+`/api/projects/${f.project}/metrics?view=activity`,{headers:{cookie}})).status,403,'Viewer command activity denied');
   }
  }else{
   if(role==='chief'){
    await p.goto(base+'/crew/work');await p.getByRole('heading',{name:'Crew Work',exact:true}).waitFor();await p.locator('.administration-table tbody tr').first().waitFor();await help(p,'Crew Work','Requests assigned to your crew',width);await shell(p,width);await plannedContrast(p);
    check(await p.locator('.administration-table tbody tr').evaluateAll(ns=>ns.every(n=>n.getBoundingClientRect().height<160)),true,'Compact Crew Work row height');
    check(await p.locator('.crew-work-actions .button').evaluateAll(ns=>ns.every(n=>getComputedStyle(n).whiteSpace==='nowrap'&&n.getBoundingClientRect().height>=44)),true,'Crew commands retain single-line targets');await shot(p,name+'-crew');
    const crewTable=p.getByRole('region',{name:'requests table',exact:true});await crewTable.scrollIntoViewIfNeeded();await crewTable.evaluate(n=>n.scrollLeft=n.scrollWidth);await shot(p,name+'-crew-actions',false);
   }else{
    await p.goto(base+'/survey/operations');await p.getByRole('heading',{name:'Survey Operations',exact:true}).waitFor();await p.getByRole('tab',{name:'Overview',exact:true}).waitFor();
    await help(p,role==='manager'?'Queue Health':'Area-Wide Workload','Select a measure',width);
    if(role==='manager'){
     await p.getByRole('button',{name:'About Current Status',exact:true}).waitFor();await help(p,'Current Status','current status, not event history',width);await help(p,'Demand and Recorded Completion','first submissions vs.',width);await help(p,'Request Distribution','Unassigned requests',width);
     await p.locator('.ops-command-more summary').click();await help(p,'Activity Dates','limited to 90 days',width);check(await p.locator('.ops-command-more').evaluate(n=>n.open),true,'Help preserves filter disclosure');
    }else await p.locator('.kpi-explorer .kpi-donut,.kpi-explorer .kpi-bars').first().waitFor();
    await shell(p,width);check(await p.locator('.ops-metric').first().evaluate(n=>getComputedStyle(n).backgroundColor),mode==='DARK'?'rgb(20, 32, 42)':'rgb(245, 248, 251)','Operations uses current semantic surface');await shot(p,name+'-operations');
    await p.getByRole('tab',{name:/^Open Requests/}).click();await p.locator('.ops-queue').waitFor();await shell(p,width);await shot(p,name+'-queue');
   }
    await p.goto(base+'/survey/teams');await p.getByRole('heading',{name:'Team Management',exact:true}).waitFor();
    if(role==='manager'){
     await p.getByRole('tab',{name:'Teams',exact:true}).click();await p.getByRole('heading',{name:'Survey Teams',exact:true}).waitFor();await help(p,'Survey Teams','Named groups',width);
     check(await p.getByRole('button',{name:'Create team',exact:true}).isDisabled(),false,'Manager can edit named teams');
    }else{
     await p.getByRole('textbox',{name:'Search assigned personnel',exact:true}).waitFor();await help(p,'Team Management',role==='superintendent'?'explicitly assigned Party Chiefs':'currently assigned Instrument Men',width);
     check(await p.getByRole('button',{name:'Create team',exact:true}).count(),0,'Assigned workforce does not expose named team creation');
    }
    await shell(p,width);await shot(p,name+'-teams');
  }
  check(errors,[],'No browser errors');
  }catch(e){failures.push(name+': '+e.message);console.log('FAIL '+name+': '+e.message);await shot(p,name+'-failure',false);}
  await c.close();
 }
 await fs.writeFile('.local-spaces-ui-results.json',JSON.stringify({checks,captures,failures,at:new Date().toISOString()},null,2));console.log(`Survey/Viewer browser: ${checks} checks; ${captures.length} captures`);assert.deepEqual(failures,[]);
}finally{await browser.close();}
