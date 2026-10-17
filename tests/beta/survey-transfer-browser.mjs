import {playwrightModuleURL} from '../playwright-runtime.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import jwt from 'jsonwebtoken';
import {Pool} from 'pg';
assert.equal(process.env.SWR_SURVEY_WORKFLOW_TEST,'1');
const f=JSON.parse(await fs.readFile('.local-survey-ui.json','utf8')),r=JSON.parse(await fs.readFile('.local-survey-roles.json','utf8')),owned=JSON.parse(await fs.readFile('.local-survey-workflow-db.json','utf8'));
const url=new URL(owned.databaseUrl);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15495');assert.equal(url.pathname,'/swr_survey_workflow');assert.equal(f.origin,'http://127.0.0.1:3150');
const db=new Pool({connectionString:url.href});
const {chromium}=await import(playwrightModuleURL);
const browser=await chromium.launch({channel:'msedge',headless:true});
const checks=[];function check(value,label){assert(value,label);checks.push(label);}
async function session(id){const c=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});await c.addCookies([{name:'swr_session',value:jwt.sign({sub:id,tenantId:f.tenant,sv:1},f.secret,{algorithm:'HS256',expiresIn:'1h',jwtid:randomUUID()}),url:f.origin,httpOnly:true,sameSite:'Lax'}]);return c;}
try{
 const manager=await session(f.manager),p=await manager.newPage();
 const available=randomUUID();
 await db.query("INSERT INTO users(id,tenant_id,company_id,name,email,password_hash) VALUES($1,$2,$3,'Unassigned test surveyor',$4,'no-password-login')",[available,f.tenant,f.company,available+'@example.test']);
 await db.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'INSTRUMENT_MAN')",[f.project,available]);
 const before=(await db.query('SELECT id,assigned_party_chief_id,assigned_instrument_man_id,row_version FROM tickets WHERE project_id=$1 ORDER BY id',[f.project])).rows;
 for(const [person,destination] of [[r.im,r.otherPC],[r.im,r.pc],[available,r.pc]]){
  await p.goto(`${f.origin}/projects/${f.project}/survey/teams`);
  await p.getByRole('button',{name:'Coordinate Manpower Movement',exact:false}).click();
  const panel=p.locator('fieldset.manpower-movement-panel');
  await panel.locator('select').first().selectOption('INSTRUMENT_MAN');
  await panel.locator('select').nth(1).selectOption(person);
  await panel.locator('select').nth(2).selectOption(destination);
  await panel.getByRole('button',{name:'Preview manpower move',exact:true}).click();
  await panel.getByLabel('Reason (10–1000 characters)',{exact:true}).fill('Move surveyor to the selected team');
  await panel.getByLabel('I confirm the displayed move and preservation of existing request assignments.',{exact:true}).check();
  await panel.getByRole('button',{name:'Confirm manpower move',exact:true}).click();
  await panel.getByText(/Manpower move saved/).waitFor();
  const membership=(await db.query('SELECT team_id FROM survey_team_members WHERE project_id=$1 AND user_id=$2 AND deactivated_at IS NULL',[f.project,person])).rows;
  check(membership.length===1&&membership[0].team_id===(destination===r.pc?r.ownTeam:r.otherTeam),person===available?'Manager places an unassigned Instrument Man into team and crew through review controls':'Manager moves Instrument Man '+(destination===r.pc?'back to original team':'between Superintendent-led teams')+' through review controls');
  check((await db.query('SELECT party_chief_id FROM crew_rosters WHERE project_id=$1 AND instrument_man_id=$2 AND deactivated_at IS NULL',[f.project,person])).rows[0]?.party_chief_id===destination,'Crew link matches selected destination Chief');
 }
 check(JSON.stringify(before)===JSON.stringify((await db.query('SELECT id,assigned_party_chief_id,assigned_instrument_man_id,row_version FROM tickets WHERE project_id=$1 ORDER BY id',[f.project])).rows),'Personnel transfer preserves existing request assignments and versions');
 const ss=await session(r.ss);check((await ss.request.get(`${f.origin}/api/projects/${f.project}/survey/reorganization?kind=INSTRUMENT_MAN&instrumentManId=${r.im}&partyChiefId=${r.otherPC}`)).status()===403,'Superintendent cannot preview cross-team transfers');
 console.log(JSON.stringify({checks},null,2));
}catch(error){for(const context of browser.contexts())for(const page of context.pages())console.error((await page.locator('body').innerText()).slice(0,3500));throw error;}finally{await browser.close();await db.end();}
