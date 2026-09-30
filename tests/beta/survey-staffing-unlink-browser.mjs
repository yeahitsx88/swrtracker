import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';

const url=new URL(process.env.DATABASE_URL??'');
if(process.env.SWR_TEAM_POSTGRES!=='1'||url.hostname!=='127.0.0.1'||url.port!=='15489'||url.pathname!=='/swr_team_isolated')throw Error('Disposable unlink fixture only');
const {chromium}=await import(pathToFileURL(process.env.SWR_PLAYWRIGHT_MODULE).href);
const pool=new Pool({connectionString:url.href});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const origin='http://127.0.0.1:3107',id=n=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const tenant=id(1),manager=id(804);
let checks=0;
try{
  const version=(await pool.query('SELECT session_version FROM users WHERE tenant_id=$1 AND id=$2',[tenant,manager])).rows[0].session_version;
  const auth=jwt.sign({sub:manager,tenantId:tenant,sv:version},process.env.JWT_SECRET,{expiresIn:'1h',jwtid:randomUUID()});
  for(const [width,n] of [[1440,860],[390,870],[810,880]]){
    const project=id(n),chief=id(n+1),im=id(n+2);
    assert.equal((await pool.query('SELECT name FROM projects WHERE tenant_id=$1 AND id=$2',[tenant,project])).rows[0]?.name,'Unlink browser fixture');
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM survey_staffing_events WHERE project_id=$1',[project])).rows[0].n,0,'Fresh browser fixture required');
    const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:1});
    await context.addCookies([{name:'swr_session',value:auth,url:origin}]);
    const page=await context.newPage(),errors=[],commands=[];
    page.on('pageerror',err=>errors.push(err.message));
    page.on('request',req=>{if(req.method()==='PATCH'&&req.url().endsWith('/survey/staffing'))commands.push({body:req.postDataJSON(),key:req.headers()['idempotency-key']});});
    const settle=()=>page.waitForLoadState('networkidle');
    const capture=async name=>{
      if(process.env.SWR_QA_CAPTURE==='0')return;
      await page.evaluate(async()=>{scrollTo(0,0);await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No horizontal overflow');
      await page.screenshot({path:`.impeccable/review/unlink-${width}-${name}.png`,fullPage:true});
    };
    const visit=async()=>{
      await page.goto(`${origin}/projects/${project}/survey/teams`,{waitUntil:'networkidle'});
      await page.getByRole('button',{name:'Staffing for Unlink browser Chief',exact:true}).click();
      await page.getByRole('heading',{name:'Current assignments',exact:true}).waitFor();await settle();
    };
    await visit();await capture('current');
    await page.getByRole('button',{name:'Unlink Superintendent',exact:true}).focus();await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.activeElement?.textContent?.startsWith('Unlink Superintendent link'));
    assert.equal(await page.getByRole('button',{name:'Confirm unlink',exact:true}).isDisabled(),true);
    assert.equal(await page.getByRole('button',{name:'Save staffing additions',exact:true}).count(),0);
    await capture('confirmation');checks+=3;
    await page.getByRole('button',{name:'Keep link',exact:true}).click();
    assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'Current assignments');checks++;
    // Refuse dependent Area removal; no automatic reporting or grant cleanup.
    await page.getByText('Manage current Area assignments (1)',{exact:true}).click();
    await page.getByRole('button',{name:'Unlink Area Browser Area',exact:true}).click();
    await page.getByLabel('I confirm unlinking Area assignment: Browser Area.',{exact:true}).check();
    await page.getByRole('button',{name:'Confirm unlink',exact:true}).click();
    await page.getByText(/Unlink or replace the dependent Superintendent reporting link/).waitFor();
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM survey_staffing_events WHERE project_id=$1',[project])).rows[0].n,0);checks++;
    if(width===390)await capture('dependent');
    await page.getByRole('button',{name:'Keep link',exact:true}).click();
    await page.getByRole('button',{name:'Unlink Superintendent',exact:true}).click();
    await page.getByLabel('I confirm unlinking Superintendent link to Unlink QA Superintendent.',{exact:true}).check();
    await page.getByRole('button',{name:'Confirm unlink',exact:true}).click();await settle();
    await page.getByText('No explicit Superintendent link',{exact:false}).waitFor();
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM survey_reporting_links WHERE project_id=$1 AND deactivated_at IS NULL',[project])).rows[0].n,0);checks++;
    // Actual save commits, then a synthetic lost response exercises unchanged-key replay.
    await page.getByText('Current Instrument Men (1)',{exact:true}).click();
    await page.getByRole('button',{name:'Unlink Instrument Man Unlink browser IM',exact:true}).click();
    await page.getByLabel('I confirm unlinking Crew link: Unlink browser IM.',{exact:true}).check();
    let lose=true;
    await page.route('**/survey/staffing',async route=>{
      if(route.request().method()==='PATCH'&&lose){lose=false;await route.fetch();await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{type:'InternalError',message:'Synthetic response loss; retry unchanged.'}})});}else await route.continue();
    });
    const before=commands.length;
    await page.getByRole('button',{name:'Confirm unlink',exact:true}).click();
    await page.getByText('Synthetic response loss; retry unchanged.',{exact:false}).waitFor();
    await page.getByRole('button',{name:'Confirm unlink',exact:true}).click();await settle();
    assert.equal(commands[before].key,commands[before+1].key);assert.deepEqual(commands[before].body,commands[before+1].body);
    await page.getByText('Current Instrument Men (0)',{exact:true}).waitFor();
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM crew_rosters WHERE project_id=$1 AND deactivated_at IS NULL',[project])).rows[0].n,0);checks+=3;
    await page.unroute('**/survey/staffing');
    // A real concurrent account change rejects the stale displayed snapshot.
    await page.getByText('Manage current Area assignments (1)',{exact:true}).click();
    await page.getByRole('button',{name:'Unlink Area Browser Area',exact:true}).click();
    await page.getByLabel('I confirm unlinking Area assignment: Browser Area.',{exact:true}).check();
    await pool.query('UPDATE users SET session_version=session_version+1 WHERE tenant_id=$1 AND id=$2',[tenant,im]);
    await page.getByRole('button',{name:'Confirm unlink',exact:true}).click();
    await page.getByText(/Project staffing changed while you were reviewing it/).waitFor();
    assert.equal(await page.getByRole('button',{name:'Confirm unlink',exact:true}).isDisabled(),true);checks++;
    await page.getByRole('button',{name:'Keep link',exact:true}).click();
    await page.getByText(/Project staffing changed while you were reviewing it/).waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.textContent),'Current assignments');
    await page.getByText('Manage current Area assignments (1)',{exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'Unlink Area Browser Area',exact:true}).isDisabled(),true);
    assert.equal(await page.getByRole('button',{name:'Save staffing additions',exact:true}).isDisabled(),true);checks+=3;
    if(width===390)await capture('stale-after-cancel');
    await page.getByRole('button',{name:'Reload current staffing',exact:true}).click();await settle();
    await page.getByText('Manage current Area assignments (1)',{exact:true}).click();
    await page.getByRole('button',{name:'Unlink Area Browser Area',exact:true}).click();
    await page.getByLabel('I confirm unlinking Area assignment: Browser Area.',{exact:true}).check();
    await page.getByRole('button',{name:'Confirm unlink',exact:true}).click();await settle();
    await page.getByText('No explicit Area assignment',{exact:false}).waitFor();checks++;
    assert.equal((await pool.query('SELECT role FROM project_memberships WHERE project_id=$1 AND user_id=$2',[project,chief])).rows[0].role,'PARTY_CHIEF');
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM survey_staffing_events WHERE project_id=$1 AND payload->>\'action\'=\'unlink\'',[project])).rows[0].n,3);checks+=2;
    await pool.query(`UPDATE projects SET status='ARCHIVED' WHERE id=$1`,[project]);await visit();
    assert.equal(await page.getByRole('button',{name:/Unlink/}).count(),0);assert.equal(await page.getByRole('button',{name:'Save staffing additions',exact:true}).count(),0);checks+=2;
    if(width===810)await capture('closed');
    assert.deepEqual(errors,[]);checks++;await context.close();
  }
  console.log(`Actual-stack unlink browser checks passed: ${checks}`);
}finally{await browser.close();await pool.end();}
