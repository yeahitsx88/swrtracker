import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url),{Pool}=require('pg'),bcrypt=require('bcrypt');
const origin=process.env.SWR_UI_ORIGIN??'http://127.0.0.1:3107';
const dburl=new URL(process.env.DATABASE_URL??'');
if(process.env.SWR_TEAM_POSTGRES!=='1'||origin!=='http://127.0.0.1:3107'||dburl.hostname!=='127.0.0.1'||dburl.port!=='15489'||dburl.pathname!=='/swr_team_isolated')throw Error('Owned disposable loopback preview/fixture required');
const {chromium}=await import(pathToFileURL(process.env.SWR_PLAYWRIGHT_MODULE).href);
const id=n=>'96000000-0000-4000-8000-'+String(n).padStart(12,'0'),project=id(3),tenant=id(1);
const pg=new Pool({connectionString:dburl.href});
const password='Synthetic-increment-browser-only';
const hash=await bcrypt.hash(password,10);
await pg.query('UPDATE users SET password_hash=$1 WHERE tenant_id=$2',[hash,tenant]);
for(let n=100;n<145;n++){
 await pg.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING",[id(n),tenant,id(2),'increment-'+id(n)+'@example.test','Browser Instrument Man '+n,hash]);
 await pg.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'INSTRUMENT_MAN') ON CONFLICT DO NOTHING",[project,id(n)]);
}
const browser=await chromium.launch({executablePath:process.env.SWR_BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
let checks=0; const check=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);checks++;};
fs.mkdirSync('.local/phase5-ui',{recursive:true});
async function session(n,width){
 const response=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tenantId:tenant,email:'increment-'+id(n)+'@example.test',password})});
 check(response.status,200,'real login');
 const token=response.headers.get('set-cookie')?.match(/swr_session=([^;]+)/)?.[1];assert.ok(token);
 const context=await browser.newContext({viewport:{width,height:650},reducedMotion:'reduce'});
 // Production Secure cookie is deliberately unchanged. Loopback-only test context transports the real login token over HTTP.
 await context.addCookies([{name:'swr_session',value:token,url:origin,httpOnly:true,sameSite:'Strict',secure:false}]);
 const page=await context.newPage();page.setDefaultTimeout(15000);
 return {page,context};
}
async function geometry(page){
 check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'no horizontal overflow');
 check(await page.locator('button:visible,.app-link:visible').evaluateAll(nodes=>nodes.every(n=>getComputedStyle(n).borderRadius==='0px')),true,'square interactive controls');
 check(await page.locator('.panel').first().evaluate(n=>parseFloat(getComputedStyle(n).borderRadius)>0),true,'rounded panels preserved');
 check(await page.locator('input.input:visible').first().evaluate(n=>getComputedStyle(n).borderRadius), '10px','input geometry retained');
}
async function menu(page,visible){
 await page.getByRole('button',{name:'Menu',exact:true}).click();
 const link=page.getByRole('navigation',{name:'Account navigation'}).getByRole('link',{name:'Team Management',exact:true});
 if(visible)await link.waitFor();else check(await link.count(),0,'unauthorized menu absent');
 if(visible){check(await link.getAttribute('href'),'/projects/'+project+'/survey/teams','role-aware menu');await link.click();}
 else await page.getByRole('button',{name:'Close account menu'}).click();
}
async function kpi(page,label,width){
 await page.getByRole('button',{name:label,exact:true}).click();
 const dialog=page.locator('dialog[open]').last();
 await dialog.locator('.kpi-explorer').waitFor();
 await dialog.locator('.kpi-loading').waitFor({state:'hidden'});
 await dialog.locator('.kpi-bars').waitFor();
 await dialog.locator('details').evaluateAll(nodes=>nodes.forEach(n=>n.open=true));
 check(await dialog.getByRole('button',{name:'Show matching requests'}).count(),0,'member scope has no broader detail escape');
 check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'KPI no page overflow');
 const scroller=dialog.locator('.popout-body').first();
 await scroller.evaluate(n=>n.scrollTo({top:n.scrollHeight,behavior:'instant'}));
 const arrow=dialog.getByRole('button',{name:'Back to top',exact:true});
 await arrow.waitFor();
 const close=dialog.getByRole('button',{name:'Close',exact:true}),before=await close.boundingBox(),arrowBox=await arrow.boundingBox();
 check(arrowBox.y>before.y+before.height,true,'arrow does not obscure frozen Close');
 check(arrowBox.y>= (await scroller.boundingBox()).y+(await scroller.boundingBox()).height,true,'dialog arrow has space outside fields');
 check(await arrow.evaluate(n=>getComputedStyle(n).borderRadius),'0px','portal arrow square');
 await arrow.focus();await page.keyboard.press('Enter');
 await page.waitForFunction(()=>[...document.querySelectorAll('dialog[open] .popout-body')].every(n=>n.scrollTop===0));
 await arrow.waitFor({state:'hidden'});
 check(await close.boundingBox(),before,'Close position retained');
 await page.screenshot({path:'.local/phase5-ui/kpi-'+width+'.png'});
 await close.click();
 check(await page.getByRole('button',{name:label,exact:true}).evaluate(n=>n===document.activeElement),true,'focus returns to member');
}
try{
 for(const width of [1440,390]){
  for(const [n,role] of [[10,'manager'],[12,'superintendent'],[24,'chief']]){
   const {page,context}=await session(n,width);
   await page.goto(origin+'/projects/'+project+'/survey/teams');
   await page.getByRole('heading',{name:'Team Management',exact:true}).waitFor();
   await page.getByRole('button',{name:/KPIs for/}).first().waitFor();
   await menu(page,true);await page.getByRole('button',{name:/KPIs for/}).first().waitFor();
   await geometry(page);
   if(role==='manager'){
    check(await page.getByRole('tab',{name:'Personnel',exact:true}).count(),1,'Manager personnel controls preserved');
    await page.getByLabel('Items per page').selectOption('100');
    await page.waitForFunction(()=>document.querySelectorAll('.tm-person').length>40);
    await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
    const arrow=page.getByRole('button',{name:'Back to top',exact:true});await arrow.waitFor();
    check(await arrow.evaluate(n=>getComputedStyle(n).borderRadius),'0px','page arrow square');
    await arrow.focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>scrollY===0);checks++;
   }else if(role==='chief')check(await page.getByRole('button',{name:/Reassign /}).count(),0,'Chief read-only');
   else {
    await page.getByRole('button',{name:'Reassign INSTRUMENT_MAN 17',exact:true}).click();
    await page.getByRole('button',{name:/PARTY_CHIEF 14/}).waitFor();
    check(await page.getByRole('button',{name:/PARTY_CHIEF 15|PARTY_CHIEF 16/}).count(),0,'other superintendent pool absent');
    if(width===1440){
     await page.getByRole('button',{name:'PARTY_CHIEF 14',exact:true}).click();
     await page.getByRole('button',{name:'Save reassignment',exact:true}).click();
     await page.getByText('Crew reassignment saved.',{exact:false}).waitFor();checks++;
     await page.getByRole('button',{name:'Reassign INSTRUMENT_MAN 17',exact:true}).click();
     await page.getByRole('button',{name:'PARTY_CHIEF 24',exact:true}).click();
     await page.getByRole('button',{name:'Save reassignment',exact:true}).click();
     await page.getByText('Crew reassignment saved.',{exact:false}).waitFor();checks++;
    }else await page.getByRole('button',{name:'Reload workforce'}).click();
   }
   await page.getByRole('button',{name:'KPIs for INSTRUMENT_MAN 17',exact:true}).waitFor();
   if(role==='manager')await kpi(page,'KPIs for INSTRUMENT_MAN 17',width);
   else {await page.getByRole('button',{name:'KPIs for INSTRUMENT_MAN 17',exact:true}).click();await page.locator('dialog[open] .kpi-explorer').waitFor();await page.locator('dialog[open] .kpi-loading').waitFor({state:'hidden'});await page.locator('dialog[open]').getByRole('button',{name:'Close',exact:true}).click();checks++;}
   await page.screenshot({path:'.local/phase5-ui/'+role+'-'+width+'.png'});
   // Stack a second native modal above a first one: control must be inside the active dialog.
   if(role==='manager'){
    await page.evaluate(()=>{for(let i=0;i<2;i++){const d=document.createElement('dialog');d.id='synthetic-scroll-'+i;d.className='popout-dialog';d.style.cssText='width:300px;height:500px;position:fixed';d.innerHTML='<div class="popout-header"><h2>Scroll acceptance</h2><button>Close</button></div><div class="popout-body"><div style="height:1800px">Synthetic scroll surface</div></div>';document.body.append(d);d.showModal();d.querySelector('.popout-body').scrollTop=700;}});
    const nested=page.locator('#synthetic-scroll-1'),arrow=nested.getByRole('button',{name:'Back to top'});await arrow.waitFor();await arrow.focus();await page.keyboard.press('Enter');
    check(await nested.locator('.popout-body').evaluate(n=>n.scrollTop),0,'active nested dialog scroll');
    check(await page.locator('#synthetic-scroll-0 .popout-body').evaluate(n=>n.scrollTop),700,'other dialog unaffected');
    await page.evaluate(()=>document.querySelectorAll('[id^="synthetic-scroll-"]').forEach(n=>{n.close();n.remove();}));
   }
   await context.close();
  }
  for(const n of [20,17]){
   const {page,context}=await session(n,width);await page.goto(origin+'/projects/'+project+'/survey/teams');await page.getByRole('alert').first().waitFor();await menu(page,false);check(await page.getByRole('button',{name:/KPIs for/}).count(),0,'direct URL independently denies');await context.close();
  }
  const {page,context}=await session(11,width);await page.goto(origin+'/projects');await page.getByRole('button',{name:'Create Project',exact:true}).click();
  await page.getByLabel('Project name').fill('Browser setup '+width);
  await page.getByLabel('Crew build').selectOption('MEDIUM');await geometry(page);
  await page.getByRole('button',{name:'Create Project',exact:true}).click();await page.getByText('Browser setup '+width+' was created in Setup.',{exact:true}).waitFor();
  await page.screenshot({path:'.local/phase5-ui/admin-'+width+'.png'});
  const link=page.getByRole('link',{name:'Configure Browser setup '+width,exact:true}),href=await link.getAttribute('href');await link.click();
  await page.getByText('Project Request Configuration',{exact:true}).waitFor();checks++;
  const stored=await pg.query('SELECT status,crew_build FROM projects WHERE id=$1',[href.split('/')[2]]);
  check(stored.rows[0],{status:'SETUP',crew_build:'MEDIUM'},'creation retains Setup lifecycle');
  await context.close();
 }
 console.log('Phase 5 browser acceptance: '+checks+' checks passed at 1440 and 390; real role sessions, production image, isolated database.');
}finally{await browser.close();await pg.end();}
