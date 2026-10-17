import {playwrightModuleURL} from '../playwright-runtime.mjs';
// Explicitly owned synthetic UI fixture; never seed/reset retained databases.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import jwt from 'jsonwebtoken';
import {pathToFileURL} from 'node:url';

assert.equal(process.env.SWR_UI_REDESIGN,'1');
const f=JSON.parse(await fs.readFile('.local-fixture.json','utf8'));
assert.match(f.schema,/^phase5_acceptance_[a-f0-9]{32}$/);
const origin=process.env.SWR_ACCEPTANCE_ORIGIN;
assert.match(origin,/^http:\/\/127\.0\.0\.1:\d+$/);
const {chromium}=await import(playwrightModuleURL);
const browser=await chromium.launch({headless:true,executablePath:process.env.SWR_BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const out='.impeccable/review/alpha1-ui';
await fs.mkdir(out,{recursive:true});
let checks=0;
const results=[];
const check=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);checks++;};
function cookie(id,tenant=f.tenant){return jwt.sign({sub:id,tenantId:tenant,sv:1},process.env.JWT_SECRET,{expiresIn:'1h',jwtid:randomUUID()});}
async function api(id,path,body,tenant=f.tenant){return fetch(origin+path,{method:body?'PUT':'GET',headers:{cookie:'swr_session='+cookie(id,tenant),'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:body?JSON.stringify(body):undefined});}
const roles=[['requester',f.homeRequester],['manager',f.manager],['superintendent',f.superintendent],['chief',f.chief],['instrument',f.im],['admin',f.homeAdmin],['combined-manager',f.combined],['combined-requester',f.combinedRequester],['combined-superintendent',f.combinedSuperintendent]];
try {
  for(const [label,id] of roles)for(const theme of ['LIGHT','DARK'])for(const width of [1440,390]){
    check((await api(id,'/api/account/appearance',{scope:'PERSONAL',mode:theme})).status,200,label+' appearance');
    const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
    await context.addCookies([{name:'swr_session',value:cookie(id),url:origin,httpOnly:true,sameSite:'Lax'}]);
    const page=await context.newPage();const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`${origin}/projects/${f.project}/home`);
    await page.locator('.home-heading h1').waitFor();
    if(label!=='admin')await page.locator('.home-stats').waitFor();
    check(await page.locator('html').getAttribute('data-theme'),theme.toLowerCase(),label+' actual theme');
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,label+' document overflow '+width);
    check(await page.getByText('SurveyRelay',{exact:false}).count(),0,'Current branding');
    if(width===390){
      await page.getByRole('button',{name:'Project navigation',exact:true}).click();
      check(await page.locator('dialog.project-navigation-drawer').evaluate(node=>node.open),true,'Mobile modal');
      await page.keyboard.press('Escape');
      check(await page.getByRole('button',{name:'Project navigation',exact:true}).evaluate(node=>node===document.activeElement),true,'Mobile focus restored');
      await page.getByRole('button',{name:'Project navigation',exact:true}).click();
    }
    const nav=width===390?page.locator('dialog.project-navigation-drawer nav'):page.locator('.project-sidebar nav');
    const labels=await nav.locator('a').allTextContents();
    check(await page.getByRole('button',{name:'Menu',exact:true}).count(),0,'No redundant project menu');
    check(labels.includes('Profile')&&labels.includes('Assignment Details')&&labels.includes('Appearance'),true,'Account destinations in left navigation');
    check(await nav.getByRole('button',{name:'Sign out',exact:true}).count(),1,'Sign out remains available');
    check(new URL(await nav.getByRole('link',{name:'Profile',exact:true}).getAttribute('href'),origin).searchParams.get('projectId'),f.project,'Profile retains project context');
    check(new URL(await nav.getByRole('link',{name:'Assignment Details',exact:true}).getAttribute('href'),origin).searchParams.get('projectId'),f.project,'Assignment retains project context');
    check(labels.includes('Project Administration'),label==='admin'||label.startsWith('combined-'),'Additive administration '+label);
    if(['requester','combined-requester'].includes(label)){
      check(labels.includes('Survey Operations'),false,'No Survey requester destination');
      check(labels.includes('Team Management'),false,'No requester crew destination');
      check(await page.getByRole('link',{name:'Submit a new survey request'}).count(),1,'Prominent requester action');
    }
    if(label==='instrument')check(labels.includes('Field Report Review'),false,'No Instrument Man approval destination');
    check(await nav.getByRole('link',{name:'Home',exact:true}).getAttribute('aria-current'),'page','Current Home destination');
    check(await nav.getByRole('link',{name:'Home',exact:true}).evaluate(node=>getComputedStyle(node).borderRadius),'0px','Square navigation');
    check(await nav.locator('a').evaluateAll(nodes=>nodes.every(node=>node.getBoundingClientRect().height>=44)),true,'Navigation target sizes');
    if(theme==='DARK')check(await page.locator('.home-workspace .tone-planned').evaluateAll(nodes=>{
      const luminance=color=>color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
      return nodes.every(node=>{const style=getComputedStyle(node),a=luminance(style.color),b=luminance(style.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5;});
    }),true,'Effective dark planned badge contrast');
    if(width===1440&&label!=='admin'){
      check(await page.locator('.home-date-column').evaluateAll(nodes=>nodes.every(node=>{const r=node.getBoundingClientRect(),p=node.closest('.administration-table-scroll').getBoundingClientRect();return r.right<=p.right+1&&r.left>=p.left;})),true,'Desktop dates visible '+label);
      check(await page.locator('.home-reference-column .text-link').evaluateAll(nodes=>nodes.every(node=>node.scrollWidth<=node.clientWidth+1)),true,'Compact request reference fits');
      check(await page.locator('.home-status-column .badge').evaluateAll(nodes=>nodes.every(node=>node.getBoundingClientRect().right<=node.closest('td').getBoundingClientRect().right-3)),true,'Status and date gutter');
    }
    if(label==='combined-superintendent')check(await page.getByText('Linked-crew reporting is separate below.',{exact:false}).count(),0,'Combined scope copy truthful');
    if(width===390)await page.locator('dialog.project-navigation-drawer').getByRole('button',{name:'Close navigation',exact:true}).click();
    check(errors,[],'No browser runtime errors '+label);
    await page.screenshot({path:`${out}/${label}-${theme.toLowerCase()}-${width}.png`,fullPage:true});
    results.push({label,theme,width,labels});
    await context.close();
  }
  // Real API populations match role visibility and protect foreign/scalar admin access.
  const all=await (await api(f.manager,`/api/tickets?projectId=${f.project}&queue=all&limit=200`)).json();
  for(const [label,id] of roles){
    const response=await api(id,`/api/tickets?projectId=${f.project}&queue=all&limit=200`);
    check(response.status,200,'Authorized list '+label);
    const data=await response.json();
    if(label==='requester')check(data.data.every(row=>row.requesterId===id),true,'Requester ownership');
    if(label==='admin')check(data.total,0,'Admin grants no request population');
    if(label==='superintendent'){
      check(data.data.every(row=>row.aorNodeId===f.area),true,'Area-only Superintendent visibility');
      check(data.total<all.total,true,'Superintendent narrower than Manager');
      const linked=await (await api(id,`/api/tickets?projectId=${f.project}&queue=all&cohort=linkedCrews&limit=200`)).json();
      check(linked.data.every(row=>row.assignedPartyChiefId===f.chief&&row.aorNodeId===f.area),true,'Explicit linked cohort');
      check(linked.total<data.total,true,'Unassigned and unlinked Area work stays separate');
    }
    if(label==='chief')check(data.data.every(row=>row.assignedPartyChiefId===f.chief),true,'Chief assigned scope');
    check((await api(id,`/api/tickets?projectId=${f.foreignProject}&limit=1`)).status,403,'Foreign project list denied');
  }
  check((await api(f.homeRequester,`/api/projects/${f.project}/survey/teams?mode=context`)).status,403,'Requester direct Team API denied');
  check((await api(f.homeAdmin,`/api/projects/${f.project}/metrics?view=charts`)).status,403,'Admin-only analytics denied');
  check((await api(f.combinedRequester,`/api/projects/${f.project}/metrics?view=charts`)).status,403,'Combined analytics authority unchanged');
  check((await api(f.disabled,`/api/tickets?projectId=${f.project}&limit=1`)).status,403,'Disabled project access denied');
  check((await api(f.combinedSuperintendent,`/api/projects/${f.project}/review?view=requests&queue=all`)).status,200,'Combined Superintendent Project Review remains authorized');

  const deniedContext=await browser.newContext({viewport:{width:390,height:844}});
  await deniedContext.addCookies([{name:'swr_session',value:cookie(f.disabled),url:origin,httpOnly:true,sameSite:'Lax'}]);
  const deniedPage=await deniedContext.newPage();await deniedPage.goto(`${origin}/projects/${f.project}/home`);
  await deniedPage.getByRole('button',{name:'Retry project access',exact:true}).waitFor();
  check(await deniedPage.locator('.home-stats').count(),0,'Disabled shell does not render Home data');
  await deniedContext.close();

  const failureContext=await browser.newContext({viewport:{width:1440,height:1000}});
  await failureContext.addCookies([{name:'swr_session',value:cookie(f.homeRequester),url:origin,httpOnly:true,sameSite:'Lax'}]);
  const failurePage=await failureContext.newPage();
  await failurePage.route('**/api/tickets?**',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Request data temporarily unavailable'})}));
  await failurePage.goto(`${origin}/projects/${f.project}/home`);await failurePage.getByRole('button',{name:'Retry Home',exact:true}).waitFor();
  check(await failurePage.locator('.home-stats').count(),0,'Failed Home has no misleading zero counts');
  await failureContext.close();

  // Existing request and draft deep links, real matching filters, and archived/setup states.
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.addCookies([{name:'swr_session',value:cookie(f.homeRequester),url:origin,httpOnly:true,sameSite:'Lax'}]);
  const page=await context.newPage();
  await page.goto(`${origin}/projects/${f.project}/home`);await page.locator('.home-stats').waitFor();
  await page.locator('.home-stat').filter({hasText:'Completed'}).click();
  await page.getByText('Filtered requests',{exact:true}).waitFor();
  check(new URL(page.url()).searchParams.get('queue'),'completed','Completed drill-down');
  await page.getByRole('link',{name:'Clear filters',exact:true}).click();
  await page.getByRole('heading',{name:'Requests',exact:true}).waitFor();
  await page.goto(`${origin}/projects/${f.project}/home`);await page.locator('.home-stats').waitFor();
  const draft=page.getByRole('link',{name:'Resume draft',exact:true}).first();
  check(new URL(await draft.getAttribute('href'),origin).searchParams.has('draft'),true,'Correct draft resume parameter');
  await draft.click();await page.getByText('Saved draft loaded. Previously uploaded files are available in draft details.').waitFor();checks++;
  await page.goto(`${origin}/projects/${f.archivedProject}/home`);await page.locator('.home-stats').waitFor();
  check(await page.getByRole('link',{name:'Submit a new survey request'}).count(),0,'Archived Home has no creation');
  check(await page.getByText('Archived · history available',{exact:true}).count(),1,'Archived history context');
  await context.close();
  const adminContext=await browser.newContext({viewport:{width:1440,height:1000}});
  await adminContext.addCookies([{name:'swr_session',value:cookie(f.homeAdmin),url:origin,httpOnly:true,sameSite:'Lax'}]);
  const adminPage=await adminContext.newPage();
  await adminPage.goto(`${origin}/projects/${f.setupProject}/admin`);await adminPage.locator('.project-context').waitFor();
  check(await adminPage.locator('.project-sidebar').getByRole('link',{name:'New Request',exact:true}).count(),0,'Setup navigation has no creation');
  await adminPage.screenshot({path:`${out}/setup-admin.png`,fullPage:true});
  await adminContext.close();
  for(const scheme of ['light','dark']){
    check((await api(f.homeRequester,'/api/account/appearance',{scope:'PERSONAL',mode:'SYSTEM'})).status,200,'Save System appearance');
    const systemContext=await browser.newContext({viewport:{width:834,height:1000},colorScheme:scheme});
    await systemContext.addCookies([{name:'swr_session',value:cookie(f.homeRequester),url:origin,httpOnly:true,sameSite:'Lax'}]);
    const systemPage=await systemContext.newPage();await systemPage.goto(`${origin}/projects/${f.project}/home`);await systemPage.locator('.home-stats').waitFor();
    check(await systemPage.locator('html').getAttribute('data-theme'),scheme,'System/device preference');
    check(await systemPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Tablet no overflow');
    await systemPage.screenshot({path:`${out}/requester-system-${scheme}-834.png`,fullPage:true});await systemContext.close();
  }
  const branding=await (await api(f.actor,'/api/account/appearance')).json();
  check((await api(f.actor,'/api/account/appearance',{scope:'TENANT',primary:'#6c4278',accent:'#db8c26',version:branding.branding.version})).status,200,'Approved Central IT tenant colors');
  const branded=await browser.newContext({viewport:{width:1440,height:1000}});
  await branded.addCookies([{name:'swr_session',value:cookie(f.homeRequester),url:origin,httpOnly:true,sameSite:'Lax'}]);
  const brandedPage=await branded.newPage();await brandedPage.goto(`${origin}/projects/${f.project}/home`);await brandedPage.locator('.home-stats').waitFor();
  check(await brandedPage.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--brand').trim()),'#6c4278','Tenant primary applied');
  await brandedPage.screenshot({path:`${out}/requester-tenant-colors.png`,fullPage:true});await branded.close();
  // The consolidated project drawer keeps account actions usable, including recovery.
  const accountContext=await browser.newContext({viewport:{width:390,height:844}});
  await accountContext.addCookies([{name:'swr_session',value:cookie(f.homeRequester),url:origin,httpOnly:true,sameSite:'Lax'}]);
  const accountPage=await accountContext.newPage();await accountPage.goto(`${origin}/projects/${f.project}/home`);await accountPage.locator('.home-stats').waitFor();
  await accountPage.getByRole('button',{name:'Project navigation',exact:true}).click();
  await accountPage.locator('dialog.project-navigation-drawer').getByRole('link',{name:'Profile',exact:true}).click();
  await accountPage.getByRole('heading',{name:'Profile',exact:true}).waitFor();
  check(new URL(accountPage.url()).searchParams.get('projectId'),f.project,'Profile navigation reaches contextual page');
  check(await accountPage.getByRole('button',{name:'Menu',exact:true}).count(),1,'Account-only page retains navigation');
  await accountPage.goto(`${origin}/projects/${f.project}/home`);await accountPage.locator('.home-stats').waitFor();
  await accountPage.getByRole('button',{name:'Project navigation',exact:true}).click();
  const accountDrawer=accountPage.locator('dialog.project-navigation-drawer');
  await accountPage.route('**/api/auth/logout',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic logout failure'})}));
  await accountDrawer.getByRole('button',{name:'Sign out',exact:true}).click();
  await accountDrawer.getByRole('alert').waitFor();
  check(await accountDrawer.getByRole('button',{name:'Sign out',exact:true}).isEnabled(),true,'Failed logout can retry');
  await accountPage.unroute('**/api/auth/logout');
  await accountDrawer.getByRole('button',{name:'Sign out',exact:true}).click();await accountPage.waitForURL('**/login');checks++;
  await accountContext.close();
  await fs.writeFile(`${out}/browser-results.json`,JSON.stringify({checks,results},null,2));
  console.log(`UI redesign browser/HTTP checks passed: ${checks}; ${results.length} role/theme/viewport combinations.`);
}finally{await browser.close();}
