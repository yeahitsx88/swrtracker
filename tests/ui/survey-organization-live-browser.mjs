// Authenticated browser checks against the newly owned PostgreSQL/production fixture.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Pool } from 'pg';

const origin = process.env.SWR_ORG_READ_ORIGIN;
const dbUrl = new URL(process.env.DATABASE_URL ?? '');
if (process.env.SWR_ORG_READ_ACCEPTANCE !== '1' || origin !== 'http://127.0.0.1:3171' || dbUrl.hostname !== '127.0.0.1' || dbUrl.port !== '15496' || dbUrl.pathname !== '/swr_org_read_20261006') throw new Error('Use the explicitly owned read-only Org Chart fixture/runtime');
const f = JSON.parse(await readFile('.local/org-read/fixture.json', 'utf8'));
const { chromium } = await import(pathToFileURL(process.env.SWR_PLAYWRIGHT_MODULE).href);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const pool = new Pool({ connectionString: dbUrl.href, max: 2 });
const checks = [], errors = [], writes = [];
const check = (value, label) => { assert(value, label); checks.push(label); };
const tables = ['projects','users','project_memberships','aor_assignments','survey_reporting_links','crew_rosters','survey_teams','survey_team_members','survey_team_areas','survey_staffing_events','tickets','ticket_events','administrative_events'];
async function witness() {
  const values = [];
  for (const table of tables) values.push((await pool.query(`SELECT row_to_json(t) AS value FROM ${table} t ORDER BY row_to_json(t)::text`)).rows);
  return createHash('sha256').update(JSON.stringify(values)).digest('hex');
}
async function context(width = 1440) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  await ctx.addCookies([{ name: 'swr_session', value: f.tokens.manager, url: origin }]);
  const page = await ctx.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/') && request.method() !== 'GET') writes.push(request.method() + ':' + new URL(request.url()).pathname); });
  return { ctx, page };
}
const launcher = page => page.getByRole('button', { name: 'Open Survey Organization Chart (Read-Only)', exact: true });
const overlay = page => page.locator('dialog.survey-org-chart-overlay[open]');
const person = (page, key) => overlay(page).locator(`[data-person="${f.people[key]}"]`);
async function open(page, project = f.project) {
  await page.goto(`${origin}/projects/${project}/survey/teams`);
  await launcher(page).waitFor();
  await launcher(page).click();
  await overlay(page).locator('[data-read-only=true]').waitFor();
}
async function close(page) {
  await page.getByRole('button', { name: 'Close organization chart', exact: true }).click();
  await overlay(page).waitFor({ state: 'detached' });
}

