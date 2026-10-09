import {playwrightModuleURL} from '../playwright-runtime.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {Pool} from 'pg';
const run=process.env.SWR_ALPHA_EVIDENCE??'197';assert.ok(['197','206'].includes(run));const evidenceDir=run==='206'?'.local/alpha-closure206':'.local/alpha-acceptance197',capturePrefix=run==='206'?'alpha-closure206':'alpha-acceptance197';
assert.equal(process.env.SWR_ALPHA_ACCEPTANCE,'197');
const own=JSON.parse(await fs.readFile('.local/alpha-acceptance197/ownership.json','utf8'));assert.equal(own.hostPort,15500);assert.match(own.container,/^swr-alpha-acceptance197-db-[a-f0-9]{8}$/);
const values=Object.fromEntries((await fs.readFile('.local/alpha-acceptance197/runner.env','utf8')).trim().split(/\r?\n/).map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1)];})),url=new URL(values.DATABASE_URL);url.port='15500';assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/swr_team_isolated');
const f=JSON.parse(await fs.readFile(evidenceDir+'/role-fixture.json','utf8')),origin=process.env.SWR_ALPHA_ORIGIN??'http://127.0.0.1:3210',pool=new Pool({connectionString:url.href});assert.equal((await pool.query('SELECT name FROM tenants WHERE id=$1',[f.tenant])).rows[0].name,'Owned Alpha acceptance197');
assert.ok(['http://127.0.0.1:3210','http://127.0.0.1:3222'].includes(origin),'Owned pinned local runtime required');
const {chromium}=await import(playwrightModuleURL),browser=await chromium.launch({channel:'msedge',headless:true}),checks=[],errors=[],captures=[],matrix=[];
const check=(v,label)=>{assert(v,label);checks.push(label);},terminal=new Set(['COMPLETED','SURVEY_CANCELED','REQUESTER_CANCELED','FIELD_CANCELED','REJECTED']);
function expected(who){const role=f.roles[who];return f.population.filter(t=>{
 if(['SURVEY_MANAGER','VIEWER','CAD_LEAD','CAD_TECHNICIAN'].includes(role))return true;
 if(role==='REQUESTER')return t.requester===f.people[who];
 if(role==='SUBCONTRACTS_COORDINATOR')return t.company===f.scCompany;
 if(role==='DEPARTMENT_MANAGER')return t.department===f.department;
 if(role==='DEPARTMENT_LEAD')return t.department===f.department&&t.area===f.area;
 if(role==='AREA_VIEWER')return t.area===f.area;
 if(role==='SURVEY_SUPERINTENDENT')return who==='superintendent'?[f.area,f.area2].includes(t.area):t.area===f.area;
 if(role==='PARTY_CHIEF')return t.chief===f.people[who]||(who==='chief'&&[f.area,f.area2].includes(t.area));
 if(role==='INSTRUMENT_MAN')return t.instrument===f.people[who]||(who==='instrument'&&[f.area,f.area2].includes(t.area))||(who==='otherInstrument'&&t.chief===f.people.otherChief);
 return false;
 });}
