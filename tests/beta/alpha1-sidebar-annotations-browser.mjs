// Opt in only after creating and populating a fresh owned annotation fixture.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import jwt from 'jsonwebtoken';

assert.equal(process.env.SWR_UI_ANNOTATIONS,'1');
const fixture=JSON.parse(await fs.readFile('.local-annotations-fixture.json','utf8'));
assert.match(fixture.schema,/^phase5_acceptance_[a-f0-9]{32}$/);
const origin=process.env.SWR_ACCEPTANCE_ORIGIN;
assert.match(origin,/^http:\/\/127\.0\.0\.1:\d+$/);
const {chromium}=await import(pathToFileURL(process.env.SWR_PLAYWRIGHT_MODULE).href);
const browser=await chromium.launch({headless:true,executablePath:process.env.SWR_BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const output='.impeccable/review/alpha1-ui/annotations';
await fs.mkdir(output,{recursive:true});
let checks=0;
const captures=[];
function check(actual,expected,label){assert.deepEqual(actual,expected,label);checks++;}
function token(id){return jwt.sign({sub:id,tenantId:fixture.tenant,sv:1},process.env.JWT_SECRET,{expiresIn:'1h',jwtid:randomUUID()});}
async function screenshot(page,name,fullPage=true){await page.evaluate(()=>document.fonts.ready);if(fullPage){await page.evaluate(()=>window.scrollTo(0,0));await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}const path=`${output}/${name}.png`;await page.screenshot({path,fullPage});captures.push(path);}
async function verifyShell(page,width){
  await page.locator('.project-context-name').waitFor();
  check(await page.getByRole('button',{name:'Menu',exact:true}).count(),0,'Old Menu removed');
  check(await page.locator('.project-workspace').count(),1,'Single shared workspace');
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No document overflow');
  if(width>=1000){
    check(await page.locator('.project-sidebar').evaluate(node=>node.getBoundingClientRect().left),0,'Sidebar anchored to frame');
    check(await page.locator('.project-sidebar').isVisible(),true,'Desktop sidebar persists');
  }else{
    await page.getByRole('button',{name:'Project navigation',exact:true}).click();
    check(await page.locator('dialog.project-navigation-drawer').evaluate(node=>node.open),true,'Shared mobile drawer');
    await page.keyboard.press('Escape');
    check(await page.getByRole('button',{name:'Project navigation',exact:true}).evaluate(node=>node===document.activeElement),true,'Escape restores trigger focus');
  }
}
async function navigate(page,width,label){
  if(width<1000)await page.getByRole('button',{name:'Project navigation',exact:true}).click();
  const nav=page.locator(width>=1000?'.project-sidebar nav':'dialog.project-navigation-drawer nav');
  await nav.getByRole('link',{name:label,exact:true}).click();
}
const home=`/projects/${fixture.project}/home`;
const roles=[['requester',fixture.homeRequester],['manager',fixture.manager],['superintendent',fixture.superintendent],['chief',fixture.chief],['instrument',fixture.im],['admin',fixture.homeAdmin],['combined-manager',fixture.combined],['combined-requester',fixture.combinedRequester],['combined-superintendent',fixture.combinedSuperintendent]];
try {
  for(const [role,id] of roles)for(const theme of ['LIGHT','DARK'])for(const width of [1864,390]){
    const response=await fetch(`${origin}/api/account/appearance`,{method:'PUT',headers:{cookie:`swr_session=${token(id)}`,'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:JSON.stringify({scope:'PERSONAL',mode:theme})});
    check(response.status,200,'Owned fixture theme');
    const context=await browser.newContext({viewport:{width,height:884},reducedMotion:'reduce'});
    await context.addCookies([{name:'swr_session',value:token(id),url:origin,httpOnly:true,sameSite:'Lax'}]);
    const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(origin+home);
    await page.locator('.home-heading h1').waitFor();
    await verifyShell(page,width);
    check(await page.locator('html').getAttribute('data-theme'),theme.toLowerCase(),'Actual theme');
    const nav=page.locator('.project-sidebar nav');
    const links=await nav.locator('a').allTextContents();
    check(links.includes('Project Administration'),role==='admin'||role.startsWith('combined-'),'Additive current administration');
    check(links.includes('Field Report Review'),role==='chief','Approval role boundary');
    if(role!=='admin'){
      await page.locator('.home-stats').waitFor();
      check(await page.locator('.home-status-column .badge').evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).whiteSpace==='nowrap'&&node.getBoundingClientRect().right<=node.closest('td').getBoundingClientRect().right-2)),true,'Single-line status fits column');
    }
    await screenshot(page,`${role}-${theme}-${width}-home`);
    if(role==='requester'){
      await page.getByRole('button',{name:'Recorded chart values',exact:false}).first().click();
      const table=page.getByRole('region',{name:'Request status categories table',exact:true});
      await table.waitFor();
      check(await table.evaluate(node=>getComputedStyle(node).overflowY==='auto'&&node.scrollHeight>node.clientHeight),true,'Categories have bounded vertical scrolling');
      check(await table.getByRole('button',{name:'Review requests',exact:true}).evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).whiteSpace==='nowrap'&&node.getBoundingClientRect().height>=44)),true,'Styled single-line review actions');
      check(await table.locator('thead').evaluate(node=>getComputedStyle(node).position),'sticky','Sticky table headings');
      check(await table.evaluate(node=>node.scrollWidth<900),true,'Reasonable chart table width');
      if(width>=1000)check(await table.getByRole('button',{name:'Review requests',exact:true}).evaluateAll(nodes=>nodes.every(node=>node.getBoundingClientRect().right<=node.closest('.record-scrollable').getBoundingClientRect().right)),true,'Desktop counts and review actions visible together');
      await screenshot(page,`${role}-${theme}-${width}-chart-values`);
      await table.scrollIntoViewIfNeeded();
      await screenshot(page,`${role}-${theme}-${width}-chart-viewport`,false);
      await table.evaluate(node=>node.scrollLeft=node.scrollWidth);
      await screenshot(page,`${role}-${theme}-${width}-chart-actions-viewport`,false);
      await table.evaluate(node=>{node.scrollTop=160;});
      check(await table.locator('thead').evaluate(node=>{const viewport=node.closest('.record-scrollable').getBoundingClientRect();return Math.abs(node.getBoundingClientRect().top-viewport.top)<2;}),true,'Headings stay visible during actual table scroll');
      await screenshot(page,`${role}-${theme}-${width}-chart-sticky-viewport`,false);
      await table.evaluate(node=>{node.scrollLeft=0;node.scrollTop=0;});
      await table.getByRole('button',{name:'Review requests',exact:true}).first().click();
      await page.waitForURL(url=>url.pathname.endsWith('/my-requests')&&url.searchParams.has('status'));
      check(new URL(page.url()).searchParams.has('status'),true,'Recorded category opens actual scoped request list');
      await page.goto(origin+home);await page.locator('.home-heading h1').waitFor();
      for(const label of ['Appearance','Profile','Assignment Details','Switch project']){
        await navigate(page,width,label);
        await page.getByRole('heading',{name:label==='Switch project'?'Project Launcher':label,exact:true}).waitFor();
        await verifyShell(page,width);
        const active=page.locator(width>=1000?'.project-sidebar nav':'dialog.project-navigation-drawer nav');
        check(await active.getByRole('link',{name:label,exact:true,includeHidden:true}).getAttribute('aria-current'),'page','Current account destination');
        await screenshot(page,`${role}-${theme}-${width}-${label.toLowerCase().replaceAll(' ','-')}`);
        if(label==='Appearance'){
          check(await page.getByRole('link',{name:'Back',exact:true}).getAttribute('href'),home,'Appearance returns to prior screen');
          await page.getByRole('link',{name:'Back',exact:true}).click();await page.locator('.home-heading h1').waitFor();
        }else{await navigate(page,width,'Home');await page.locator('.home-heading h1').waitFor();}
      }
      // Direct non-project URLs retain verified selected context after reload.
      await page.goto(origin+'/appearance');await verifyShell(page,width);
      await navigate(page,width,'Home');await page.locator('.home-heading h1').waitFor();
      await page.goto(origin+'/assignment-details');await verifyShell(page,width);
      await page.getByText('Project role',{exact:true}).waitFor();
      check(await page.getByText('Requester',{exact:true}).count()>0,true,'Remembered assignment context');
    }
    check(errors,[],'No browser runtime errors');
    await context.close();
  }
  // Capability failure removes operational links but leaves all account escapes.
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  await context.addCookies([{name:'swr_session',value:token(fixture.homeRequester),url:origin,httpOnly:true,sameSite:'Lax'}]);
  const page=await context.newPage();
  await page.route('**/api/projects/*/capabilities',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'Synthetic access failure'}})}));
  await page.goto(origin+home);await page.getByRole('button',{name:'Retry project access',exact:true}).waitFor();
  check(await page.locator('.home-heading').count(),0,'Project content waits for current access');
  check(await page.locator('.project-sidebar').getByRole('link',{name:'New Request',exact:true}).count(),0,'No stale operational destination');
  check(await page.locator('.project-sidebar').getByRole('button',{name:'Sign out',exact:true}).count(),1,'Account escape on failure');
  await navigate(page,1440,'Appearance');await page.getByRole('heading',{name:'Appearance',exact:true}).waitFor();
  await page.getByRole('button',{name:'Save display mode',exact:true}).waitFor();
  check(await page.locator('.project-sidebar').isVisible(),true,'Account sidebar on access failure');
  await screenshot(page,'access-failure-appearance',false);
  await context.close();
  const first=await browser.newContext({viewport:{width:390,height:844}});
  await first.addCookies([{name:'swr_session',value:token(fixture.homeRequester),url:origin,httpOnly:true,sameSite:'Lax'}]);
  const launcher=await first.newPage();await launcher.goto(origin+'/projects');
  await launcher.getByRole('heading',{name:'Project Launcher',exact:true}).waitFor();
  await launcher.getByRole('button',{name:'Project navigation',exact:true}).click();
  check(await launcher.getByRole('dialog').getByRole('link',{name:'Projects',exact:true}).count(),1,'Fresh session generic navigation');
  check(await launcher.getByRole('button',{name:'Menu',exact:true}).count(),0,'Fresh launcher has no legacy menu');
  await screenshot(launcher,'fresh-session-mobile-projects-drawer',false);await first.close();
  await fs.writeFile(`${output}/results.json`,JSON.stringify({checks,captures,roles:roles.map(([role])=>role),themes:['LIGHT','DARK'],widths:[1864,390],fixture:'fresh owned schema; live demo unchanged'},null,2));
  console.log(`Annotation acceptance passed: ${checks} checks; ${captures.length} captures.`);
}finally{await browser.close();}
