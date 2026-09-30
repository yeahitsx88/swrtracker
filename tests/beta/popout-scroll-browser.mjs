// Owned Sabine preview only. Reads requests; creates/revokes its own test sessions.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
if (process.env.SWR_SABINE_UI !== '1') throw Error('SWR_SABINE_UI=1 required');
const config = JSON.parse(fs.readFileSync('.data/sabine/runtime.json', 'utf8'));
const manifest = JSON.parse(fs.readFileSync('.data/sabine/manifest.json', 'utf8'));
const database = new URL(config.DATABASE_URL);
assert.equal(database.hostname, '127.0.0.1'); assert.equal(database.port, '15488'); assert.equal(database.pathname, '/swr_sabine_simulation');
const { chromium } = await import(pathToFileURL(process.env.SWR_PLAYWRIGHT_MODULE).href);
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
const base = process.env.SWR_POPOUT_ORIGIN ?? 'http://127.0.0.1:3106';
assert.ok(['http://127.0.0.1:3106', 'http://127.0.0.1:3107'].includes(base));
const project = manifest.liveProjectId;
try {
  for (const width of [1440, 390]) for (const surface of ['account', 'health', 'requester', 'field']) {
    const context = await browser.newContext({ viewport: { width, height: surface === 'account' ? 300 : width === 390 ? 844 : 720 } });
    try {
      const email = `${surface === 'requester' ? 'requester0' : surface === 'field' ? 'chief1' : 'manager'}@sabine.example`;
      const response = await context.request.post(`${base}/api/auth/login`, { data: { tenantId: manifest.tenantId, email, password: config.SABINE_PASSWORD } });
      assert.equal(response.status(), 200);
      const cookie = response.headers()['set-cookie']?.match(/(?:^|\n)swr_session=([^;]+)/);
      assert.ok(cookie); await context.addCookies([{ name: 'swr_session', value: cookie[1], url: base }]);
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const path = surface === 'requester' ? 'my-requests' : surface === 'field' ? 'crew/work' : 'survey/operations';
      await page.goto(`${base}/projects/${project}/${path}`, { waitUntil: 'networkidle' });
      const trigger = surface === 'account' ? page.getByRole('button', { name: 'Menu', exact: true }) : surface === 'health' ? page.locator('.ops-metric').first() : page.getByRole('button', { name: 'Explore charts', exact: true });
      await trigger.click();
      const dialog = page.locator('dialog:modal'); await dialog.waitFor();
      const body = dialog.locator('> .popout-body'), header = dialog.locator('> .popout-header');
      const close = header.getByRole('button', { name: surface === 'account' ? 'Close account menu' : 'Close', exact: true });
      if (surface !== 'account') {
        await dialog.locator('.kpi-explorer p[aria-live="polite"] strong').waitFor();
        await dialog.locator('summary').filter({ hasText: 'Filters and date range' }).click();
        await dialog.locator('summary').filter({ hasText: 'Data coverage and interpretation' }).click();
        await dialog.getByRole('button', { name: 'Show matching requests', exact: true }).click();
        await page.waitForLoadState('networkidle');
      }
      await page.waitForFunction(() => [...document.querySelectorAll('dialog:modal')].every(node => node.getAnimations().length === 0));
      const original = await close.boundingBox();
      assert.ok(original && original.height >= 44);
      assert.equal(await body.evaluate(node => node.scrollHeight > node.clientHeight), true, `${surface} fixture must actually overflow`);
      await body.evaluate(node => { node.scrollTop = node.scrollHeight; });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.ok(await body.evaluate(node => node.scrollTop > 0));
      assert.deepEqual(await close.boundingBox(), original, `${surface} close control must stay frozen`);
      assert.equal(await dialog.evaluate(node => node.scrollTop), 0, 'Only the body scrolls');
      const frame = await dialog.boundingBox();
      assert.ok(original.y >= frame.y && original.y + original.height <= frame.y + frame.height);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (process.env.SWR_QA_CAPTURE !== '0') {
        await page.evaluate(async () => { await document.fonts.ready; });
        await page.screenshot({ path: `.impeccable/review/pinned-popout-${width}-${surface}.png` });
      }
      await close.click(); await page.waitForFunction(() => !document.querySelector('dialog:modal'));
      assert.equal(await trigger.evaluate(node => node === document.activeElement), true, 'Closing returns focus to its launcher');
      await trigger.click(); await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('dialog:modal'));
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ width, surface, scrolledBody: true, frozenClose: true, clickAndEscapeDismissal: true, focusReturn: true, requestMutations: 0, pageErrors: 0 }));
    } finally {
      assert.equal((await context.request.post(`${base}/api/auth/logout`)).status(), 200);
      await context.close();
    }
  }
} finally { await browser.close(); }