const adminWho=who=>['admin','legacyAdmin','managerAdmin','requesterAdmin','ssAdmin','chiefAdmin','instrumentAdmin','tenantOnly'].includes(who);
const metricsWho=who=>!adminWho(who)||['managerAdmin','admin','tenantOnly'].includes(who);
async function session(who,width=1440){const c=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});await c.addCookies([{name:'swr_session',value:f.tokens[who],url:origin,httpOnly:true,sameSite:'Lax'}]);return c;}
async function data(r,status,label){check(r.status()===status,label+' HTTP'+status);return r.json();}
const get=(c,path)=>c.request.get(origin+path);
async function capture(p,name){const path='.impeccable/review/'+capturePrefix+'-'+name+'.png';await p.screenshot({path,fullPage:false});captures.push(path);}
function navigation(who,state){const role=f.roles[who],base=['Home'],work=role==='REQUESTER'?['New Request','Requests','Drafts']:role==='SURVEY_MANAGER'?['Survey Operations','Team Management','All Requests']:role==='SURVEY_SUPERINTENDENT'?['All Requests','Survey Operations','Crew Work','Team Management']:role==='PARTY_CHIEF'?['Crew Work','Field Report Review','Team Management']:role==='INSTRUMENT_MAN'?['Crew Work']:role==='PROJECT_ADMIN'||who==='tenantOnly'?[]:['All Requests'];if(state!=='ACTIVE'){const i=work.indexOf('New Request');if(i>=0)work.splice(i,1);}if(['SURVEY_MANAGER','SURVEY_SUPERINTENDENT','PARTY_CHIEF'].includes(role)&&who!=='tenantOnly')work.push('Review Requests');if(['SURVEY_MANAGER','SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN'].includes(role)&&who!=='tenantOnly')work.push('Notifications');if(adminWho(who))work.push('Project Administration');if(['admin','tenantOnly'].includes(who))work.push('Tenant Accounts','Central IT Reviews','Project Templates','Custom Roles','Help Desk');return [...base,...work,'Help Desk'].sort();}
try{
 for(const who of Object.keys(f.roles).filter(w=>w!=='foreignManager')){
  const c=await session(who),rows=who==='tenantOnly'?[]:expected(who),base='/api/projects/'+f.project;
  for(const [project,state]of [[f.project,'ACTIVE'],[f.setupProject,'SETUP'],[f.archivedProject,'ARCHIVED']]){
   const b='/api/projects/'+project,caps=(await data(await get(c,b+'/capabilities'),200,who+' '+state+' current capabilities')).capabilities;
   check(caps.operationalRole===(who==='tenantOnly'?null:f.roles[who])&&caps.canAdminister===adminWho(who),who+' '+state+' operational/admin authority stays separate');
   const list=await get(c,'/api/tickets?projectId='+project+'&queue=all&limit=200');if(who==='tenantOnly')check(list.status()===403,who+' '+state+' administration adds no operational list');else{const result=await data(list,200,who+' '+state+' authorized list');assert.deepEqual(result.data.map(t=>t.id).sort(),(state==='ACTIVE'?rows:[]).map(t=>t.id).sort());check(result.total===(state==='ACTIVE'?rows.length:0),who+' '+state+' exact independently expected record population');}
   const p=await c.newPage();p.on('pageerror',e=>errors.push(who+': '+e.message));await p.goto(origin+'/projects/'+project+'/home');
   if(state==='SETUP'&&!adminWho(who)){
    await p.getByText('Current access to this project is unavailable. Return to Projects to review your access.',{exact:true}).waitFor();check(await p.locator('.home-stats').count()===0,who+' initial Setup does not expose ordinary workflow');check(await p.getByRole('link',{name:'Return to Projects',exact:true}).isVisible(),who+' initial Setup denial provides return path');if(who==='manager')await capture(p,who+'-setup-denied-light-1440');matrix.push({role:who,state,expectedRecords:0,canAdminister:false,initialSetupDiscovery:'restricted'});await p.close();continue;
   }
   await p.locator('.project-context').waitFor();await p.getByRole('heading',{level:1}).first().waitFor();
   if(state!=='SETUP'&&who!=='tenantOnly'&&f.roles[who]!=='PROJECT_ADMIN')await p.locator('.home-stats').waitFor();
   const nav=p.locator('aside nav');const actual=await nav.locator('.workspace-nav-group a').allTextContents();assert.deepEqual(actual.map(s=>s.trim()).sort(),navigation(who,state));checks.push(who+' '+state+' navigation exactly matches role/state authority');check(await nav.getByRole('link',{name:'Home',exact:true}).getAttribute('aria-current')==='page',who+' '+state+' current Home selected');
   check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),who+' '+state+' contained desktop overflow');
   if(state==='SETUP')check(await p.locator('.home-stats').count()===0,who+' Setup has no ordinary Home workflow counts');
   if(state==='ARCHIVED')check(await p.getByText('This project is archived. Authorized history remains available; ordinary work commands are restricted.',{exact:true}).isVisible(),who+' Archive retains explicit read-only explanation');
   if(state==='ACTIVE')await capture(p,who+'-light-1440');
   matrix.push({role:who,state,expectedRecords:state==='ACTIVE'?rows.length:0,canAdminister:caps.canAdminister});await p.close();
  }
  const metrics=await get(c,base+'/metrics?view=charts');if(metricsWho(who)){
   const m=(await data(metrics,200,who+' current charts')).metrics,visible=who==='tenantOnly'?f.population:rows,open=visible.filter(t=>!terminal.has(t.status)),done=visible.filter(t=>t.status==='COMPLETED');check(m.total===visible.length&&m.populationTotal===visible.length&&m.openTotal===open.length&&m.completedTotal===done.length,who+' exact KPI/list population parity');check(m.approvedWithoutInstrumentMan===visible.filter(t=>t.status==='APPROVED'&&!t.instrument).length&&m.overdueNeedBy===open.filter(t=>t.needBy<f.today).length,who+' assignment and UTC overdue definitions');check(m.charts.statuses.reduce((n,b)=>n+b.count,0)===visible.length,who+' chart status counts retain actual denominator');
   const wanted=done.length?done.reduce((n,t)=>n+(Date.parse(t.completedAt)-Date.parse(t.firstSubmittedAt))/3600000,0)/done.length:null;check(wanted===null?m.averageSubmissionToCompletionHours===null:Math.abs(wanted-m.averageSubmissionToCompletionHours)<0.00001,who+' completion cycle definition uses actual dates');
   if(!['manager','managerAdmin','chief','otherChief'].includes(who))check(m.charts.crews.length===0&&m.charts.instrumentMen.length===0,who+' has no supervisory personnel breakdown');
  }else check(metrics.status()===403,who+' independent administration does not expand analytics');
  check((await get(c,base+'/survey/teams')).status()===(['SURVEY_MANAGER','SURVEY_SUPERINTENDENT'].includes(f.roles[who])&&who!=='tenantOnly'?200:403),who+' Team Management remains Survey-only');
  check((await get(c,'/api/projects/'+f.foreignProject+'/survey/teams')).status()===403,who+' foreign project Team refusal');
  const foreign=await get(c,'/api/tickets?projectId='+f.foreignProject);check([403,404].includes(foreign.status()),who+' foreign tenant request list refused');
  const draft=await get(c,'/api/tickets/'+f.partial);check(draft.status()===(who==='requester'?200:404),who+' partial draft private to owner');
  if(who==='superintendent'){
   const linked=f.population.filter(t=>t.area===f.area&&t.chief===f.people.chief),result=await data(await get(c,base+'/metrics?view=charts&cohort=linkedCrews'),200,'Superintendent linked-crew charts');check(result.metrics.total===linked.length&&result.analytics.linkedCrewCount===1&&result.analytics.scopeKind==='linkedCrews','Linked crews explicitly separate from wider Area workload');const list=await data(await get(c,'/api/tickets?projectId='+f.project+'&queue=all&cohort=linkedCrews'),200,'Linked-crew list');assert.deepEqual(list.data.map(t=>t.id).sort(),linked.map(t=>t.id).sort());checks.push('Linked-crew charts/list exact parity, Area overlap grants no reporting');
  }else check((await get(c,base+'/metrics?view=charts&cohort=linkedCrews')).status()===403,who+' cannot claim another role linked-crew scope');
  await c.close();
 }
 const manager=await session('manager');for(const [filter,predicate]of [['population=open',t=>!terminal.has(t.status)],['population=completed',t=>t.status==='COMPLETED'],['population=assignment',t=>t.status==='APPROVED'&&!t.instrument],['population=overdue',t=>!terminal.has(t.status)&&t.needBy<f.today],['areaId='+f.area,t=>t.area===f.area],['dateBasis=needBy&dateFrom='+f.today+'&dateTo='+f.today,t=>t.needBy===f.today],['crewId='+f.people.chief,t=>t.chief===f.people.chief]]){
  const m=(await data(await get(manager,'/api/projects/'+f.project+'/metrics?view=charts&'+filter),200,'Manager '+filter)).metrics,expectedRows=f.population.filter(predicate),denominator=filter.startsWith('population=')?f.population.length:expectedRows.length;check(m.total===expectedRows.length&&m.populationTotal===denominator,'Current narrowed '+filter+' retains independent exact population/denominator');
 }
 await manager.close();
 check(errors.length===0,'No current role/state page errors');await fs.writeFile(evidenceDir+'/role-results.json',JSON.stringify({checks:checks.length,cases:checks,matrix,captures,pageErrors:errors},null,2));console.log(JSON.stringify({checks:checks.length,roles:matrix.length/3,states:matrix.length,captures:captures.length,pageErrors:errors}));
}catch(e){console.error(String(e.message).split('Call log:')[0]);console.error('Recent checks: '+checks.slice(-3).join('; '));console.error(String(e.stack).split('\n').slice(0,4).join('\n'));const pages=browser.contexts().flatMap(c=>c.pages());if(pages.length)await pages.at(-1).screenshot({path:evidenceDir+'/role-failure.png',fullPage:true});await fs.writeFile(evidenceDir+'/role-partial.json',JSON.stringify({checks,matrix,captures,complete:false}));process.exitCode=1;}finally{await browser.close();await pool.end();}
