import {playwrightModuleURL} from '../playwright-runtime.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url),{Pool}=require('pg'),bcrypt=require('bcrypt');
const origin='http://127.0.0.1:3107',url=new URL(process.env.DATABASE_URL??'');
if(process.env.SWR_TEAM_POSTGRES!=='1'||url.hostname!=='127.0.0.1'||url.port!=='15489'||url.pathname!=='/swr_team_isolated')throw Error('Owned disposable loopback only');
const {chromium}=await import(playwrightModuleURL);
const id=n=>`98000000-0000-4000-8000-${String(n).padStart(12,'0')}`,pg=new Pool({connectionString:url.href});
let checks=0;const check=(a,b,message)=>{assert.deepEqual(a,b,message);checks++;};
const password='Synthetic-reviewer-browser-only',hash=await bcrypt.hash(password,10);
const project=randomUUID(),level=randomUUID(),area=randomUUID(),area2=randomUUID(),grant=randomUUID(),otherGrant=randomUUID();
const extra=[3,4,5,6].map(n=>({name:`Area${n}`,area:randomUUID(),grant:randomUUID(),replacementGrant:randomUUID(),replacementAssignment:randomUUID()}));
const api=`/api/projects/${project}/survey/protected-obligations`;
const browser=await chromium.launch({channel:'msedge',headless:true});
async function session(n,width=1440){
 const response=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tenantId:id(1),email:`${n}@reviewer.example.invalid`,password})});check(response.status,200,'real login');
 const bearer=response.headers.get('set-cookie')?.match(/swr_session=([^;]+)/)?.[1];assert.ok(bearer);
 const context=await browser.newContext({viewport:{width,height:850},reducedMotion:'reduce'});
 // Loopback-only transport of real production Secure session cookie; auth unchanged.
 await context.addCookies([{name:'swr_session',value:bearer,url:origin,httpOnly:true,sameSite:'Strict',secure:false}]);
 const page=await context.newPage();page.setDefaultTimeout(12000);return{page,context};
}
try{
 check((await pg.query('SELECT name FROM tenants WHERE id=$1',[id(1)])).rows[0]?.name,'Protected reviewer disposable');
 await pg.query('UPDATE users SET password_hash=$1 WHERE tenant_id=$2 AND id=ANY($3::uuid[])',[hash,id(1),[10,11,12,13,14,17,18,16].map(id)]);
 const db=await pg.connect();try{
  await db.query('BEGIN');await db.query("INSERT INTO projects(id,tenant_id,name,status) VALUES($1,$2,'Reviewer browser disposable','ACTIVE')",[project,id(1)]);
  for(const[n,role]of[[10,'SURVEY_MANAGER'],[11,'SURVEY_SUPERINTENDENT'],[12,'SURVEY_SUPERINTENDENT'],[13,'SURVEY_SUPERINTENDENT'],[14,'PROJECT_ADMIN'],[16,'PARTY_CHIEF'],[18,'SURVEY_MANAGER']])await db.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)',[project,id(n),role]);
  await db.query("INSERT INTO aor_levels(id,tenant_id,project_id,depth,label) VALUES($1,$2,$3,0,'Area')",[level,id(1),project]);
  for(const[node,name]of[[area,'Area1'],[area2,'Area2']])await db.query('INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,name,code) VALUES($1,$2,$3,$4,$5,$5)',[node,id(1),project,level,name]);
  for(const[g,user,node]of[[grant,id(11),area],[otherGrant,id(12),area2]]){
   await db.query("INSERT INTO project_responsibility_grants(id,tenant_id,project_id,user_id,aor_node_id,responsibility,granted_by) VALUES($1,$2,$3,$4,$5,'SURVEY_REVIEWER',$6)",[g,id(1),project,user,node,id(14)]);
   await db.query('INSERT INTO aor_assignments(id,tenant_id,project_id,user_id,aor_node_id) VALUES($1,$2,$3,$4,$5)',[randomUUID(),id(1),project,user,node]);
  }
  for(const item of extra){
   await db.query('INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,name,code) VALUES($1,$2,$3,$4,$5,$5)',[item.area,id(1),project,level,item.name]);
   await db.query('INSERT INTO project_responsibility_grants(id,tenant_id,project_id,user_id,aor_node_id,responsibility,granted_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[item.grant,id(1),project,id(11),item.area,item.name==='Area6'?'FIELD_COORDINATOR':'SURVEY_REVIEWER',id(14)]);
   if(item.name==='Area3'||item.name==='Area4')await db.query("INSERT INTO project_responsibility_grants(id,tenant_id,project_id,user_id,aor_node_id,responsibility,granted_by) VALUES($1,$2,$3,$4,$5,'SURVEY_REVIEWER',$6)",[item.replacementGrant,id(1),project,id(13),item.area,id(14)]);
   if(item.name==='Area3'||item.name==='Area5')await db.query('INSERT INTO aor_assignments(id,tenant_id,project_id,user_id,aor_node_id) VALUES($1,$2,$3,$4,$5)',[item.replacementAssignment,id(1),project,id(13),item.area]);
  }
  for(let n=0;n<12;n++){const person=randomUUID();await db.query('INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,$5,$6)',[person,id(1),id(2),person+'@reviewer.example.invalid','Z Candidate '+n,hash]);await db.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'SURVEY_SUPERINTENDENT')",[project,person]);}
  await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 const {page,context}=await session(10);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${origin}/projects/${project}/survey/teams`);
 await page.getByLabel('Search name, email or role',{exact:true}).fill('John');await page.getByRole('button',{name:'Search',exact:true}).click();
 let failRead=true;
 await page.route(origin+api+'?**',async route=>{if(failRead&&route.request().url().includes('mode=obligations')){failRead=false;await route.abort('failed');}else await route.continue();});
 await page.getByRole('button',{name:'Change role for John',exact:true}).click();
 const flow=page.getByRole('region',{name:'Protected Survey Reviewer obligations',exact:true});
 await flow.getByRole('heading',{name:'Protected Survey Reviewer obligations',exact:true}).waitFor();checks++;
 await flow.getByRole('alert').waitFor();checks++;
 await page.unroute(origin+api+'?**');await flow.getByRole('button',{name:'Reload current obligations',exact:true}).click();
 await flow.getByRole('button',{name:'Hand over Area1 review grant',exact:true}).waitFor();
 check(await flow.getByRole('button',{name:'Hand over Area6 review grant',exact:true}).count(),0,'unsupported cannot mutate');
 check(await flow.getByText(/Further IT contract required/).count()>0,true,'unsupported guidance');
 const roleForm=page.getByRole('form',{name:'Change role for John',exact:true});
 await roleForm.getByRole('combobox').selectOption('REQUESTER');await roleForm.getByRole('checkbox').check();
 await roleForm.getByRole('button',{name:'Save role',exact:true}).click();await roleForm.getByRole('alert').waitFor();checks++;
 check((await pg.query('SELECT role FROM project_memberships WHERE project_id=$1 AND user_id=$2',[project,id(11)])).rows[0].role,'SURVEY_SUPERINTENDENT','obligations still block role');
 // Delayed real GET transports a captured old response; cancel must invalidate it.
 let releaseRead,readStarted,readFinished;const oldReadDone=new Promise(resolve=>{readFinished=resolve;});const oldReadReady=new Promise(resolve=>{readStarted=resolve;});const oldReadGate=new Promise(resolve=>{releaseRead=resolve;});
 await page.route(origin+api+'?**',async route=>{if(route.request().url().includes('mode=candidates')){const response=await route.fetch();readStarted();await oldReadGate;await route.fulfill({response});readFinished();}else await route.continue();});
 await flow.getByRole('button',{name:'Hand over Area1 review grant',exact:true}).click();await oldReadReady;
 check(await flow.getByRole('status').filter({hasText:'Loading protected obligations'}).count(),1,'loading state');
 check(await flow.getByRole('heading').first().evaluate(n=>document.activeElement===n),true,'forward handover heading focus');
 await flow.getByRole('button',{name:'Keep current grant',exact:true}).click();releaseRead();await oldReadDone;await page.unroute(origin+api+'?**');
 await flow.getByRole('button',{name:'Hand over Area1 review grant',exact:true}).waitFor();check(await flow.getByRole('button',{name:'Select replacement Jason',exact:true}).count(),0,'late cancelled response ignored');
 await flow.getByRole('button',{name:'Hand over Area1 review grant',exact:true}).click();
 await flow.getByRole('button',{name:'Select replacement Jason',exact:true}).click();
 check(await flow.getByText('Add review grant',{exact:true}).count(),1,'missing grant preview');check(await flow.getByText('Add individual Area assignment',{exact:true}).count(),1,'missing assignment preview');
 check(await flow.getByRole('button',{name:'Confirm handover',exact:true}).isDisabled(),true,'explicit consent required');
 await flow.getByRole('combobox',{name:/Additional coverage intent/}).selectOption('TEMPORARY');
 await flow.getByRole('checkbox',{name:/I confirm adding/}).check();await flow.getByRole('checkbox',{name:/I confirm handing over/}).check();
 // A pending real parent role response must also freeze the prepared handover.
 const roleApi=`${origin}/api/projects/${project}/survey/teams`;
 let releaseRole,roleStarted,roleFinished;const roleReady=new Promise(resolve=>{roleStarted=resolve;});const roleGate=new Promise(resolve=>{releaseRole=resolve;});const roleDone=new Promise(resolve=>{roleFinished=resolve;});
 let overlapPosts=0;const countOverlap=request=>{if(request.url()===origin+api&&request.method()==='POST')overlapPosts++;};page.on('request',countOverlap);
 await page.route(roleApi,async route=>{if(route.request().method()!=='PATCH')return route.continue();const response=await route.fetch();check(response.status(),409,'actual role guard still blocks');roleStarted();await roleGate;await route.fulfill({response});roleFinished();});
 await roleForm.getByRole('button',{name:'Save role',exact:true}).click();await roleReady;
 try{
  check(await flow.getByRole('button',{name:'Confirm handover',exact:true}).isDisabled(),true,'parent pending disables handover confirmation');
  await flow.getByRole('form',{name:'Confirm Survey Reviewer handover'}).evaluate(form=>{form.requestSubmit();form.requestSubmit();});
  // A same-origin round trip flushes any incorrectly started handover request.
  await page.request.get(origin+api+'?mode=personnel');check(overlapPosts,0,'parent pending handler suppresses handover requests');
 }finally{releaseRole();await roleDone;await page.unroute(roleApi);page.off('request',countOverlap);}
 await roleForm.getByRole('alert').waitFor();await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Confirm handover'&&!b.disabled));
 // Search/page response retains selected Jason and original displayed token.
 await flow.getByLabel('Search replacement Superintendents',{exact:true}).fill('Z Candidate');await flow.getByRole('button',{name:'Search',exact:true}).click();
 await flow.getByRole('button',{name:'Next',exact:true}).click();await flow.getByText('Page 2 of 2',{exact:true}).waitFor();
 check(await flow.getByRole('form',{name:'Confirm Survey Reviewer handover'}).getByText('Jason',{exact:true}).count(),1,'selection retained across pages');
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Confirm handover'&&!b.disabled));
 const unexpectedAssignment=randomUUID();await pg.query('INSERT INTO aor_assignments(id,tenant_id,project_id,user_id,aor_node_id) VALUES($1,$2,$3,$4,$5)',[unexpectedAssignment,id(1),project,id(12),area]);
 await flow.getByRole('button',{name:'Confirm handover',exact:true}).click();await flow.getByRole('alert').filter({hasText:/^Protected obligations changed/}).waitFor();
 check((await pg.query('SELECT count(*)::int AS n FROM access_grant_events WHERE project_id=$1',[project])).rows[0].n,0,'stale makes no history');
 await flow.getByRole('button',{name:'Keep current grant',exact:true}).click();
 check(await flow.getByRole('button',{name:'Hand over Area1 review grant',exact:true}).isDisabled(),true,'cancel retains stale latch');
 await pg.query('DELETE FROM aor_assignments WHERE id=$1 AND project_id=$2',[unexpectedAssignment,project]);
 await flow.getByRole('button',{name:'Reload current obligations',exact:true}).click();await flow.getByRole('button',{name:'Hand over Area1 review grant',exact:true}).click();await flow.getByRole('button',{name:'Select replacement Jason',exact:true}).click();
 await flow.getByRole('combobox',{name:/Additional coverage intent/}).selectOption('TEMPORARY');await flow.getByRole('checkbox',{name:/I confirm adding/}).check();await flow.getByRole('checkbox',{name:/I confirm handing over/}).check();
 // A real generic409 (not the stale-specific code) also requires reload.
 await pg.query("UPDATE project_responsibility_grants SET responsibility='FIELD_COORDINATOR' WHERE id=$1 AND project_id=$2",[grant,project]);
 const definitive=page.waitForResponse(r=>r.url()===origin+api&&r.request().method()==='POST');await flow.getByRole('button',{name:'Confirm handover',exact:true}).click();check((await definitive).status(),409,'actual definitive conflict');
 await pg.query("UPDATE project_responsibility_grants SET responsibility='SURVEY_REVIEWER' WHERE id=$1 AND project_id=$2",[grant,project]);
 await flow.getByRole('alert').filter({hasText:/^Protected obligations changed/}).waitFor();await flow.getByRole('button',{name:'Keep current grant',exact:true}).click();check(await flow.getByRole('button',{name:'Hand over Area1 review grant',exact:true}).isDisabled(),true,'generic409 latch survives cancel');
 await flow.getByRole('button',{name:'Reload current obligations',exact:true}).click();await flow.getByRole('button',{name:'Hand over Area1 review grant',exact:true}).click();await flow.getByRole('button',{name:'Select replacement Jason',exact:true}).click();await flow.getByRole('combobox',{name:/Additional coverage intent/}).selectOption('TEMPORARY');await flow.getByRole('checkbox',{name:/I confirm adding/}).check();await flow.getByRole('checkbox',{name:/I confirm handing over/}).check();
 fs.mkdirSync('.local/reviewer-ui-captures',{recursive:true});
 check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'desktop no overflow');
 await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.waitForFunction(()=>scrollY===0);await page.screenshot({path:'.local/reviewer-ui-captures/desktop.png',fullPage:true});
 const posts=[];let loseResponse=true,postStarted,releasePost;const pendingReady=new Promise(resolve=>{postStarted=resolve;});const pendingGate=new Promise(resolve=>{releasePost=resolve;});
 await page.route(origin+api,async route=>{
  if(route.request().method()!=='POST')return route.continue();
  posts.push({input:route.request().postDataJSON(),key:route.request().headers()['idempotency-key']});
  const response=await route.fetch();check(response.status(),200,'actual mutation/replay under transport loss');
  if(loseResponse){loseResponse=false;postStarted();await pendingGate;await route.abort('failed');}else await route.fulfill({response});
 });
 await flow.getByRole('button',{name:'Confirm handover',exact:true}).click();await pendingReady;
 check(await flow.getByRole('button',{name:'Handing over...',exact:true}).isDisabled(),true,'pending submit disabled');check(await roleForm.getByRole('button',{name:'Reload personnel',exact:true}).isDisabled(),true,'pending outer dismissal disabled');check(await roleForm.getByRole('combobox').isDisabled(),true,'pending role choice disabled');
 await flow.getByRole('form',{name:'Confirm Survey Reviewer handover'}).evaluate(form=>{form.requestSubmit();form.requestSubmit();});check(posts.length,1,'rapid duplicate submit suppressed');releasePost();await flow.getByRole('button',{name:'Retry unchanged handover',exact:true}).waitFor();
 check(await flow.getByRole('combobox',{name:/Additional coverage intent/}).isDisabled(),true,'uncertain intent frozen');check(await flow.getByRole('button',{name:'Keep current grant',exact:true}).isDisabled(),true,'uncertain cannot cancel');check(await roleForm.getByRole('button',{name:'Reload personnel',exact:true}).isDisabled(),true,'outer dismissal frozen');
 await flow.getByRole('button',{name:'Retry unchanged handover',exact:true}).click();await flow.getByRole('status').filter({hasText:'One Survey Reviewer grant handed over'}).waitFor();check(posts.length,2,'exact retry only');check(posts[1],posts[0],'unchanged payload and stable key');
 await page.unroute(origin+api);
 check((await pg.query('SELECT count(*)::int AS n FROM access_grant_events WHERE project_id=$1',[project])).rows[0].n,2,'one atomic event pair');
 check((await pg.query('SELECT revoked_at FROM project_responsibility_grants WHERE id=$1',[otherGrant])).rows[0].revoked_at,null,'Jason Area2 retained');
 check((await pg.query('SELECT role FROM project_memberships WHERE project_id=$1 AND user_id=$2',[project,id(11)])).rows[0].role,'SURVEY_SUPERINTENDENT','no automatic demotion');
 check(await flow.getByRole('heading').first().evaluate(n=>document.activeElement===n),true,'success heading focus');
 await context.close();
 // Central IT without operational membership: independent Card survives unrelated denials.
 const central=await session(17,390),cp=central.page;cp.on('pageerror',e=>errors.push(e.message));await cp.goto(`${origin}/projects/${project}/admin`);
 const cf=cp.getByRole('region',{name:'Protected Survey Reviewer obligations',exact:true});await cf.getByRole('button',{name:'Inspect protected obligations',exact:true}).click();
 await cf.getByLabel('Search project personnel',{exact:true}).fill('No such synthetic person');await cf.getByRole('button',{name:'Search',exact:true}).click();await cf.getByText('No project personnel match.',{exact:true}).waitFor();checks++;
 await cf.getByLabel('Search project personnel',{exact:true}).fill('Jason');await cf.getByRole('button',{name:'Search',exact:true}).click();await cf.getByRole('button',{name:'Inspect obligations for Jason',exact:true}).focus();await cp.keyboard.press('Enter');check(await cf.getByRole('heading').first().evaluate(n=>document.activeElement===n),true,'keyboard Inspect heading focus');
 await cf.getByText('Added review grant: temporary until confirmed handover',{exact:true}).waitFor();checks++;
 await cf.getByRole('button',{name:'Hand over Area1 review grant',exact:true}).click();await cf.getByRole('button',{name:'Select replacement Permanent',exact:true}).click();
 await cf.getByRole('combobox',{name:/Additional coverage intent/}).selectOption('PERMANENT');await cf.getByRole('checkbox',{name:/I confirm adding/}).check();await cf.getByRole('checkbox',{name:/I confirm handing over/}).check();
 check(await cp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'mobile no overflow');await cp.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await cp.waitForFunction(()=>scrollY===0);await cp.screenshot({path:'.local/reviewer-ui-captures/mobile.png',fullPage:true});
 await cf.getByRole('button',{name:'Confirm handover',exact:true}).focus();await cp.keyboard.press('Enter');await cf.getByRole('status').filter({hasText:'One Survey Reviewer grant handed over'}).waitFor();checks++;
 check((await pg.query("SELECT resolution_evidence->>'coverageIntent' AS intent FROM access_grant_events WHERE project_id=$1 AND subject_user_id=$2 AND action='RESPONSIBILITY_REVOKED'",[project,id(12)])).rows[0].intent,'PERMANENT','permanent successor');
 check((await pg.query('SELECT revoked_at FROM project_responsibility_grants WHERE id=$1',[otherGrant])).rows[0].revoked_at,null,'permanent path preserves Area2');
 await cf.getByRole('button',{name:'Back to project personnel',exact:true}).click();await cf.getByLabel('Search project personnel',{exact:true}).fill('John');await cf.getByRole('button',{name:'Search',exact:true}).click();await cf.getByRole('button',{name:'Inspect obligations for John',exact:true}).click();
 // Reuse, grant-only and assignment-only preview actual rows, retaining provenance.
 for(const item of extra.slice(0,3)){
  await cf.getByRole('button',{name:`Hand over ${item.name} review grant`,exact:true}).click();await cf.getByRole('button',{name:'Select replacement Permanent',exact:true}).click();
  check(await cf.getByText(item.name==='Area5'?'Add review grant':'Reuse existing review grant',{exact:true}).count(),1,'review provenance preview');
  check(await cf.getByText(item.name==='Area4'?'Add individual Area assignment':'Reuse existing individual Area assignment',{exact:true}).count(),1,'individual provenance preview');
  if(item.name!=='Area3'){await cf.getByRole('combobox',{name:/Additional coverage intent/}).selectOption('TEMPORARY');await cf.getByRole('checkbox',{name:/I confirm adding/}).check();}
  else check(await cf.getByRole('combobox',{name:/Additional coverage intent/}).count(),0,'reuse does not relabel');
  await cf.getByRole('checkbox',{name:/I confirm handing over/}).check();await cf.getByRole('button',{name:'Confirm handover',exact:true}).click();await cf.getByRole('status').filter({hasText:'One Survey Reviewer grant handed over'}).waitFor();checks++;
 }
 check((await pg.query("SELECT count(*)::int AS n FROM access_grant_events WHERE project_id=$1 AND action='RESPONSIBILITY_GRANTED' AND grant_id=$2",[project,extra[1].replacementGrant])).rows[0].n,0,'grant-only emits no false grant event');
 const projectIT=await session(14);await projectIT.page.goto(`${origin}/projects/${project}/admin`);const pf=projectIT.page.getByRole('region',{name:'Protected Survey Reviewer obligations',exact:true});await pf.getByRole('button',{name:'Inspect protected obligations',exact:true}).click();await pf.getByRole('button',{name:'Inspect obligations for Permanent',exact:true}).click();await pf.getByText('Added review grant: permanent',{exact:true}).waitFor();checks++;
 await pf.getByRole('button',{name:'Hand over Area1 review grant',exact:true}).click();await pf.getByRole('button',{name:'Select replacement Jason',exact:true}).click();await pf.getByRole('combobox',{name:/Additional coverage intent/}).selectOption('PERMANENT');await pf.getByRole('checkbox',{name:/I confirm adding/}).check();await pf.getByRole('checkbox',{name:/I confirm handing over/}).check();await pf.getByRole('button',{name:'Confirm handover',exact:true}).click();await pf.getByRole('status').filter({hasText:'One Survey Reviewer grant handed over'}).waitFor();checks++;
 check((await pg.query("SELECT resolution_evidence->'authority'->>'branch' AS branch FROM access_grant_events WHERE project_id=$1 AND actor_id=$2 AND action='RESPONSIBILITY_REVOKED'",[project,id(14)])).rows[0].branch,'PROJECT_ADMIN','project IT actual handover');
 const former=await session(10);check((await former.page.request.get(origin+`/api/projects/${id(9)}/survey/protected-obligations?mode=personnel`)).status(),403,'other project Manager denied');
 await pg.query("UPDATE project_memberships SET role='VIEWER' WHERE project_id=$1 AND user_id=$2",[project,id(10)]);check((await former.page.request.get(origin+api+'?mode=personnel')).status(),403,'former Manager denied');await former.context.close();

 // Real direct-cookie negative scope calls (no fake API authorization).
 for(const[n,status]of[[16,403],[18,403]]){const denied=await session(n);check((await denied.page.request.get(origin+api+'?mode=personnel')).status(),status,'field/Sub manager denied');await denied.context.close();}
 await pg.query("UPDATE project_memberships SET role='SURVEY_MANAGER' WHERE project_id=$1 AND user_id=$2",[project,id(10)]);
 await pg.query("UPDATE projects SET status='ARCHIVED' WHERE id=$1",[project]);await cf.getByRole('button',{name:'Reload current obligations',exact:true}).click();await cf.getByText('Closed project - evidence is read only.',{exact:true}).waitFor();check(await cf.getByRole('button',{name:/Hand over .* review grant/}).count(),0,'archived no actions');
 const closedManager=await session(10,390);await closedManager.page.goto(`${origin}/projects/${project}/survey/teams`);await closedManager.page.getByLabel('Search name, email or role',{exact:true}).fill('John');await closedManager.page.getByRole('button',{name:'Search',exact:true}).click();await closedManager.page.getByRole('button',{name:'View role and obligations for John',exact:true}).click();
 const closedFlow=closedManager.page.getByRole('region',{name:'Protected Survey Reviewer obligations',exact:true});await closedFlow.getByText('Closed project - evidence is read only.',{exact:true}).waitFor();checks++;
 const closedRole=closedManager.page.getByRole('form',{name:'Change role for John',exact:true});check(await closedRole.getByRole('combobox').isDisabled(),true,'archived Manager role control disabled');check(await closedRole.getByRole('button',{name:'Save role',exact:true}).isDisabled(),true,'archived Manager save disabled');check(await closedFlow.getByRole('button',{name:/Hand over .* review grant/}).count(),0,'archived Manager evidence no actions');await closedManager.context.close();
 check(errors,[],'no runtime page errors');await projectIT.context.close();await central.context.close();

 console.log(`PASS ${checks} reviewer browser checks; synthetic project ${project}`);
}finally{await browser.close();await pg.query("UPDATE projects SET status='ARCHIVED' WHERE id=$1 AND tenant_id=$2 AND name='Reviewer browser disposable'",[project,id(1)]);await pg.end();}
