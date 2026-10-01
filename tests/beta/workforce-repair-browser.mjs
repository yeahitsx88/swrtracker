// Real authenticated editor, concurrent command and explicit stale-state recovery.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
const require=createRequire(import.meta.url),{Pool}=require('pg'),bcrypt=require('bcrypt');
const url=new URL(process.env.DATABASE_URL??''),origin=process.env.SWR_UI_ORIGIN??'http://127.0.0.1:3107';
assert.equal(process.env.SWR_TEAM_POSTGRES,'1');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15489');assert.equal(url.pathname,'/swr_team_isolated');assert.equal(origin,'http://127.0.0.1:3107');
const {chromium}=await import(pathToFileURL(process.env.SWR_PLAYWRIGHT_MODULE).href);
const id=n=>'96000000-0000-4000-8000-'+String(n).padStart(12,'0'),resource=origin+'/api/projects/'+id(3)+'/survey/workforce';
const pg=new Pool({connectionString:url.href});let browser,token,checks=0;
const check=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);checks++;};
const eventCount=async()=>Number((await pg.query('SELECT count(*) AS n FROM survey_staffing_events WHERE project_id=$1',[id(3)])).rows[0].n);
try{
 check((await pg.query('SELECT name FROM tenants WHERE id=$1',[id(1)])).rows[0]?.name,'Increment','Owned disposable workforce fixture');
 const password='Synthetic-increment-browser-only';await pg.query('UPDATE users SET password_hash=$2 WHERE id=$1 AND tenant_id=$3',[id(12),await bcrypt.hash(password,10),id(1)]);
 await pg.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,'increment-chief25@example.test','PARTY_CHIEF 25','not-a-login-hash') ON CONFLICT(id) DO NOTHING",[id(25),id(1),id(2)]);
 await pg.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'PARTY_CHIEF') ON CONFLICT DO NOTHING",[id(3),id(25)]);
 await pg.query('INSERT INTO survey_reporting_links(tenant_id,project_id,superintendent_id,party_chief_id,aor_node_id,assigned_by) SELECT $1,$2,$3,$4,$5,$6 WHERE NOT EXISTS(SELECT 1 FROM survey_reporting_links WHERE project_id=$2 AND party_chief_id=$4 AND deactivated_at IS NULL)',[id(1),id(3),id(12),id(25),id(30),id(10)]);
 browser=await chromium.launch({executablePath:process.env.SWR_BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 fs.mkdirSync('.local/workforce-repair',{recursive:true});
 for(const width of [1440,390]){
  await pg.query('UPDATE crew_rosters SET party_chief_id=$3 WHERE project_id=$1 AND instrument_man_id=$2',[id(3),id(17),id(24)]);
  const login=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tenantId:id(1),email:'increment-'+id(12)+'@example.test',password})});check(login.status,200);
  token=login.headers.get('set-cookie')?.match(/swr_session=([^;]+)/)?.[1];assert.ok(token);
  const headers={cookie:'swr_session='+token,'content-type':'application/json'};
  const context=await browser.newContext({viewport:{width,height:650},reducedMotion:'reduce'});await context.addCookies([{name:'swr_session',value:token,url:origin,httpOnly:true,sameSite:'Strict',secure:false}]);
  const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/projects/'+id(3)+'/survey/teams');await page.getByRole('button',{name:'Reassign INSTRUMENT_MAN 17',exact:true}).waitFor();
  const oldSnapshot=(await (await fetch(resource+'?mode=context',{headers})).json()).snapshotToken;
  const intervening=await fetch(resource,{method:'POST',headers:{...headers,'Idempotency-Key':randomUUID()},body:JSON.stringify({instrumentManId:id(17),partyChiefId:id(14),expectedSnapshot:oldSnapshot})});check(intervening.status,200);
  const afterIntervening=await eventCount();
  await page.getByRole('button',{name:'Reassign INSTRUMENT_MAN 17',exact:true}).click();await page.getByRole('button',{name:'PARTY_CHIEF 25',exact:true}).waitFor();
  await page.getByRole('button',{name:'PARTY_CHIEF 25',exact:true}).click();
  const response=page.waitForResponse(r=>r.url()===resource&&r.request().method()==='POST');await page.getByRole('button',{name:'Save reassignment',exact:true}).click();const stale=await response;
  check(stale.status(),409,'An intervening roster change must refuse the stale displayed editor');
  check((await stale.json()).error.code,'STALE_STAFFING');
  check(stale.request().postDataJSON().expectedSnapshot,oldSnapshot,'Save uses the state that produced the displayed personnel');
  await page.getByRole('alert').filter({hasText:/reload/i}).waitFor();check(await page.getByRole('button',{name:'Save reassignment',exact:true}).isDisabled(),true);
  check((await pg.query('SELECT party_chief_id FROM crew_rosters WHERE project_id=$1 AND instrument_man_id=$2 AND deactivated_at IS NULL',[id(3),id(17)])).rows[0].party_chief_id,id(14),'Concurrent assignment preserved');check(await eventCount(),afterIntervening,'No stale mutation/audit');
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'No horizontal overflow');check(errors,[]);
  await page.screenshot({path:'.local/workforce-repair/stale-'+width+'.png'});
  await page.getByRole('button',{name:'Reload workforce',exact:true}).click();await page.getByRole('button',{name:'Reassign INSTRUMENT_MAN 17',exact:true}).waitFor();
  await page.getByRole('button',{name:'Reassign INSTRUMENT_MAN 17',exact:true}).click();await page.getByRole('button',{name:'PARTY_CHIEF 14 · Current Chief',exact:true}).waitFor();
  check(await page.getByRole('button',{name:'PARTY_CHIEF 14 · Current Chief',exact:true}).isDisabled(),true,'Deliberate reload displays current evidence');
  await page.getByRole('button',{name:'PARTY_CHIEF 25',exact:true}).click();const fresh=page.waitForResponse(r=>r.url()===resource&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Save reassignment',exact:true}).click();check((await fresh).status(),200);
  await page.getByText('Crew reassignment saved.',{exact:false}).waitFor();check(await eventCount(),afterIntervening+1);
  await fetch(origin+'/api/auth/logout',{method:'POST',headers});token=undefined;await context.close();
 }
 console.log(`Workforce repair browser checks passed: ${checks} at 1440 and 390`);
}finally{if(token)await fetch(origin+'/api/auth/logout',{method:'POST',headers:{cookie:'swr_session='+token}});if(browser)await browser.close();await pg.end();}
