import {playwrightModuleURL} from '../../tests/playwright-runtime.mjs';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const local='.local-customer-rehearsal',out='audits/customer-lifecycle-rehearsal/operations';
const state=JSON.parse(await fs.readFile(local+'/operations.json','utf8')),manifest=JSON.parse(await fs.readFile(local+'/manifest.json','utf8'));
const f=manifest.datasets.human,origin='http://localhost:3116';
const {chromium}=await import(playwrightModuleURL),browser=await chromium.launch({headless:true,channel:'msedge'});
const results=[],errors=[];
const successorOnly=process.argv[2]==='successor';
const actors=successorOnly?[state.successor]:[state.successor??state.jordan,state.manager,state.superintendents[0],state.crews[0].chief,state.crews[0].ims[0],state.people.find(p=>p.role==='REQUESTER'&&p.companyType==='SUBCONTRACTOR')];
try{
 for(const actor of actors){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
  page.on('pageerror',e=>errors.push({actor:actor.id,error:e.message}));
  page.on('response',r=>{if(r.status()>=400&&new URL(r.url()).pathname.startsWith('/api/'))errors.push({actor:actor.id,path:new URL(r.url()).pathname,status:r.status()});});
  await page.goto(origin+'/login');await page.getByLabel('Tenant ID',{exact:true}).fill(f.tenant);await page.getByLabel('Email',{exact:true}).fill(actor.email);await page.getByLabel('Password',{exact:true}).fill(actor.id===state.jordan.id?state.jordanPassword:f.password);await page.getByRole('button',{name:'Sign In',exact:true}).click();await page.waitForURL('**/projects');
  const route=actor.role==='PROJECT_ADMIN'?'admin':actor.role==='REQUESTER'?'my-requests':actor.role==='SURVEY_MANAGER'||actor.role==='SURVEY_SUPERINTENDENT'?'survey/operations':'crew/work';
  for(let run=0;run<3;run++){
   const start=performance.now();await page.goto(`${origin}/projects/${state.project.id}/${route}`);await page.waitForLoadState('networkidle');
   results.push({actor:actor.id,name:actor.name,role:actor.role,route,run,loadToNetworkIdleMs:Math.round(performance.now()-start),scrollWidth:await page.evaluate(()=>document.documentElement.scrollWidth),viewportWidth:1440,headings:await page.locator('h1,h2,h3').allTextContents(),alerts:await page.locator('[role=alert]').allTextContents()});
  }
  const tag=successorOnly?'successor':'expanded-'+actor.role.toLowerCase();
  await page.screenshot({path:`${out}/browser-${tag}.png`,fullPage:true});
  await fs.writeFile(`${out}/browser-${tag}.txt`,await page.locator('body').innerText());
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${out}/mobile-${tag}.png`,fullPage:true});
  results.push({actor:actor.id,role:actor.role,mobile:true,scrollWidth:await page.evaluate(()=>document.documentElement.scrollWidth),viewportWidth:390});
  if(actor.role==='REQUESTER'){
   const t=state.requests.find(t=>t.requesterId===actor.id&&t.status==='COMPLETED');
   if(t){await page.goto(`${origin}/projects/${state.project.id}/tickets/${t.id}`);await page.waitForLoadState('networkidle');await page.screenshot({path:out+'/requester-completed-detail.png',fullPage:true});results.push({actor:actor.id,role:actor.role,detail:true,ticketId:t.id,alerts:await page.locator('[role=alert]').allTextContents(),headings:await page.locator('h1,h2,h3').allTextContents()});}
  }
  await context.close();
 }
 await fs.writeFile(out+(successorOnly?'/successor-browser-observations.json':'/expanded-browser-observations.json'),JSON.stringify({at:new Date().toISOString(),syntheticAutomation:true,measurement:'Navigation through network idle includes a fixed quiet interval; not a Core Web Vitals or human usability measurement.',results,errors},null,2));
 console.log(JSON.stringify({roles:actors.length,navigations:results.filter(r=>r.run!==undefined).length,errors:errors.length}));
}finally{await browser.close();}
