import assert from 'node:assert/strict';
import {Pool} from 'pg';
import jwt from 'jsonwebtoken';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import fs from 'node:fs';
const url=new URL(process.env.DATABASE_URL??'');assert.equal(process.env.SWR_TEAM_POSTGRES,'1');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15489');assert.equal(url.pathname,'/swr_team_isolated');
const pg=new Pool({connectionString:url.href}),id=n=>`99010000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const project=randomUUID(),level=randomUUID(),area=randomUUID(),other=randomUUID(),chief=randomUUID(),selected='00000000-0000-4000-8000-'+randomUUID().slice(-12),duplicate='00000000-0000-4000-8000-'+randomUUID().slice(-12),otherAssignment='00000000-0000-4000-8000-'+randomUUID().slice(-12),johnGrant=randomUUID(),jasonGrant=randomUUID(),jasonAssignment=randomUUID(),chiefAssignment=randomUUID(),reporting=randomUUID(),ticket=randomUUID();
const {chromium}=await import(pathToFileURL(process.env.SWR_PLAYWRIGHT_MODULE).href),browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const origin='http://127.0.0.1:3107',base=`${origin}/api/projects/${project}`,staffing=base+'/survey/staffing',protectedPath=base+'/survey/protected-obligations',rolePath=base+'/survey/teams';
const token=jwt.sign({sub:id(10),tenantId:id(1),sv:1},process.env.JWT_SECRET,{expiresIn:'1h',jwtid:randomUUID()});let checks=0;
const check=(a,b,message)=>{assert.deepEqual(a,b,message);checks++;};
const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.addCookies([{name:'swr_session',value:token,url:origin,httpOnly:true,sameSite:'Lax'}]);const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];let activeRelease;page.on('pageerror',e=>errors.push(e.message));
try{
 check((await pg.query('SELECT name FROM tenants WHERE id=$1',[id(1)])).rows[0]?.name,'Superintendent Area unlink disposable');
 const db=await pg.connect();try{
  await db.query('BEGIN');
  await db.query("INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,'Area unlink HTTP disposable','ACTIVE','FULL')",[project,id(1)]);
  await db.query("INSERT INTO users(id,tenant_id,company_id,name,email,password_hash) VALUES($1,$2,$3,'HTTP Chief',$4,'not-a-login-hash')",[chief,id(1),id(2),chief+'@example.test']);
  for(const [user,role] of [[id(10),'SURVEY_MANAGER'],[id(11),'SURVEY_SUPERINTENDENT'],[id(12),'SURVEY_SUPERINTENDENT'],[id(17),'REQUESTER'],[chief,'PARTY_CHIEF']])await db.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)',[project,user,role]);
  await db.query("INSERT INTO aor_levels(id,tenant_id,project_id,depth,label) VALUES($1,$2,$3,0,'Area')",[level,id(1),project]);
  for(const [node,name] of [[area,'Area1'],[other,'Area2']])await db.query('INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,name,code) VALUES($1,$2,$3,$4,$5,$5)',[node,id(1),project,level,name]);
  for(const [row,user,node] of [[selected,id(11),area],[duplicate,id(11),area],[otherAssignment,id(11),other],[jasonAssignment,id(12),other],[chiefAssignment,chief,area]])await db.query('INSERT INTO aor_assignments(id,tenant_id,project_id,user_id,aor_node_id) VALUES($1,$2,$3,$4,$5)',[row,id(1),project,user,node]);
  for(const [row,user,node] of [[johnGrant,id(11),area],[jasonGrant,id(12),other]])await db.query("INSERT INTO project_responsibility_grants(id,tenant_id,project_id,user_id,aor_node_id,responsibility,granted_by) VALUES($1,$2,$3,$4,$5,'SURVEY_REVIEWER',$6)",[row,id(1),project,user,node,id(10)]);
  await db.query('INSERT INTO survey_reporting_links(id,tenant_id,project_id,superintendent_id,party_chief_id,aor_node_id,assigned_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[reporting,id(1),project,id(11),chief,area,id(10)]);
  await db.query("INSERT INTO tickets(id,tenant_id,project_id,aor_node_id,company_id,ticket_number,requester_id,workflow_variant,status,craft,description,requested_date,ticket_type,submitted_at) VALUES($1,$2,$3,$4,$5,$6,$7,'STANDARD_APPROVAL','SUBMITTED','Survey','Area unlink HTTP preservation','2026-10-10','LAYOUT',now())",[ticket,id(1),project,area,id(2),'AREA-HTTP-'+ticket,id(10)]);
  await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 // More than one bounded evidence page; no unbounded client population.
 for(let n=1;n<=11;n++){const node=randomUUID();await pg.query('INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,name,code) VALUES($1,$2,$3,$4,$5,$6)',[node,id(1),project,level,'Z Area '+String(n).padStart(2,'0'),'Z'+n]);await pg.query('INSERT INTO aor_assignments(id,tenant_id,project_id,user_id,aor_node_id) VALUES($1,$2,$3,$4,$5)',['ffffffff-ffff-4fff-8fff-'+project.replaceAll('-','').slice(-10)+String(n).padStart(2,'0'),id(1),project,id(11),node]);}
 await page.goto(`${origin}/projects/${project}/survey/teams`);
 await page.getByLabel('Search name, email or role',{exact:true}).fill('John');await page.getByRole('button',{name:'Search',exact:true}).click();await page.getByRole('button',{name:'Change role for John',exact:true}).click();
 const flow=page.getByRole('region',{name:'Superintendent individual Area obligations',exact:true});
 check(await flow.count(),1,'Approved Superintendent cleanup control is missing');
 await flow.getByRole('button',{name:`Inspect individual assignment ${selected}`,exact:true}).waitFor();await flow.getByRole('button',{name:'Next',exact:true}).click();await flow.getByText('Z Area 11',{exact:true}).waitFor();checks++;check(await flow.getByRole('button',{name:`Inspect individual assignment ${selected}`,exact:true}).count(),0,'bounded second page');await flow.getByRole('button',{name:'Previous',exact:true}).click();await flow.getByRole('button',{name:`Inspect individual assignment ${selected}`,exact:true}).waitFor();checks++;
 const handover=page.getByRole('region',{name:'Protected Survey Reviewer obligations',exact:true}),roleForm=page.getByRole('form',{name:'Change role for John',exact:true});
 const areaForm=()=>flow.getByRole('form',{name:'Confirm Superintendent Area unlink',exact:true}),handoverForm=()=>handover.getByRole('form',{name:'Confirm Survey Reviewer handover',exact:true});
 async function prepare(){
  await handover.getByRole('button',{name:'Reload current obligations',exact:true}).click();await flow.getByRole('button',{name:'Reload current Area obligations',exact:true}).click();
  await handover.getByRole('button',{name:'Hand over Area1 review grant',exact:true}).click();await handover.getByRole('button',{name:'Select replacement Jason',exact:true}).click();
  await handover.getByRole('combobox',{name:'Additional coverage intent'}).selectOption('TEMPORARY');await handover.getByRole('checkbox',{name:/I confirm adding/}).check();await handover.getByRole('checkbox',{name:/I confirm handing over/}).check();
  await flow.getByRole('button',{name:`Inspect individual assignment ${otherAssignment}`,exact:true}).click();await flow.getByRole('button',{name:'Select covered replacement Jason',exact:true}).click();await flow.getByRole('checkbox',{name:/I confirm unlinking/}).check();
  await roleForm.getByRole('combobox').selectOption('REQUESTER');await roleForm.getByRole('checkbox').check();
  await page.waitForFunction(()=>[...document.querySelectorAll('button')].filter(b=>['Confirm handover','Confirm Area unlink','Save role'].includes(b.textContent)).every(b=>!b.disabled));
 }
 const forms={role:()=>roleForm,handover:handoverForm,area:areaForm};
 const labels={role:'Save role',handover:'Confirm handover',area:'Confirm Area unlink'};
 const resources={role:rolePath,handover:protectedPath,area:staffing};
 const methods={role:'PATCH',handover:'POST',area:'PATCH'};
 async function directedGuards(source,uncertain){
  console.log('Guard case '+source+' '+(uncertain?'uncertain':'pending'));await prepare();let release,started,finished;const ready=new Promise(r=>started=r),gate=new Promise(r=>{release=r;activeRelease=r;}),done=new Promise(r=>finished=r);let retryFinished;const retryDone=new Promise(r=>retryFinished=r);let ownRequests=[];
  const counts={role:0,handover:0,area:0};const count=req=>{for(const kind of Object.keys(resources))if(req.url()===resources[kind]&&req.method()===methods[kind])counts[kind]++;};page.on('request',count);
  await page.route(resources[source],async route=>{
   if(route.request().method()!==methods[source])return route.continue();
   const request=route.request();ownRequests.push({body:request.postData(),key:request.headers()['idempotency-key']});
   // Only fault timing/status is synthetic. The refusal and rollback are from
   // the actual API; explicit stale token prevents coverage/cleanup mutation.
   const original=request.postDataJSON(),data=source==='role'?original:{...original,expectedSnapshot:'f'.repeat(32)};
   const response=await route.fetch({postData:JSON.stringify(data)});check(response.status(),409,'actual guarded refusal');
   if(ownRequests.length===1){started();if(!uncertain)await gate;}
   await route.fulfill({response,...(uncertain&&ownRequests.length===1?{status:500}:{})});finished();if(ownRequests.length===2)retryFinished();
  });
  await forms[source]().getByRole('button',{name:labels[source],exact:true}).click();await ready;
  if(uncertain)await forms[source]().getByRole('button',{name:/Retry unchanged/}).waitFor();
  const targets=Object.keys(forms).filter(k=>k!==source);
  for(const target of targets){check(await forms[target]().getByRole('button',{name:labels[target],exact:true}).isDisabled(),true,source+' blocks '+target);await forms[target]().evaluate(f=>{f.requestSubmit();f.requestSubmit();});}
  if(!uncertain)await forms[source]().evaluate(f=>{f.requestSubmit();f.requestSubmit();});
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  for(const target of targets)check(counts[target],0,'direct '+target+' blocked by '+source);check(counts[source],1,'source duplicate suppressed');
  check(await roleForm.getByRole('button',{name:/Cancel|Reload personnel/}).isDisabled(),true,'dismissal frozen');
  if(uncertain){check(await forms[source]().getByRole('checkbox').last().isDisabled(),true,'uncertain confirmation frozen');await forms[source]().getByRole('button',{name:/Retry unchanged/}).click();await retryDone;await page.waitForFunction(()=>![...document.querySelectorAll('button')].some(b=>b.textContent?.includes('Retry unchanged')));check(ownRequests.length,2,'unchanged retry sent');check(ownRequests[1],ownRequests[0],'same input/key across uncertain retry');}
  else{release();await done;}
  await page.unroute(resources[source]);page.off('request',count);
  await page.waitForFunction(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent==='Reload current Area obligations');return button&&!button.disabled;});
 }
 for(const source of ['role','handover','area']){await directedGuards(source,false);await directedGuards(source,true);}
 await flow.getByRole('button',{name:'Reload current Area obligations',exact:true}).click();await flow.getByRole('button',{name:`Inspect individual assignment ${otherAssignment}`,exact:true}).click();await flow.getByLabel('Search covered Superintendents',{exact:true}).fill('No matching person');await flow.getByRole('button',{name:'Search',exact:true}).click();await flow.getByText('No covered Superintendents match this search. Clear the search or change the filters.',{exact:true}).waitFor();checks++;check(await flow.getByText(/No current Superintendent has complete exact-Area coverage here/).count(),0,'filtered empty page is not missing project coverage');await flow.getByRole('button',{name:'Keep individual assignment',exact:true}).click();
 // A delayed old selected-link response must be ignored after cancellation.
 await handover.getByRole('button',{name:'Keep current grant',exact:true}).click();await flow.getByRole('button',{name:'Reload current Area obligations',exact:true}).click();
 let releaseRead,readStarted,readFinished;const oldReady=new Promise(r=>readStarted=r),oldGate=new Promise(r=>releaseRead=r),oldDone=new Promise(r=>readFinished=r);
 await page.route(staffing+'?**',async route=>{if(route.request().url().includes('mode=superintendent-area-replacements')){const response=await route.fetch();readStarted();await oldGate;await route.fulfill({response});readFinished();}else await route.continue();});
 await flow.getByRole('button',{name:`Inspect individual assignment ${otherAssignment}`,exact:true}).click();await oldReady;await flow.getByRole('button',{name:'Keep individual assignment',exact:true}).click();releaseRead();await oldDone;await page.unroute(staffing+'?**');
 check(await flow.getByRole('button',{name:'Select covered replacement Jason',exact:true}).count(),0,'late cancelled candidate ignored');
 // A real population change between bounded reads must invalidate the
 // original displayed draft; searching must never rebase it automatically.
 await flow.getByRole('button',{name:`Inspect individual assignment ${otherAssignment}`,exact:true}).click();await flow.getByRole('button',{name:'Select covered replacement Jason',exact:true}).click();await flow.getByRole('checkbox',{name:/I confirm unlinking/}).check();
 await pg.query('INSERT INTO aor_assignments(tenant_id,project_id,user_id,aor_node_id) VALUES($1,$2,$3,$4)',[id(1),project,id(12),other]);
 await flow.getByLabel('Search covered Superintendents',{exact:true}).fill('Jason');await flow.getByRole('button',{name:'Search',exact:true}).click();await flow.getByRole('alert').filter({hasText:/^Area obligations changed/}).waitFor();check(await flow.getByRole('button',{name:'Confirm Area unlink',exact:true}).isDisabled(),true,'changed search read cannot rebase');await flow.getByRole('button',{name:'Keep individual assignment',exact:true}).click();check(await flow.getByRole('alert').filter({hasText:/^Area obligations changed/}).count(),1,'read mismatch survives cancel');await flow.getByRole('button',{name:'Reload current Area obligations',exact:true}).click();
 // Different page/search tokens latch stale without overwriting the first one.
 await flow.getByLabel('Search individual assignments by Area',{exact:true}).fill('Area1');await flow.getByRole('button',{name:'Search',exact:true}).click();
 await flow.getByRole('button',{name:`Inspect individual assignment ${selected}`,exact:true}).click();
 await flow.getByRole('button',{name:'View dependent Chiefs',exact:true}).click();await flow.getByText('HTTP Chief',{exact:true}).waitFor();checks++;
 check(await flow.getByText(/existing Staffing editor/).count()>0,true,'existing reporting guidance');
 await flow.getByRole('button',{name:'Choose covered replacement',exact:true}).click();await flow.getByText(/No current Superintendent has complete exact-Area coverage here/).waitFor();checks++;check(await flow.getByText(/otherwise.*separately authorized administration/i).count(),1,'legacy no-source recovery guidance');
 await flow.getByRole('button',{name:'Keep individual assignment',exact:true}).click();
 // Complete real John-to-Jason workflow through existing separate tools.
 await handover.getByRole('button',{name:'Reload current obligations',exact:true}).click();await handover.getByRole('button',{name:'Hand over Area1 review grant',exact:true}).click();await handover.getByRole('button',{name:'Select replacement Jason',exact:true}).click();await handover.getByRole('combobox',{name:'Additional coverage intent'}).selectOption('TEMPORARY');await handover.getByRole('checkbox',{name:/I confirm adding/}).check();await handover.getByRole('checkbox',{name:/I confirm handing over/}).check();await handover.getByRole('button',{name:'Confirm handover',exact:true}).click();await handover.getByRole('status').filter({hasText:/One Survey Reviewer grant handed over/}).waitFor();
 check(await flow.getByRole('alert').filter({hasText:/^Area obligations changed/}).count(),1,'sibling handover invalidates area draft');check(await roleForm.getByRole('checkbox').isChecked(),false,'handover clears separate role consent');
 const coverageBefore=(await pg.query('SELECT to_jsonb(a) AS row FROM aor_assignments a WHERE id=$1',[jasonAssignment])).rows;
 // Existing Chief staffing is deliberately invoked via the real API; this new
 // Area section contains guidance, not a second reporting editor.
 const snap=await context.request.get(staffing+'?mode=snapshot'),snapshot=await snap.json();check(snap.status(),200);
 const transfer=await context.request.post(staffing,{headers:{'Idempotency-Key':randomUUID()},data:{expectedSnapshot:snapshot.snapshotToken,partyChiefId:chief,areaId:area,superintendentId:id(12),instrumentManIds:[],confirmRoleChanges:true}});check(transfer.status(),200);
 await flow.getByRole('button',{name:'Reload current Area obligations',exact:true}).click();await flow.getByRole('button',{name:`Inspect individual assignment ${selected}`,exact:true}).click();await flow.getByRole('button',{name:'Select covered replacement Jason',exact:true}).click();await flow.getByRole('checkbox',{name:/I confirm unlinking/}).check();
 check(await flow.getByRole('heading').first().evaluate(n=>document.activeElement===n),false,'checkbox gets explicit user focus');
 let attempts=[];await page.route(staffing,async route=>{if(route.request().method()!=='PATCH')return route.continue();attempts.push({body:route.request().postData(),key:route.request().headers()['idempotency-key']});const response=await route.fetch();check(response.status(),200,'real cleanup committed');if(attempts.length===1)await route.abort('failed');else await route.fulfill({response});});
 await flow.getByRole('button',{name:'Confirm Area unlink',exact:true}).click();await flow.getByRole('button',{name:'Retry unchanged Area unlink',exact:true}).waitFor();
 check(await flow.getByRole('button',{name:'Keep individual assignment',exact:true}).isDisabled(),true,'lost-response draft frozen');await areaForm().evaluate(f=>{f.requestSubmit();f.requestSubmit();});
 await flow.getByRole('status').filter({hasText:/One individual Area assignment unlinked/}).waitFor();await page.unroute(staffing);check(attempts.length,2,'retry duplicate guarded');check(attempts[1],attempts[0],'unchanged lost-response recovery');
 check(await flow.getByRole('heading').first().evaluate(n=>document.activeElement===n),true,'success restores heading focus');
 check((await pg.query("SELECT count(*)::int AS n FROM survey_staffing_events WHERE project_id=$1 AND payload->>'action'='unlink-superintendent-area'",[project])).rows[0].n,1,'one exact audit after lost response');
 check((await pg.query('SELECT deactivated_at FROM aor_assignments WHERE id=$1',[duplicate])).rows[0].deactivated_at,null,'duplicate retained');check((await pg.query('SELECT deactivated_at FROM aor_assignments WHERE id=$1',[otherAssignment])).rows[0].deactivated_at,null,'other Area retained');check((await pg.query('SELECT to_jsonb(a) AS row FROM aor_assignments a WHERE id=$1',[jasonAssignment])).rows,coverageBefore,'Jason Area2 unchanged');check((await pg.query('SELECT role FROM project_memberships WHERE project_id=$1 AND user_id=$2',[project,id(11)])).rows[0].role,'SURVEY_SUPERINTENDENT','no automatic demotion');
 await roleForm.getByRole('checkbox').check();await roleForm.getByRole('button',{name:'Save role',exact:true}).click();await roleForm.getByRole('alert').waitFor();checks++;
 // Real stale mutation409 stays latched through cancellation and read search.
 await flow.getByRole('button',{name:`Inspect individual assignment ${duplicate}`,exact:true}).click();await flow.getByRole('button',{name:'Select covered replacement Jason',exact:true}).click();await flow.getByRole('checkbox',{name:/I confirm unlinking/}).check();
 const staleWitness=randomUUID();await pg.query('INSERT INTO aor_assignments(id,tenant_id,project_id,user_id,aor_node_id) VALUES($1,$2,$3,$4,$5)',[staleWitness,id(1),project,id(12),other]);
 await flow.getByRole('button',{name:'Confirm Area unlink',exact:true}).click();await flow.getByRole('alert').filter({hasText:/^Area obligations changed/}).waitFor();await flow.getByRole('button',{name:'Keep individual assignment',exact:true}).click();check(await flow.getByRole('alert').filter({hasText:/^Area obligations changed/}).count(),1,'cancel keeps stale');
 await flow.getByRole('button',{name:'Reload current Area obligations',exact:true}).click();await flow.getByRole('button',{name:`Inspect individual assignment ${duplicate}`,exact:true}).click();await flow.getByRole('button',{name:'Select covered replacement Jason',exact:true}).click();await flow.getByRole('checkbox',{name:/I confirm unlinking/}).check();check(await flow.getByRole('button',{name:'Confirm Area unlink',exact:true}).isDisabled(),false,'deliberate reload clears stale');
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await flow.getByRole('heading').first().scrollIntoViewIfNeeded();check(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'no horizontal overflow');if(process.env.SWR_QA_CAPTURE==='1'){fs.mkdirSync('.local/area-unlink-captures',{recursive:true});await page.evaluate(()=>{window.scrollTo(0,0);document.activeElement?.blur();});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.screenshot({path:`.local/area-unlink-captures/confirm-${width}.png`,fullPage:true});}}
 // Unsupported nested/retired assignments remain readable evidence, and
 // retired/inactive reporting never disappears from the exact subtree page.
 await flow.getByRole('button',{name:'Keep individual assignment',exact:true}).click();check(await flow.getByRole('heading').first().evaluate(n=>document.activeElement===n),true,'cancel restores heading focus');
 const sublevel=randomUUID(),retired=randomUUID(),unsupported=randomUUID(),oldReport=randomUUID();
 await pg.query("INSERT INTO aor_levels(id,tenant_id,project_id,depth,label) VALUES($1,$2,$3,1,'Subarea')",[sublevel,id(1),project]);await pg.query("INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,parent_id,name,code,retired_at) VALUES($1,$2,$3,$4,$5,'Retired child','RC',now())",[retired,id(1),project,sublevel,area]);await pg.query('INSERT INTO aor_assignments(id,tenant_id,project_id,user_id,aor_node_id) VALUES($1,$2,$3,$4,$5)',[unsupported,id(1),project,id(11),retired]);await pg.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'VIEWER')",[project,id(13)]);await pg.query('INSERT INTO survey_reporting_links(id,tenant_id,project_id,superintendent_id,party_chief_id,aor_node_id,assigned_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[oldReport,id(1),project,id(11),id(13),retired,id(10)]);
 await flow.getByRole('button',{name:'Reload current Area obligations',exact:true}).click();await flow.getByRole('button',{name:`Inspect individual assignment ${unsupported}`,exact:true}).waitFor();check(await flow.getByText(/live top-level Area/i).count()>0,true,'unsupported row guidance');
 await flow.getByRole('button',{name:`Inspect individual assignment ${unsupported}`,exact:true}).click();await flow.getByRole('alert').filter({hasText:/Replacement selection requires a live top-level Area/}).waitFor();check(await flow.getByRole('alert').filter({hasText:/^Area obligations changed/}).count(),1,'every definitive read409 latches stale');await flow.getByRole('button',{name:'Keep individual assignment',exact:true}).click();check(await flow.getByRole('alert').filter({hasText:/^Area obligations changed/}).count(),1,'read409 survives cancel');await flow.getByRole('button',{name:'Reload current Area obligations',exact:true}).click();
 await flow.getByRole('button',{name:`Inspect individual assignment ${duplicate}`,exact:true}).click();await flow.getByRole('button',{name:'View dependent Chiefs',exact:true}).click();await flow.getByText('Former Chief',{exact:true}).waitFor();check(await flow.getByText(/Retired Area.*Inactive/).count()>0,true,'inactive retired link visible');check(await flow.getByText(/separate approved/i).count()>0,true,'inactive reporting guidance');
 await pg.query("UPDATE projects SET status='ARCHIVED' WHERE id=$1",[project]);await page.reload();await page.getByLabel('Search name, email or role',{exact:true}).fill('John');await page.getByRole('button',{name:'Search',exact:true}).click();await page.getByRole('button',{name:'View role and obligations for John',exact:true}).click();await flow.getByText(/read-only Area evidence/).waitFor();check(await roleForm.getByRole('button',{name:'Save role',exact:true}).isDisabled(),true,'archived role disabled');check(await flow.getByRole('button',{name:'Confirm Area unlink',exact:true}).count(),0,'archived evidence cannot confirm');
 check(errors,[],'no page errors');console.log(`PASS ${checks} Superintendent Area browser checks at1440/390; synthetic delay/status/response loss, actual API/session/database; fixture project ${project}`);

}catch(error){console.error('Primary browser failure',error);throw error;}finally{activeRelease?.();await browser.close();await pg.end();}
