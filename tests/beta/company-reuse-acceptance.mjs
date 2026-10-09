import {playwrightModuleURL} from '../playwright-runtime.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import jwt from 'jsonwebtoken';
import {Pool} from 'pg';
assert.equal(process.env.SWR_ROLE_ACCESS,'1');
const f=JSON.parse(await fs.readFile(process.env.SWR_ROLE_FIXTURE_FILE??'.local-roleaudit-fixture.json','utf8'));
const retained=JSON.parse(await fs.readFile('.local-demo-fixture.json','utf8'));assert.notEqual(f.schema,retained.schema);assert.match(f.schema,/^phase5_acceptance_[a-f0-9]{32}$/);
const url=new URL(process.env.DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15493');assert.equal(url.pathname,'/swr_team_isolated');url.searchParams.set('options','-c search_path='+f.schema+',public');
const db=new Pool({connectionString:url.href,max:4}),origin=process.env.SWR_ACCEPTANCE_ORIGIN;assert.match(origin,/^http:\/\/127\.0\.0\.1:\d+$/);
let checks=0;const evidence=[];
async function request(actor,path,body,method=body?'POST':'GET',key=randomUUID()){
 const state=(await db.query('SELECT tenant_id,session_version FROM users WHERE id=$1',[f[actor]])).rows[0];assert(state);
 const cookie='swr_session='+jwt.sign({sub:f[actor],tenantId:state.tenant_id,sv:state.session_version},process.env.JWT_SECRET,{expiresIn:'1h'});
 const r=await fetch(origin+path,{method,headers:{cookie,'content-type':'application/json','Idempotency-Key':key},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});
 return {status:r.status,body:await r.json(),reference:r.headers.get('x-request-id')};
}
function check(value,label){assert(value,label);checks++;evidence.push(label);}

const base=`/api/projects/${f.project}`,label='Removed Company '+randomUUID(),shots=[];
const total=async()=>(await db.query('SELECT count(*)::int n FROM companies WHERE tenant_id=$1',[f.tenant])).rows[0].n;
try{
 const created=await request('localAdmin',base+'/companies',{name:label,type:'SUBCONTRACTOR',confirmed:true});check(created.status===200,'Register owned synthetic company');const id=created.body.company.id,count=await total();
 const get=async(name)=>request('localAdmin',base+'/companies?companyName='+encodeURIComponent(name));
 let match=await get(label);check(match.status===200&&match.body.matchingCompanies.length===1&&match.body.matchingCompanies[0].associated,'Name lookup identifies current association');
 const foreign=randomUUID();await db.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,$3,'GC')",[foreign,f.foreignTenant,label]);
 check(!(await get(label)).body.matchingCompanies.some(c=>c.id===foreign),'Lookup excludes same-name company in another tenant');
 check((await request('subject',base+'/companies?companyName='+encodeURIComponent(label))).status===403,'Ordinary member cannot discover tenant company');
 check([403,404].includes((await request('localAdmin',`/api/projects/${f.foreignProject}/companies?companyName=`+encodeURIComponent(label))).status),'Foreign project cannot discover company');
 for(const name of [' ','x'.repeat(201)])check((await get(name)).status===400,'Invalid lookup name rejected');
 const records=await request('localAdmin',base+'/companies'),record=records.body.companies.find(c=>c.id===id);
 check((await request('localAdmin',base+'/companies',{companies:[{id,associatedAt:record.associatedAt}],confirmed:true},'DELETE')).status===200,'Remove only the project association');
 match=await get('  '+label.toUpperCase().replaceAll(' ','   ')+'  ');check(match.status===200&&match.body.matchingCompanies[0].id===id&&!match.body.matchingCompanies[0].associated,'Case and whitespace lookup finds retained original ID');
 check((await request('localAdmin',base+'/companies',{name:label,type:'GC',confirmed:true})).status===409,'Removed company still blocks duplicate registration');check(await total()===count,'Rejected registration preserves company count');
 const {chromium}=await import(playwrightModuleURL);const browser=await chromium.launch({channel:'msedge',headless:true});
 const row=(await db.query('SELECT tenant_id,session_version FROM users WHERE id=$1',[f.localAdmin])).rows[0],context=await browser.newContext({viewport:{width:1440,height:960}});await context.addCookies([{name:'swr_session',value:jwt.sign({sub:f.localAdmin,tenantId:row.tenant_id,sv:row.session_version},process.env.JWT_SECRET,{expiresIn:'1h'}),url:origin}]);const p=await context.newPage();
 async function shot(name){await p.waitForLoadState('networkidle');await p.evaluate(async()=>{await document.fonts.ready;document.activeElement?.blur();window.scrollTo(0,0);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});const path='.impeccable/review/'+name+'.png';await p.screenshot({path,fullPage:true});shots.push(path);check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' has no page overflow');}
 try{
  await p.goto(origin+`/projects/${f.project}/admin/companies`);await p.getByRole('textbox',{name:'New company name',exact:true}).fill('  '+label.toUpperCase()+'  ');await p.getByRole('button',{name:'Review Add to Project',exact:true}).waitFor();
  check(await p.getByText(/Removing a company from a project keeps its tenant record and history/).isVisible(),'Retained record explanation visible');check(!(await p.getByRole('button',{name:'Review company registration',exact:true}).isEnabled()),'Known retained company prevents new registration');
  check(await p.getByText('Company ID: '+id,{exact:true}).isVisible(),'Original company ID discoverable by name');await shot('company-reuse-desktop');
  await p.getByRole('button',{name:'Review Add to Project',exact:true}).click();const dialog=p.getByRole('dialog',{name:'Review Company Association'});await dialog.waitFor();check(await dialog.getByText(label,{exact:true}).isVisible()&&await dialog.getByText(id,{exact:true}).isVisible(),'Association popup shows original name and ID');check(await dialog.getByText('Subcontractor',{exact:true}).isVisible(),'Existing type retained despite registration type');check(!(await dialog.getByRole('button',{name:'Confirm action',exact:true}).isEnabled()),'Existing company reuse requires fresh consent');await shot('company-reuse-dialog-desktop');await p.setViewportSize({width:1107,height:884});await shot('company-reuse-dialog-user-1107');await p.setViewportSize({width:390,height:844});await shot('company-reuse-dialog-mobile');
  let lost=true;const observed=[];await p.route('**/api/projects/'+f.project+'/companies',async route=>{if(route.request().method()!=='POST'){await route.continue();return;}observed.push({body:route.request().postData(),key:route.request().headers()['idempotency-key']});const result=await route.fetch();if(lost){lost=false;await route.abort('failed');}else await route.fulfill({response:result});});
  await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Confirm action',exact:true}).click();await dialog.getByRole('button',{name:'Retry same action',exact:true}).waitFor();check(!(await dialog.getByRole('button',{name:'Close review',exact:true}).isEnabled()),'Unknown reassociation cannot discard held command');await dialog.getByRole('button',{name:'Retry same action',exact:true}).click();await dialog.waitFor({state:'hidden'});check(observed.length===2&&observed[0].body===observed[1].body&&observed[0].key===observed[1].key,'Reassociation retry retains exact company ID body and key');
  check((await get(label)).body.matchingCompanies[0].associated,'Reviewed reuse adds original company back to project');check(await total()===count,'Reassociation creates no replacement company');check((await db.query("SELECT count(*)::int n FROM administrative_events WHERE project_id=$1 AND event_type='project.company_associated' AND changes->>'companyId'=$2",[f.project,id])).rows[0].n===1,'Lost response retry adds one reassociation event');
 }finally{await browser.close();}
 console.log('Retained company reuse HTTP/browser checks passed: '+checks);await fs.writeFile('.local-company-reuse-results.json',JSON.stringify({checks,evidence,shots},null,2));
}finally{await db.end();}
