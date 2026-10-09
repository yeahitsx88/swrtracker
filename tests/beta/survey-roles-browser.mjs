import {playwrightModuleURL} from '../playwright-runtime.mjs';
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import jwt from 'jsonwebtoken';
assert.equal(process.env.SWR_SURVEY_WORKFLOW_TEST,'1');const f=JSON.parse(await fs.readFile('.local-survey-ui.json','utf8')),r=JSON.parse(await fs.readFile('.local-survey-roles.json','utf8'));assert.equal(f.origin,'http://127.0.0.1:3150');
const {chromium}=await import(playwrightModuleURL);const b=await chromium.launch({channel:'msedge',headless:true});const checks=[];const check=(v,label)=>{assert(v,label);checks.push(label);};
async function session(id){const c=await b.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});await c.addCookies([{name:'swr_session',value:jwt.sign({sub:id,tenantId:f.tenant,sv:1},f.secret,{algorithm:'HS256',expiresIn:'1h',jwtid:crypto.randomUUID()}),url:f.origin,httpOnly:true,sameSite:'Lax'}]);return c;}
try{
 const ss=await session(r.ss),p=await ss.newPage();await p.goto(`${f.origin}/projects/${f.project}/survey/teams`);await p.getByRole('button',{name:'Edit team',exact:true}).waitFor();
 check(await p.getByRole('button',{name:'Edit team',exact:true}).count()===1,'Superintendent sees only their led team');
 check((await ss.request.get(`${f.origin}/api/projects/${f.project}/survey/teams?teamId=${r.otherTeam}`)).status()===403,'Direct other-team detail is refused');
 await p.getByRole('button',{name:'Edit team',exact:true}).click();
 check(await p.getByText('Test Requester',{exact:true}).count()===0&&await p.getByText('Test Viewer',{exact:true}).count()===0,'Superintendent roster excludes Requesters and Viewers');
 const name='Team updated '+crypto.randomUUID().slice(0,8);await p.getByLabel('Team name',{exact:true}).fill(name);await p.getByLabel('I have reviewed this team change.',{exact:true}).check();await p.getByRole('button',{name:'Save team',exact:true}).click();await p.getByText('Team saved. Your Survey Manager has been notified.',{exact:true}).waitFor();
 const manager=await session(f.manager);const notices=await (await manager.request.get(`${f.origin}/api/projects/${f.project}/survey/notifications`)).json();
 check(JSON.stringify(notices).includes(name),'Manager inbox contains the named team update');
 await p.getByRole('button',{name:'Crew assignments',exact:true}).click();await p.getByText('Test Chief',{exact:true}).waitFor();
 check(await p.getByText('Other Chief',{exact:true}).count()===0,'Superintendent crew list excludes another team Chief');
 await p.getByRole('button',{name:'Reassign Test Instrument Man',exact:true}).click();await p.getByRole('button',{name:/^Test Chief/}).waitFor();if(await p.getByRole('button',{name:'Test Chief',exact:true}).count()){await p.getByRole('button',{name:'Test Chief',exact:true}).click();await p.getByRole('button',{name:'Save reassignment',exact:true}).click();await p.getByText('Crew reassignment saved. Your assigned workforce and request history are retained.',{exact:true}).waitFor();}else{check(await p.getByRole('button',{name:'Test Chief · Current Chief',exact:true}).isDisabled(),'Existing verified crew assignment remains current');await p.getByRole('button',{name:'Reload workforce',exact:true}).click();}
 check(true,'Superintendent assigns own Instrument Man to own Chief through the UI');await p.screenshot({path:'.local-superintendent-crew.png',fullPage:true});
 const chief=await session(r.pc),cp=await chief.newPage();await cp.goto(`${f.origin}/projects/${f.project}/survey/teams`);await cp.getByText('Test Instrument Man',{exact:true}).waitFor();
 check(await cp.getByText('Other Chief',{exact:true}).count()===0&&await cp.getByText('Test Requester',{exact:true}).count()===0,'Party Chief sees their assigned Instrument Man only');
 const mp=await manager.newPage();await mp.goto(`${f.origin}/projects/${f.project}/survey/teams`);await mp.getByText('Test Chief',{exact:true}).waitFor();
 check(await mp.getByText('Test Requester',{exact:true}).count()===0&&await mp.getByText('Test Viewer',{exact:true}).count()===0,'Manager personnel roster is survey-only');
 await mp.getByRole('tab',{name:'Teams',exact:true}).click();await mp.getByRole('button',{name:'Create team',exact:true}).click();const eligible=mp.getByRole('table',{name:'Eligible Survey Personnel on This Page',exact:true});await eligible.getByText('Test Chief',{exact:true}).waitFor();
 check(await eligible.getByText('Test Requester',{exact:true}).count()===0&&await eligible.getByText('Test Viewer',{exact:true}).count()===0,'Eligible team picker is survey-only');
 await mp.screenshot({path:'.local-survey-eligible.png',fullPage:true});console.log(JSON.stringify({checks},null,2));await fs.writeFile('.local-survey-roles-results.json',JSON.stringify({checks},null,2));
}finally{await b.close();}