const before = await witness();
const originalStatus = (await pool.query('SELECT status FROM projects WHERE id=$1',[f.project])).rows[0].status;
const membership = (await pool.query('SELECT access_disabled_at,access_disabled_by FROM project_memberships WHERE project_id=$1 AND user_id=$2',[f.project,f.people.manager])).rows[0];
try {
  const { ctx, page } = await context();
  await open(page);
  const actual = await person(page, 'chief').innerText();
  check(actual.includes('Blue Named Team') && actual.includes('Team West') && actual.includes('Individual South') && actual.includes('Explicit reporting: Live Superintendent A'), 'Live Chief preserves distinct reporting, named team and multiple Area evidence');
  check(await person(page, 'chief').locator('..').locator(`[data-person="${f.people.instrument}"]`).count() === 1, 'Explicit current crew stays with its Chief');
  check((await person(page, 'retainedChief').innerText()).includes('outside current Superintendent population'), 'Retained inactive reporting link is explained without an invented active edge');
  check(actual.includes('Live retainedInstrument') && actual.includes('REQUESTER'), 'Changed-role retained roster link remains separate evidence');
  check(await overlay(page).getByRole('heading', { name: 'Chiefs Outside Current Reporting Branches', exact: true }).isVisible(), 'Unlinked and ineligible reporting Chiefs remain visible');
  check(await overlay(page).locator('.org-available').first().locator(`[data-person="${f.people.unlinkedInstrument}"]`).count() === 1, 'Unlinked Instrument Man is not assigned through named-team membership');
  const chiefToggle = person(page, 'chief').getByRole('button', { name: "Collapse Live Chief A's crew", exact: true });
  await chiefToggle.click();
  check(await person(page, 'chief').locator('.org-collapse').getAttribute('aria-expanded') === 'false' && !await person(page,'instrument').isVisible(), 'Chief collapse hides its explicit crew');
  await person(page,'chief').getByRole('button',{name:"Expand Live Chief A's crew",exact:true}).click();
  check(await person(page,'instrument').isVisible(), 'Chief expansion restores current live roster');
  const geometry = () => page.evaluate(() => Object.fromEntries(['.survey-org-chart-overlay','.org-chart-container','.org-scroll','.org-toolbar'].map(selector => { const r=document.querySelector(selector).getBoundingClientRect(); return [selector,{width:r.width,height:r.height}]; })));
  const baselineGeometry = await geometry();
  for (let n=0;n<5;n++) await overlay(page).getByRole('button',{name:'Zoom In',exact:true}).click();
  assert.deepEqual(await geometry(),baselineGeometry);
  check(await overlay(page).getByLabel('Current chart zoom').innerText()==='150%', 'Live zoom retains fixed outer workspace and viewport dimensions');
  const toolbarBefore = await overlay(page).locator('.org-toolbar').boundingBox();
  await overlay(page).locator('.org-scroll').evaluate(node=>{node.scrollLeft=180;node.scrollTop=220;});
  assert.deepEqual(await overlay(page).locator('.org-toolbar').boundingBox(),toolbarBefore);
  checks.push('Zoom controls stay pinned while the live canvas scrolls');
  check(await overlay(page).locator('.org-grip,[draggable=true]').count()===0 && await overlay(page).getByRole('button',{name:/^(Move|Move Crew|Confirm Move|Reset Demo)$/}).count()===0, 'Live hierarchy exposes no dragging, movement review or demo-reset controls');
  await overlay(page).getByRole('button',{name:'Reset to 100%',exact:true}).click();
  await overlay(page).getByText('Blue Named Team · Lead: Live secondSuperintendent',{exact:true}).click();
  check((await overlay(page).getByRole('region',{name:'Named organizational teams'}).innerText()).includes('Team West'), 'Named teams retain independent leadership, members and Area coverage');
  await page.screenshot({path:'.local/org-read/live-desktop.png',animations:'disabled'});
  await close(page);
  check(await launcher(page).evaluate(node=>document.activeElement===node), 'Closing the live workspace restores launch focus');
  const tab = name=>page.getByRole('tab',{name,exact:true});
  await tab('Personnel').click();
  await page.getByRole('button',{name:'Staffing for Live Chief A',exact:true}).click();
  await page.getByRole('heading',{name:'Staffing For Live Chief A',exact:true}).waitFor();
  check(await launcher(page).isDisabled(), 'Existing live staffing editor retains exclusive ownership');
  await page.getByRole('button',{name:'Back to personnel',exact:true}).click();
  await tab('Teams').click();
  await page.getByRole('button',{name:'Create team',exact:true}).click();
  check(await launcher(page).isDisabled(), 'Existing team editor disables hierarchy launch');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await tab('Areas').click();
  check(await page.getByLabel('Search Areas',{exact:true}).isVisible() && await page.getByRole('button',{name:'Create Area',exact:true}).isVisible(), 'Live Areas and existing Area creation entry remain accessible');
  await tab('Personnel').click();
  await page.getByRole('button',{name:'KPIs for Live Chief A',exact:true}).click();
  await page.locator('dialog.kpi-entry-dialog[open]').waitFor();
  await page.keyboard.press('Escape');
  check(await launcher(page).isEnabled(), 'Existing KPI modal and Team Management remain usable after closing chart');
  await launcher(page).click();
  await overlay(page).locator('[data-read-only=true]').waitFor();
  await page.route('**/survey/organization',route=>route.abort());
  await overlay(page).getByRole('button',{name:'Reload hierarchy',exact:true}).click();
  await overlay(page).getByRole('button',{name:'Reload hierarchy',exact:true}).waitFor();
  await overlay(page).locator('[role=alert]').waitFor();
  check(await overlay(page).locator('[data-person]').count()===0, 'Read failure clears live content and never falls back to fixture people');
  await page.unroute('**/survey/organization');
  await overlay(page).getByRole('button',{name:'Reload hierarchy',exact:true}).click();
  await person(page,'chief').waitFor();
  await pool.query('UPDATE project_memberships SET access_disabled_at=now(),access_disabled_by=$3 WHERE project_id=$1 AND user_id=$2',[f.project,f.people.manager,f.people.admin]);
  await overlay(page).getByRole('button',{name:'Reload hierarchy',exact:true}).click();
  await overlay(page).locator('[role=alert]').waitFor();
  check(await overlay(page).locator('[data-person]').count()===0, 'Reload revalidates revoked project access and removes prior hierarchy');
  await pool.query('UPDATE project_memberships SET access_disabled_at=$3,access_disabled_by=$4 WHERE project_id=$1 AND user_id=$2',[f.project,f.people.manager,membership.access_disabled_at,membership.access_disabled_by]);
  await close(page);
  await ctx.close();

  const mobile=await context(390);
  await open(mobile.page);
  check(await mobile.page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth), 'Mobile live hierarchy overflow remains within its workspace');
  await mobile.page.screenshot({path:'.local/org-read/live-mobile.png',animations:'disabled'});
  await close(mobile.page);await mobile.ctx.close();

  const archived=await context();
  await pool.query("UPDATE projects SET status='ARCHIVED' WHERE id=$1",[f.project]);
  await open(archived.page);
  check((await overlay(archived.page).locator('.org-context').innerText()).includes('ARCHIVED'), 'Archived projects retain the live read-only chart');
  await close(archived.page);
  await archived.page.getByRole('tab',{name:'Teams',exact:true}).click();
  check(await archived.page.getByRole('button',{name:'Create team',exact:true}).isDisabled(), 'Archived Team Management mutation controls remain disabled');
  await archived.ctx.close();
  await pool.query('UPDATE projects SET status=$2 WHERE id=$1',[f.project,originalStatus]);
  const simple=await context();
  await open(simple.page,f.mediumProject);
  check(await person(simple.page,'chief').count()===1 && await person(simple.page,'instrument').count()===1, 'MEDIUM builds preserve crews without inventing Superintendent tiers');
  await close(simple.page);
  await open(simple.page,f.slimProject);
  check(await person(simple.page,'chief').count()===0 && await person(simple.page,'instrument').count()===1, 'SLIM builds show Instrument Men without inventing Chief or Superintendent tiers');
  await close(simple.page);await simple.ctx.close();
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
  const after=await witness();assert.equal(after,before);
  checks.push('No browser API mutations/page errors; exact domain-table witness unchanged');
  await writeFile('.local/org-read/browser-evidence.json',JSON.stringify({checks,errors,writes,before,after,mode:'Actual authenticated production UI on newly owned current PostgreSQL fixture'},null,2));
  console.log(`PASS ${checks.length} authenticated live browser checks; no writes/errors; domain witness preserved`);
} finally {
  await pool.query('UPDATE projects SET status=$2 WHERE id=$1',[f.project,originalStatus]);
  await pool.query('UPDATE project_memberships SET access_disabled_at=$3,access_disabled_by=$4 WHERE project_id=$1 AND user_id=$2',[f.project,f.people.manager,membership.access_disabled_at,membership.access_disabled_by]);
  await browser.close();await pool.end();
}
