import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const local='.local-customer-rehearsal',out='audits/customer-lifecycle-rehearsal/operations',origin='http://localhost:3116';
const s=JSON.parse(await fs.readFile(local+'/operations.json','utf8')),f=JSON.parse(await fs.readFile(local+'/manifest.json','utf8')).datasets.human;
const {chromium}=await import(pathToFileURL(process.env.SWR_PLAYWRIGHT_MODULE).href),browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
async function session(actor){const c=await browser.newContext({viewport:{width:1440,height:1000}}),p=await c.newPage();await p.goto(origin+'/login');await p.getByLabel('Tenant ID',{exact:true}).fill(f.tenant);await p.getByLabel('Email',{exact:true}).fill(actor.email);await p.getByLabel('Password',{exact:true}).fill(f.password);await p.getByRole('button',{name:'Sign In',exact:true}).click();await p.waitForURL('**/projects');return {c,p};}
const checks=[];
try{
 const oldIncoming=await session(s.superintendents[0]),oldCoverage=await session(s.superintendents[1]),admin=await session(s.successor),p=admin.p;
 await p.goto(`${origin}/projects/${s.project.id}/admin`);await p.getByLabel('Find a project member',{exact:true}).fill(s.superintendents[0].email);
 await p.getByText(s.superintendents[0].email,{exact:false}).first().waitFor();await p.waitForLoadState('networkidle');await p.getByRole('button',{name:'Appoint as Survey Manager',exact:true}).click();await fs.writeFile(out+'/manager-handover-panel-debug.txt',await p.locator('body').innerText());
 await p.getByLabel('Outgoing Survey Manager').selectOption(s.manager.id);await p.getByLabel('Superintendent taking over coverage').selectOption(s.superintendents[1].id);
 await p.getByRole('button',{name:'Preview manager handover',exact:true}).click();await p.getByLabel('Reason for manager handover',{exact:true}).waitFor();
 await p.getByLabel('Reason for manager handover',{exact:true}).fill('Project leadership approved Taylor promotion after Sam was fired; Morgan takes Structures coverage.');
 await p.getByLabel('I confirm the displayed promotion and coverage transfer for this project.',{exact:true}).check();
 await p.waitForLoadState('networkidle');await fs.mkdir('.impeccable/review/manager-handover',{recursive:true});
 await p.screenshot({path:out+'/manager-handover-desktop.png',fullPage:true});await fs.copyFile(out+'/manager-handover-desktop.png','.impeccable/review/manager-handover/desktop.png');
 await p.setViewportSize({width:390,height:844});await p.screenshot({path:out+'/manager-handover-mobile.png',fullPage:true});await fs.copyFile(out+'/manager-handover-mobile.png','.impeccable/review/manager-handover/mobile.png');
 checks.push({name:'Mobile handover has no horizontal document overflow',pass:await p.evaluate(()=>document.documentElement.scrollWidth)<=390});await p.setViewportSize({width:1440,height:1000});
 const response=p.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/survey/manager-handover')&&r.request().method()==='POST');
 await p.getByRole('button',{name:'Confirm manager appointment',exact:true}).click();const r=await response;assert.equal(r.status(),200);const result=await r.json();
 await p.getByText(/appointed as Survey Manager\. Coverage transferred/).waitFor();await p.screenshot({path:out+'/manager-handover-result.png',fullPage:true});
 await fs.writeFile(local+'/manager-handover-command.json',JSON.stringify({body:r.request().postDataJSON(),key:r.request().headers()['idempotency-key'],result:result.result}));
 checks.push({name:'Actual admin UI confirmed guarded manager appointment',pass:true,eventId:result.result.eventId});
 for(const [name,c] of [['Incoming Superintendent',oldIncoming.c],['Coverage Superintendent',oldCoverage.c]]){const stale=await c.request.get(`${origin}/api/projects/${s.project.id}/members`);checks.push({name:name+' prior session is revoked',pass:stale.status()===401,status:stale.status()});}
 await fs.writeFile(out+'/manager-handover-browser.json',JSON.stringify({at:new Date().toISOString(),checks,result:result.result},null,2));assert.ok(checks.every(c=>c.pass));console.log(JSON.stringify({checks:checks.length,passed:true}));
}finally{await browser.close();}
