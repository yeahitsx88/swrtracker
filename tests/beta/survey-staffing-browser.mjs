import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';

const url = new URL(process.env.DATABASE_URL ?? '');
if (process.env.SWR_TEAM_POSTGRES !== '1' || url.hostname !== '127.0.0.1' || url.port !== '15489' || url.pathname !== '/swr_team_isolated') throw Error('Disposable staffing fixture only');
const { chromium } = await import(pathToFileURL(process.env.SWR_PLAYWRIGHT_MODULE).href);
const pool = new Pool({ connectionString: url.href });
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
const origin = 'http://127.0.0.1:3107', id = n => `20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const tenant = id(1), project = id(700), chief = id(701), manager = id(709), im = id(703);
let checks = 0;
try {
  assert.equal((await pool.query('SELECT name FROM projects WHERE tenant_id=$1 AND id=$2',[tenant,project])).rows[0]?.name,'Staffing safety fixture');
  const version = (await pool.query('SELECT session_version FROM users WHERE tenant_id=$1 AND id=$2',[tenant,manager])).rows[0].session_version;
  const auth = jwt.sign({sub:manager,tenantId:tenant,sv:version},process.env.JWT_SECRET,{expiresIn:'1h',jwtid:randomUUID()});
  for (const width of [1440,390,810]) {
    const additionId = randomUUID(), additionName = `Browser Addition ${width} ${additionId.slice(-6)}`;
    const company = (await pool.query('SELECT company_id FROM users WHERE tenant_id=$1 AND id=$2',[tenant,manager])).rows[0].company_id;
    await pool.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,$5,'not-a-login-hash')",[additionId,tenant,company,`${additionId}@example.test`,additionName]);
    await pool.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'REQUESTER')",[project,additionId]);
    const rosterCount = (await pool.query('SELECT COUNT(*)::int AS n FROM crew_rosters WHERE project_id=$1 AND party_chief_id=$2 AND deactivated_at IS NULL',[project,chief])).rows[0].n;
    const context = await browser.newContext({viewport:{width,height:900},deviceScaleFactor:1});
    await context.addCookies([{name:'swr_session',value:auth,url:origin}]);
    const page = await context.newPage(), errors = [], saves = [];
    page.on('pageerror',err => errors.push(err.message));
    page.on('request',request => { if (request.method() === 'POST' && request.url().endsWith('/survey/staffing')) saves.push({body:request.postDataJSON(),key:request.headers()['idempotency-key']}); });
    const settle = () => page.waitForLoadState('networkidle');
    const visit = async () => {
      await page.goto(`${origin}/projects/${project}/survey/teams`,{waitUntil:'networkidle'});
      const chiefSearch = page.getByLabel('Search name, email or role',{exact:true});
      await chiefSearch.fill('Party Chief'); await chiefSearch.locator('..').locator('..').getByRole('button',{name:'Search',exact:true}).click();
      await page.getByRole('button',{name:'Staffing for Safety PARTY_CHIEF',exact:true}).first().click();
      await page.getByRole('heading',{name:'Current assignments',exact:true}).waitFor(); await settle();
    };
    const capture = async name => {
      if (process.env.SWR_QA_CAPTURE === '0') return;
      await page.evaluate(async () => { scrollTo(0,0); await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true,'No page overflow');
      await page.screenshot({path:`.impeccable/review/staffing-${width}-${name}.png`,fullPage:true});
    };
    await visit();
    await page.getByRole('heading',{name:'Current assignments',exact:true}).waitFor().catch(async error => { throw new Error(`${error.message}\n${await page.locator('main').innerText()}`); });
    assert.equal(await page.getByRole('heading',{name:'Current assignments',exact:true}).count(),1);
    assert.equal(await page.getByLabel('Search current roster',{exact:true}).isVisible(),false);
    assert.equal(await page.getByRole('button',{name:'Save staffing additions',exact:true}).isDisabled(),true);
    await page.waitForFunction(() => document.activeElement?.matches('h3[tabindex="-1"]'));
    await capture('current'); checks += 4;
    await page.getByText(`Current Instrument Men (${rosterCount})`,{exact:true}).click(); await settle();
    await page.getByLabel('Search current roster',{exact:true}).fill('Safety');
    const rosterSearchResponse = page.waitForResponse(response => response.request().method() === 'GET' && response.url().includes('/survey/staffing?') && response.url().includes('search=Safety'));
    await page.getByLabel('Search current roster',{exact:true}).locator('..').locator('..').getByRole('button',{name:'Search',exact:true}).click();
    await rosterSearchResponse; await settle();
    await page.waitForFunction(() => [...document.querySelectorAll('.tm-list strong')].filter(node => node.textContent === 'Safety INSTRUMENT_MAN').length >= 2);
    assert.ok(await page.locator('.tm-list strong').filter({hasText:/^Safety INSTRUMENT_MAN$/}).count() >= 2);
    await page.getByLabel('Search current roster',{exact:true}).fill('no match');
    await page.getByLabel('Search current roster',{exact:true}).locator('..').locator('..').getByRole('button',{name:'Search',exact:true}).click(); await settle();
    await page.getByText('No current roster members match this search.',{exact:true}).waitFor();
    assert.equal(await page.getByText('No current roster members match this search.',{exact:true}).count(),1);
    await page.getByText(`Current Instrument Men (${rosterCount})`,{exact:true}).click(); checks += 2;
    await page.getByRole('button',{name:'Select Area',exact:true}).click(); await settle();
    await page.getByRole('button',{name:'Safety covered',exact:true}).focus(); await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement?.id),'tm-select-staffing-area');
    await page.getByRole('button',{name:'Select Superintendent',exact:true}).click(); await settle();
    const superSearch = page.getByLabel('Search project name, email or role',{exact:true});
    await superSearch.fill('Survey Superintendent'); await superSearch.locator('..').locator('..').getByRole('button',{name:'Search',exact:true}).click();
    const superEmail = `${id(704)}@example.test`;
    await page.getByText(superEmail,{exact:true}).locator('..').locator('..').getByRole('button',{name:'Select Superintendent Safety SURVEY_SUPERINTENDENT',exact:true}).focus(); await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement?.id),'tm-select-staffing-superintendent');
    await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement?.textContent),'Add Instrument Men'); checks += 5;
    await page.getByRole('button',{name:'Add Instrument Men',exact:true}).click(); await settle();
    const candidateSearch = page.getByLabel('Search project name, email or role',{exact:true});
    await candidateSearch.fill(additionName); await candidateSearch.locator('..').locator('..').getByRole('button',{name:'Search',exact:true}).click();
    await page.getByRole('button',{name:`Add Instrument Man ${additionName}`,exact:true}).click();
    assert.equal(await page.getByRole('heading',{name:'Instrument Man additions (1/100)',exact:true}).count(),1);
    await candidateSearch.fill('not found'); await candidateSearch.locator('..').locator('..').getByRole('button',{name:'Search',exact:true}).click(); await settle();
    assert.equal(await page.getByRole('heading',{name:'Instrument Man additions (1/100)',exact:true}).count(),1,'Selection persists across search');
    await page.getByRole('button',{name:'Add Instrument Men',exact:true}).click();
    await page.getByLabel('I confirm the explicit assignments and any role replacements.',{exact:false}).check();
    await capture('proposed'); checks += 3;
    // Synthetic lost response over the real production page: unchanged retry keeps its key.
    let failed = false;
    await page.route('**/survey/staffing',async route => {
      if (route.request().method() === 'POST' && !failed) { failed = true; await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{type:'InternalError',message:'Uncertain test response — retry unchanged'}})}); }
      else await route.continue();
    });
    await page.getByRole('button',{name:'Save staffing additions',exact:true}).click(); await settle();
    await page.getByText('Uncertain test response — retry unchanged',{exact:false}).waitFor();
    await page.getByRole('button',{name:'Save staffing additions',exact:true}).click(); await settle();
    await page.getByText('Staffing saved. Existing roster members and request history are retained.',{exact:true}).waitFor();
    assert.equal(saves.length,2); assert.equal(saves[0].key,saves[1].key); assert.deepEqual(saves[0].body,saves[1].body);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM crew_rosters WHERE project_id=$1 AND party_chief_id=$2 AND deactivated_at IS NULL',[project,chief])).rows[0].n,rosterCount+1,'Additive save preserves roster');
    const promoted = (await pool.query('SELECT pm.role,u.session_version FROM project_memberships pm JOIN users u ON u.id=pm.user_id WHERE pm.project_id=$1 AND u.tenant_id=$2 AND u.id=$3',[project,tenant,additionId])).rows[0];
    assert.equal(promoted.role,'INSTRUMENT_MAN'); assert.equal(promoted.session_version,2);
    assert.equal((await pool.query('SELECT superintendent_id FROM survey_reporting_links WHERE project_id=$1 AND party_chief_id=$2 AND deactivated_at IS NULL',[project,chief])).rows[0].superintendent_id,id(704)); checks += 7;
    await page.unroute('**/survey/staffing');
    await visit();
    const before = (await pool.query('SELECT COUNT(*)::int AS n FROM survey_staffing_events WHERE project_id=$1',[project])).rows[0].n;
    await pool.query('UPDATE users SET session_version=session_version+1 WHERE tenant_id=$1 AND id=$2',[tenant,im]);
    await page.getByLabel('I confirm the explicit assignments and any role replacements.',{exact:false}).check();
    await page.getByRole('button',{name:'Save staffing additions',exact:true}).click(); await settle();
    await page.getByText('Project staffing changed while you were reviewing it.',{exact:false}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Save staffing additions',exact:true}).isDisabled(),true);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM survey_staffing_events WHERE project_id=$1',[project])).rows[0].n,before);
    if (width === 390) await capture('stale');
    await page.getByRole('button',{name:'Reload current staffing',exact:true}).click(); await settle();
    await page.getByRole('heading',{name:'Instrument Man additions (0/100)',exact:true}).waitFor();
    assert.equal(await page.getByRole('heading',{name:'Instrument Man additions (0/100)',exact:true}).count(),1);
    assert.equal(await page.getByText('Project staffing changed while you were reviewing it.',{exact:false}).count(),0);
    assert.equal(await page.getByRole('button',{name:'Save staffing additions',exact:true}).isDisabled(),true); checks += 5;
    await page.getByRole('button',{name:'Back to personnel',exact:true}).click(); await settle();
    assert.equal(await page.evaluate(() => document.activeElement?.id),'tm-title');
    assert.deepEqual(errors,[]); checks += 2;
    if (width === 810) {
      await pool.query("UPDATE projects SET status='ARCHIVED' WHERE tenant_id=$1 AND id=$2",[tenant,project]);
      try { await visit(); assert.equal(await page.getByRole('button',{name:'Save staffing additions',exact:true}).count(),0); assert.equal(await page.getByRole('button',{name:'Add Instrument Men',exact:true}).count(),0); await capture('closed'); checks += 2; }
      finally { await pool.query("UPDATE projects SET status='ACTIVE' WHERE tenant_id=$1 AND id=$2",[tenant,project]); }
    }
    await context.close();
  }
  const boundary = await browser.newContext({viewport:{width:810,height:900}});
  await boundary.addCookies([{name:'swr_session',value:auth,url:origin}]);
  const boundaryPage = await boundary.newPage();
  try {
    await pool.query("UPDATE projects SET crew_build='MEDIUM' WHERE tenant_id=$1 AND id=$2",[tenant,project]);
    await boundaryPage.goto(`${origin}/projects/${project}/survey/teams`,{waitUntil:'networkidle'});
    const chiefSearch = boundaryPage.getByLabel('Search name, email or role',{exact:true});
    await chiefSearch.fill('Party Chief'); await chiefSearch.locator('..').locator('..').getByRole('button',{name:'Search',exact:true}).click();
    await boundaryPage.getByRole('button',{name:'Staffing for Safety PARTY_CHIEF',exact:true}).first().click();
    await boundaryPage.getByRole('heading',{name:'Current assignments',exact:true}).waitFor();
    assert.equal(await boundaryPage.getByRole('button',{name:'Select Superintendent',exact:true}).count(),0); checks++;
    await pool.query("UPDATE projects SET crew_build='SLIM' WHERE tenant_id=$1 AND id=$2",[tenant,project]);
    await boundaryPage.reload({waitUntil:'networkidle'});
    await chiefSearch.fill('Party Chief'); await chiefSearch.locator('..').locator('..').getByRole('button',{name:'Search',exact:true}).click();
    await boundaryPage.getByLabel('Search name, email or role',{exact:true}).waitFor();
    assert.equal(await boundaryPage.getByRole('button',{name:'Staffing for Safety PARTY_CHIEF',exact:true}).count(),0); checks++;
    await pool.query("UPDATE projects SET crew_build='FULL' WHERE tenant_id=$1 AND id=$2",[tenant,project]);
    // Synthetic incomplete-selection evidence: never masquerade a bounded Area summary as editable.
    await boundaryPage.route('**/survey/staffing?*',async route => {
      const response = await route.fetch(), value = await response.json();
      if (value.staffing) value.staffing.areas = {...value.staffing.areas,total:101,truncated:true};
      await route.fulfill({response,json:value});
    });
    await boundaryPage.reload({waitUntil:'networkidle'});
    await chiefSearch.fill('Party Chief'); await chiefSearch.locator('..').locator('..').getByRole('button',{name:'Search',exact:true}).click();
    await boundaryPage.getByRole('button',{name:'Staffing for Safety PARTY_CHIEF',exact:true}).first().click();
    await boundaryPage.getByText('This Chief has multiple Area assignments.',{exact:false}).waitFor();
    assert.equal(await boundaryPage.getByRole('button',{name:'Save staffing additions',exact:true}).count(),0); checks++;
  } finally { await pool.query("UPDATE projects SET crew_build='FULL' WHERE tenant_id=$1 AND id=$2",[tenant,project]); await boundary.close(); }
  console.log(`Production staffing browser checks passed: ${checks}; widths 1440, 390, 810. Synthetic lost-response and incomplete-Area faults; remaining reads/saves use disposable PostgreSQL.`);
} finally { await browser.close(); await pool.end(); }
