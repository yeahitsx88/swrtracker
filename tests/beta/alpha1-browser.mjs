// Production-browser regressions in setup's owned disposable schema only.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {Pool} from 'pg';
import jwt from 'jsonwebtoken';
const url=new URL(process.env.DATABASE_URL??'');
assert.equal(process.env.SWR_TEAM_POSTGRES,'1');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15489');assert.equal(url.pathname,'/swr_team_isolated');
const f=JSON.parse(await fs.readFile('.local-fixture.json','utf8'));assert.match(f.schema,/^phase5_acceptance_[a-f0-9]{32}$/);
const origin=process.env.SWR_ACCEPTANCE_ORIGIN;assert.match(origin,/^http:\/\/127\.0\.0\.1:\d+$/);
const pg=new Pool({connectionString:url.href,options:'-c search_path='+f.schema+',public'});
const {chromium}=await import(pathToFileURL(process.env.SWR_PLAYWRIGHT_MODULE).href);
const browser=await chromium.launch({headless:true,executablePath:process.env.SWR_BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.setDefaultTimeout(15000);
let checks=0;const errors=[];page.on('pageerror',e=>errors.push(e.message));
const check=(actual,expected,name)=>{assert.deepEqual(actual,expected,name);checks++;console.log('PASS '+name);};
const login=async user=>context.addCookies([{name:'swr_session',value:jwt.sign({sub:user,tenantId:f.tenant,sv:1},process.env.JWT_SECRET,{expiresIn:'1h',jwtid:randomUUID()}),url:origin,httpOnly:true,sameSite:'Lax'}]);
const lost=async(path,method='POST')=>{
 const captures=[];
 await page.route('**'+path,async route=>{
  if(route.request().method()!==method)return route.continue();
  captures.push({body:route.request().postDataJSON(),key:route.request().headers()['idempotency-key']});
  if(captures.length===1){const response=await route.fetch();assert.ok(response.ok(),await response.text());await route.abort('failed');}else await route.continue();
 });
 return async()=>{await page.unroute('**'+path);check(captures.length,2,'exact_retry_count_'+path);check(captures[0],captures[1],'exact_retry_body_and_key_'+path);};
};
try{
 await fs.mkdir('.local-alpha1/browser',{recursive:true});await login(f.actor);
 await page.goto(origin+'/projects');await page.getByRole('button',{name:'Create Project',exact:true}).click();
 const creationName='Alpha1 browser '+randomUUID();await page.getByLabel('Project name',{exact:true}).fill(creationName);
 const recoverCreation=await lost('/api/projects');await page.getByRole('button',{name:'Create Project',exact:true}).click();
 await page.getByRole('button',{name:'Retry unchanged project',exact:true}).waitFor();
 check(await page.getByLabel('Project name',{exact:true}).isDisabled(),true,'uncertain_creation_name_frozen');
 check(await page.getByRole('button',{name:'Cancel',exact:true}).isDisabled(),true,'uncertain_creation_cannot_cancel');
 check(await page.getByLabel(/^Crew build/).isDisabled(),true,'uncertain_creation_build_frozen');
 await page.getByRole('button',{name:'Retry unchanged project',exact:true}).click();await page.getByText(creationName+' was created in Setup.',{exact:true}).waitFor();await recoverCreation();
 check((await pg.query('SELECT count(*)::int AS n FROM projects WHERE name=$1',[creationName])).rows[0].n,1,'one_created_project');
 // Every definitive 409 freezes editing until the explicit reload action.
 await page.getByRole('button',{name:'Create Project',exact:true}).click();await page.getByLabel('Project name',{exact:true}).fill('Synthetic stale creation');
 await page.route('**/api/projects',route=>route.request().method()==='POST'?route.fulfill({status:409,json:{error:{type:'ConflictError',message:'Synthetic stale creation',code:'ANY_STALE'}}}):route.continue());
 await page.getByRole('button',{name:'Create Project',exact:true}).click();await page.getByRole('button',{name:'Reload project administration',exact:true}).waitFor();
 check(await page.getByRole('button',{name:'Create Project',exact:true}).isDisabled(),true,'creation_conflict_latched');
 await page.getByRole('button',{name:'Reload project administration',exact:true}).click();await page.unroute('**/api/projects');
 // Existing named-team update: actual commit then lost response, one row version.
 await page.goto(`${origin}/projects/${f.project}/survey/teams`);await page.getByRole('tab',{name:'Teams',exact:true}).click();await page.getByRole('button',{name:'View / edit team',exact:true}).click();
 const teamVersion=(await pg.query('SELECT row_version FROM survey_teams WHERE id=$1',[f.team])).rows[0].row_version;
 await page.getByLabel('Team name',{exact:true}).fill('Alpha1 retained duty team');const recoverTeam=await lost(`/api/projects/${f.project}/survey/teams`);
 await page.getByRole('button',{name:'Save team',exact:true}).click();await page.getByRole('alert').waitFor();
 check(await page.getByLabel('Team name',{exact:true}).isDisabled(),true,'uncertain_team_fields_frozen');
 check(await page.getByRole('button',{name:'Reload teams',exact:true}).isDisabled(),true,'uncertain_team_cannot_reload');
 check(await page.getByRole('button',{name:'Delete team…',exact:true}).isDisabled(),true,'uncertain_team_cannot_switch_intent');
 await page.getByRole('button',{name:'Save team',exact:true}).click();await page.getByText('Team changes saved. Operational authority and request history are unchanged.',{exact:true}).waitFor();await recoverTeam();
 check((await pg.query('SELECT row_version FROM survey_teams WHERE id=$1',[f.team])).rows[0].row_version,teamVersion+1,'one_team_revision');
 // Staffing additions also preserve the original confirmation after an actual lost commit.
 const addition=randomUUID();await pg.query("INSERT INTO users(id,tenant_id,company_id,name,email,password_hash) VALUES($1,$2,$3,'Alpha1 staffing candidate',$4,'fixture')",[addition,f.tenant,f.company,addition+'@example.invalid']);
 await pg.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'INSTRUMENT_MAN')",[f.project,addition]);
 await page.goto(`${origin}/projects/${f.project}/survey/teams`);await page.getByRole('button',{name:'Staffing for Duty Chief',exact:true}).click();
 await page.getByRole('button',{name:'Select Area',exact:true}).click();await page.getByRole('button',{name:'Active duty Area',exact:true}).click();
 await page.getByRole('button',{name:'Add Instrument Men',exact:true}).click();await page.getByRole('button',{name:'Add Instrument Man Alpha1 staffing candidate',exact:true}).click();
 await page.getByLabel('I confirm the explicit assignments and any role replacements. Promoted personnel must sign in again.',{exact:true}).check();
 const recoverStaffing=await lost(`/api/projects/${f.project}/survey/staffing`);await page.getByRole('button',{name:'Save staffing additions',exact:true}).click();await page.getByRole('alert').waitFor();
 check(await page.getByRole('button',{name:'Reload current staffing',exact:true}).isDisabled(),true,'uncertain_staffing_cannot_reload');
 check(await page.getByRole('button',{name:'Back to personnel',exact:true}).isDisabled(),true,'uncertain_staffing_cannot_close');
 check(await page.getByRole('button',{name:'Add Instrument Men',exact:true}).isDisabled(),true,'uncertain_staffing_fields_frozen');
 await page.getByRole('button',{name:'Save staffing additions',exact:true}).click();await page.getByText('Staffing saved. Existing roster members and request history are retained.',{exact:true}).waitFor();await recoverStaffing();
 check((await pg.query('SELECT count(*)::int AS n FROM crew_rosters WHERE project_id=$1 AND instrument_man_id=$2',[f.project,addition])).rows[0].n,1,'one_staffing_roster');
 // Superintendent transfer, including the formerly unsafe Reload workforce action.
 const chief=randomUUID();await pg.query("INSERT INTO users(id,tenant_id,company_id,name,email,password_hash) VALUES($1,$2,$3,'Alpha1 replacement Chief',$4,'fixture')",[chief,f.tenant,f.company,chief+'@example.invalid']);
 await pg.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'PARTY_CHIEF')",[f.project,chief]);
 await pg.query('INSERT INTO survey_reporting_links(tenant_id,project_id,superintendent_id,party_chief_id,aor_node_id,assigned_by) VALUES($1,$2,$3,$4,$5,$6)',[f.tenant,f.project,f.superintendent,chief,f.area,f.actor]);
 await login(f.superintendent);await page.goto(`${origin}/projects/${f.project}/survey/teams`);await page.getByRole('button',{name:'Reassign Duty Instrument Man',exact:true}).click();await page.getByRole('button',{name:'Alpha1 replacement Chief',exact:true}).click();
 const recoverWorkforce=await lost(`/api/projects/${f.project}/survey/workforce`);await page.getByRole('button',{name:'Save reassignment',exact:true}).click();await page.getByRole('alert').waitFor();
 check(await page.getByRole('button',{name:'Reload workforce',exact:true}).isDisabled(),true,'uncertain_workforce_reload_blocked');
 check(await page.getByRole('button',{name:'Alpha1 replacement Chief',exact:true}).isDisabled(),true,'uncertain_workforce_target_frozen');
 await page.getByRole('button',{name:'Save reassignment',exact:true}).click();await page.getByText('Crew reassignment saved. Your assigned workforce and request history are retained.',{exact:true}).waitFor();await recoverWorkforce();
 check((await pg.query('SELECT party_chief_id FROM crew_rosters WHERE project_id=$1 AND instrument_man_id=$2',[f.project,f.im])).rows[0].party_chief_id,chief,'workforce_transfer_recorded');
 await page.screenshot({path:'.local-alpha1/browser/alpha1-workforce-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});
 check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'workforce_mobile_fits');await page.screenshot({path:'.local-alpha1/browser/alpha1-workforce-mobile.png',fullPage:true});
 check(errors,[],'no_browser_runtime_errors');console.log('Alpha1 production browser checks passed: '+checks);
}finally{await pg.end();await browser.close();}
