import {playwrightModuleURL} from '../playwright-runtime.mjs';
// Fresh owned fixtures only. Exercises real pointer, keyboard and touch behavior.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import jwt from 'jsonwebtoken';
assert.equal(process.env.SWR_UI_HEADING_HELP,'1');
const f=JSON.parse(await fs.readFile('.local-heading-fixture.json','utf8'));
assert.match(f.schema,/^phase5_acceptance_[a-f0-9]{32}$/);
const origin=process.env.SWR_ACCEPTANCE_ORIGIN;
assert.match(origin,/^http:\/\/127\.0\.0\.1:\d+$/);
const {chromium}=await import(playwrightModuleURL);
const browser=await chromium.launch({headless:true,executablePath:process.env.SWR_BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const output='.impeccable/review/alpha1-ui/heading-help';
await fs.mkdir(output,{recursive:true});
let checks=0;const captures=[];
function check(actual,expected,label){assert.deepEqual(actual,expected,label);checks++;}
function token(id){return jwt.sign({sub:id,tenantId:f.tenant,sv:1},process.env.JWT_SECRET,{expiresIn:'1h',jwtid:randomUUID()});}
async function shot(page,name,fullPage=true){await page.evaluate(()=>document.fonts.ready);if(fullPage)await page.evaluate(()=>window.scrollTo(0,0));const path=`${output}/${name}.png`;await page.screenshot({path,fullPage});captures.push(path);}
async function settled(trigger,expanded){await trigger.page().waitForFunction(({id,expanded})=>document.getElementById(id)?.matches(':popover-open')===expanded,{id:await trigger.getAttribute('aria-describedby'),expanded});}
async function popup(page,trigger){await settled(trigger,true);const id=await trigger.getAttribute('aria-describedby');return page.locator(`[id="${id}"]`);}
async function bounds(page,tip){check(await tip.evaluate(node=>{const r=node.getBoundingClientRect();return r.left>=15&&r.top>=15&&r.right<=innerWidth-15&&r.bottom<=innerHeight-15;}),true,'Help stays within the viewport');check(await tip.evaluate(node=>{const s=getComputedStyle(node);const l=c=>c.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);const a=l(s.color),b=l(s.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5;}),true,'Help text contrast');check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No document overflow');}
try{
 for(const theme of ['LIGHT','DARK'])for(const width of [1864,390]){
  const id=f.homeRequester;
  check((await fetch(origin+'/api/account/appearance',{method:'PUT',headers:{cookie:'swr_session='+token(id),'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:JSON.stringify({scope:'PERSONAL',mode:theme})})).status,200,'Fresh fixture theme');
  const context=await browser.newContext({viewport:{width,height:884},hasTouch:width===390,reducedMotion:'reduce'});
  await context.addCookies([{name:'swr_session',value:token(id),url:origin,httpOnly:true,sameSite:'Lax'}]);
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const home=`${origin}/projects/${f.project}/home`;
  await page.goto(home);await page.getByRole('heading',{name:'Recent Requests',exact:true}).waitFor();
  check(await page.getByRole('heading',{name:'Request Status',exact:true}).count(),1,'Title case on Home');
  check(await page.getByRole('link',{name:'Submit a New Survey Request',exact:true}).count(),1,'Title case on primary action');
  check(await page.locator('.heading-help-trigger').evaluateAll(nodes=>nodes.every(n=>n.getBoundingClientRect().width>=44&&n.getBoundingClientRect().height>=44)),true,'44px help targets');
  check(await page.locator('.panel-heading > p.muted,.home-scope,.home-record-scope').count(),0,'Explanatory subtext moved');
  await shot(page,`${theme}-${width}-home`);
  for(const title of ['Recent Requests','Upcoming Need-By Dates','Saved Drafts']){
   const hint=page.getByRole('button',{name:`About ${title}`,exact:true});await hint.click();
   check((await (await popup(page,hint)).textContent()).includes('Scroll the table sideways to see every column and action.'),true,'Original compact-table scroll guidance retained');
   await page.keyboard.press('Escape');
  }
  const help=page.getByRole('button',{name:'About Submit a New Survey Request',exact:true});
  check(await help.getAttribute('aria-expanded'),'false','Help initially closed');
  if(width===1864){await help.hover();const tip=await popup(page,help);check(await tip.textContent(),'Provide the Area, Need-By date, contact and work details.','Original guidance preserved');await bounds(page,tip);await tip.hover();check(await tip.isVisible(),true,'Help can be hovered to read');await page.mouse.move(0,0);await settled(help,false);}
  await help.focus();await popup(page,help);await page.keyboard.press('Escape');await settled(help,false);check(await help.evaluate(n=>n===document.activeElement),true,'Escape preserves trigger focus');
  if(width===390)await help.tap();else await help.click();
  await bounds(page,await popup(page,help));check(page.url(),home,'Help does not activate CTA');await shot(page,`${theme}-${width}-home-help`);
  if(width===390)await help.tap();else await help.click();await settled(help,false);
  await page.getByRole('link',{name:'Submit a New Survey Request',exact:true}).click();await page.waitForURL(url=>url.pathname.endsWith('/request/new'));check(true,true,'Primary action still navigates');
  await page.goto(`${origin}/projects/${f.project}/my-requests`);await page.getByRole('heading',{name:'Requests',exact:true}).waitFor();
  check(await page.locator('.scoped-kpi-entry strong,.kpi-entry strong').filter({hasText:'Request Trends'}).count(),1,'Title case on the trends entry');
  const requestHelp=page.getByRole('button',{name:'About Requests',exact:true}).first();await requestHelp.click();const requestTip=await popup(page,requestHelp);check((await requestTip.textContent()).includes('Your SWRs and any additional company SWRs granted to your account.'),true,'Requests guidance preserved');await bounds(page,requestTip);await shot(page,`${theme}-${width}-requests-help`);await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Explore charts',exact:true}).click();const dialog=page.locator('dialog[open]');await dialog.getByRole('heading',{name:'All Requests',exact:true}).waitFor();const modalHelp=dialog.getByRole('button',{name:'About All Requests',exact:true});await modalHelp.focus();await bounds(page,await popup(page,modalHelp));await page.keyboard.press('Escape');await settled(modalHelp,false);check(await dialog.isVisible(),true,'Escape closes help while keeping the task dialog');await shot(page,`${theme}-${width}-chart-dialog`);await dialog.getByRole('button',{name:'Close',exact:true}).click();
  for(const [route,title]of [['appearance','Appearance'],['profile','Profile'],['assignment-details','Assignment Details'],['projects','Project Launcher']]){
   await page.goto(`${origin}/${route}`);await page.getByRole('heading',{name:title,exact:true}).waitFor();
   if(route==='profile'||route==='assignment-details')await page.locator('.account-facts').waitFor();
   if(route==='appearance')await page.locator('.appearance-modes').waitFor();
   if(route==='projects')await page.locator('.administration-table tbody tr').first().waitFor();
   const button=page.getByRole('button',{name:`About ${title}`,exact:true});await button.focus();await bounds(page,await popup(page,button));await page.keyboard.press('Escape');check(await page.getByRole('button',{name:'Menu',exact:true}).count(),0,'Persistent shell still has no Menu');await shot(page,`${theme}-${width}-${route}`);
  }
  check(errors,[],'No browser runtime errors');await context.close();
 }
 for(const [name,id]of [['manager',f.manager],['superintendent',f.superintendent],['chief',f.chief],['admin',f.homeAdmin]]){
  const context=await browser.newContext({viewport:{width:1864,height:884},reducedMotion:'reduce'});await context.addCookies([{name:'swr_session',value:token(id),url:origin,httpOnly:true,sameSite:'Lax'}]);const page=await context.newPage();await page.goto(`${origin}/projects/${f.project}/home`);await page.locator('.home-heading h1').waitFor();if(name!=='admin')await page.locator('.home-stats').waitFor();await shot(page,`${name}-home`);check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Role Home fits');await context.close();
 }
 for(const theme of ['LIGHT','DARK'])for(const width of [1864,390]){
  const id=f.superintendent;
  check((await fetch(origin+'/api/account/appearance',{method:'PUT',headers:{cookie:'swr_session='+token(id),'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:JSON.stringify({scope:'PERSONAL',mode:theme})})).status,200,'Fresh Superintendent theme');
  const context=await browser.newContext({viewport:{width,height:884},hasTouch:width===390,reducedMotion:'reduce'});await context.addCookies([{name:'swr_session',value:token(id),url:origin,httpOnly:true,sameSite:'Lax'}]);const page=await context.newPage();await page.goto(`${origin}/projects/${f.project}/home`);await page.locator('.home-stats').waitFor();
  const hint=page.getByRole('button',{name:'About Linked-Crew KPIs',exact:true});await hint.click();
  check(await page.locator('.home-linked-crew-wrap').evaluate(node=>{const label=node.querySelector('summary span').getBoundingClientRect(),button=node.querySelector('.heading-help-trigger').getBoundingClientRect();return button.left>=label.right&&button.left-label.right<=8;}),true,'Linked-Crew help immediately beside its label');
  check(await page.locator('details.home-linked-crew').evaluate(node=>node.open),false,'Help keeps native disclosure closed');await bounds(page,await popup(page,hint));await shot(page,`${theme}-${width}-linked-crew-help-viewport`,false);await page.keyboard.press('Escape');
  await page.locator('.home-linked-crew summary').click();await page.locator('.home-linked-crew .kpi-explorer').waitFor();await hint.click();await popup(page,hint);check(await page.locator('details.home-linked-crew').evaluate(node=>node.open),true,'Help keeps native disclosure open');await context.close();
 }
 await fs.writeFile('.local-heading-help-results.json',JSON.stringify({checks,captures,at:new Date().toISOString()},null,2));console.log(`Heading help browser: ${checks} checks; ${captures.length} captures`);
}finally{await browser.close();}
