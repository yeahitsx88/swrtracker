import {playwrightModuleURL} from '../playwright-runtime.mjs';
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {randomUUID} from 'node:crypto';import jwt from 'jsonwebtoken';import {Pool} from 'pg';
assert.equal(process.env.SWR_SURVEY_WORKFLOW_TEST,'1');
const f=JSON.parse(await fs.readFile('.local-survey-ui.json','utf8')),r=JSON.parse(await fs.readFile('.local-survey-roles.json','utf8')),owned=JSON.parse(await fs.readFile('.local-survey-workflow-db.json','utf8'));
const url=new URL(owned.databaseUrl);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15495');assert.equal(url.pathname,'/swr_survey_workflow');assert.equal(f.origin,'http://127.0.0.1:3150');
const db=new Pool({connectionString:url.href}),ticket=randomUUID(),number='DELEGATE-'+randomUUID().slice(0,8);
await db.query("INSERT INTO tickets(id,tenant_id,project_id,company_id,requester_id,workflow_variant,status,craft,description,aor_node_id,ticket_type,requested_date,ticket_number) VALUES($1,$2,$3,$4,$5,'STANDARD_APPROVAL','APPROVED','Survey','Delegation browser check',$6,'LAYOUT',CURRENT_DATE,$7)",[ticket,f.tenant,f.project,f.company,r.requester,f.area,number]);
const {chromium}=await import(playwrightModuleURL);const b=await chromium.launch({channel:'msedge',headless:true});const checks=[];const check=(v,label)=>{assert(v,label);checks.push(label);};
async function session(id){const c=await b.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});await c.addCookies([{name:'swr_session',value:jwt.sign({sub:id,tenantId:f.tenant,sv:1},f.secret,{algorithm:'HS256',expiresIn:'1h',jwtid:randomUUID()}),url:f.origin,httpOnly:true,sameSite:'Lax'}]);return c;}
try{
 const manager=await session(f.manager),handoffOptions={data:{assignedPartyChiefId:r.pc,assignedInstrumentManId:null},headers:{'Idempotency-Key':randomUUID()}};
 const handoff=await manager.request.post(`${f.origin}/api/tickets/${ticket}/assign`,handoffOptions);check(handoff.status()===200,'Manager hands approved work to a specific Chief');
 const replay=await manager.request.post(`${f.origin}/api/tickets/${ticket}/assign`,handoffOptions);check(replay.status()===200,'Exact assignment retry succeeds');
 check((await db.query("SELECT count(*)::int n FROM survey_notifications WHERE ticket_id=$1 AND title='Work assigned to you'",[ticket])).rows[0].n===1,'Exact retry creates no duplicate handoff notices');
 const chief=await session(r.pc),p=await chief.newPage();await p.goto(`${f.origin}/projects/${f.project}/crew/work`);
 const row=p.getByRole('row').filter({hasText:number});await row.getByRole('button',{name:'Choose a crew',exact:true}).click();const dialog=p.getByRole('dialog');
 await dialog.getByLabel('Instrument Man',{exact:true}).selectOption(r.im);check(await dialog.getByLabel('Party Chief',{exact:true}).isDisabled(),'Chief identity is fixed during own-crew assignment');
 check(await dialog.locator(`option[value="${r.otherPC}"]`).count()===0,'Other Chiefs are not offered');await dialog.getByLabel('I confirm this crew assignment.',{exact:true}).check();await dialog.getByRole('button',{name:'Confirm crew assignment',exact:true}).click();await dialog.waitFor({state:'hidden'});
 check((await db.query('SELECT status FROM tickets WHERE id=$1',[ticket])).rows[0].status==='ASSIGNED','Chief assigns an Instrument Man through Crew Work');
 await p.getByRole('button',{name:'Refresh',exact:true}).click();await row.getByRole('button',{name:'Choose a crew',exact:true}).waitFor();check(await row.getByRole('button',{name:'Start Work',exact:true}).count()===0,'Chief is not offered Instrument Man start action');
 const im=await session(r.im),ip=await im.newPage();await ip.goto(`${f.origin}/projects/${f.project}/crew/work`);const ir=ip.getByRole('row').filter({hasText:number});await ir.getByRole('button',{name:'Start Work',exact:true}).click();await ir.getByRole('button',{name:'Complete Work',exact:true}).waitFor();check(true,'Assigned Instrument Man starts work through visible field action');
 check(await ir.getByRole('button',{name:'Choose a crew',exact:true}).count()===0,'Instrument Man has no crew-management action');await ip.screenshot({path:'.local-survey-instrument-work.png',fullPage:true});
 console.log(JSON.stringify({checks},null,2));await fs.writeFile('.local-survey-chief-work-results.json',JSON.stringify({checks},null,2));
}finally{await b.close();await db.end();}
