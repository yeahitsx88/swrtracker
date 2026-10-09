import {playwrightModuleURL} from '../../../playwright-runtime.mjs';
// Read-only API doubles in an explicitly development-only component harness.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
const origin = process.env.SWR_POC_ORIGIN;
if (!origin || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) throw new Error('Use an owned loopback fixture runtime');
const { chromium } = await import(playwrightModuleURL);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  await mkdir('.local/org-poc', { recursive: true });
  for (const role of ['SURVEY_MANAGER', 'SURVEY_SUPERINTENDENT', null]) {
    const context = await browser.newContext();
    await context.addCookies([{ name: 'swr_session', value: 'fixture-ui-only', url: origin }]);
    const page = await context.newPage();
    const errors = [], writes = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', async route => {
      if (route.request().method() !== 'GET') writes.push(route.request().method());
      if (new URL(route.request().url()).pathname.endsWith('/survey/organization')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId: 'fixture-project', project: { status: 'ACTIVE', crewBuild: 'FULL' }, personnel: [], teams: [], staffing: [], superintendentAreas: [] }) });
      }
      await route.fulfill({ status: role ? 200 : 403, contentType: 'application/json', body: JSON.stringify(role ? {
        project: { status: 'ACTIVE', crewBuild: 'FULL' }, role, snapshotToken: 'fixture-only', data: [], total: 0, offset: 0, limit: 100,
      } : { error: { type: 'Forbidden', message: 'Fixture access denied' } }) });
    });
    await page.goto(`${origin}/prototypes/survey-team/workspace?entry=1`);
    const launcher = page.getByRole('button', { name: 'Open Visual Editor', exact: true });
    if (role) {
      await launcher.waitFor();
      assert.equal(await launcher.isEnabled(), true);
      await launcher.click();
      await page.locator('dialog.survey-org-chart-overlay[open]').waitFor();
      await page.screenshot({ path: '.local/org-poc/team-management-overlay.png', animations: 'disabled' });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: '.local/org-poc/team-management-overlay-mobile.png', animations: 'disabled' });
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.getByRole('button', { name: 'Close organization chart', exact: true }).click();
      if(role === 'SURVEY_MANAGER') {
      await page.locator('#tm-tab-teams').click();
      await page.getByRole('button', { name: 'Create team', exact: true }).click();
      assert.equal(await launcher.isDisabled(), true);
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      assert.equal(await launcher.isEnabled(), true);
      }
    } else {
      if (role) await page.getByRole('heading').first().waitFor();
      else await page.getByRole('button', { name: 'Retry project access', exact: true }).waitFor();
      assert.equal(await launcher.count(), 0);
    }
    assert.deepEqual(writes, []);
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('Manager/Superintendent visual launchers, Manager editor exclusion, denied-context exclusion: pass; zero writes/errors');
} finally { await browser.close(); }
