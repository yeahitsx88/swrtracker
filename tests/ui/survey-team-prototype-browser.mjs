// Fixture UI acceptance only: no database, credentials or production API calls.
// SWR_PLAYWRIGHT_MODULE points to an existing Playwright ESM module.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const origin = process.env.SWR_POC_ORIGIN;
if (!origin || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) throw new Error('SWR_POC_ORIGIN must be an explicitly owned loopback dev runtime');
if (!process.env.SWR_PLAYWRIGHT_MODULE) throw new Error('Set SWR_PLAYWRIGHT_MODULE to an existing Playwright module');
const { chromium } = await import(pathToFileURL(process.env.SWR_PLAYWRIGHT_MODULE).href);
const preview = process.argv.includes('--preview');
const browser = await chromium.launch({ channel: 'msedge', headless: !preview });
// A headed preview must follow its real window. A fixed emulated viewport can
// extend below the visible browser and make the document bottom unreachable.
const context = await browser.newContext({ viewport: preview ? null : { width: 1600, height: 1100 } });
// Middleware only checks presence. This synthetic value never authenticates an API
// or accesses real data. The POC lives outside the authenticated application shell.
await context.addCookies([{ name: 'swr_session', value: 'fixture-ui-only', url: origin }]);
const page = await context.newPage();
if (preview) {
  await page.goto(`${origin}/prototypes/survey-team`);
  console.log('Fixture-only preview open in an isolated Edge session. Close that window to stop.');
  await new Promise(resolve => browser.once('disconnected', resolve));
  process.exit(0);
}
const failures = [], apiCalls = [];
page.on('pageerror', error => failures.push(error.message));
page.on('request', req => { if (new URL(req.url()).pathname.startsWith('/api/')) apiCalls.push(req.url()); });
const receipts = [];
const card = id => page.locator(`[data-person="${id}"]`);
const review = () => page.getByRole('dialog');
async function check(name, work) { await work(); receipts.push(name); }
async function drag(from, to, expectedTarget) {
  // Start a native drag, pan the fixed canvas, then re-read the painted target.
  await card(to).scrollIntoViewIfNeeded();
  await card(from).scrollIntoViewIfNeeded();
  const source = await card(from).locator('.org-grip').boundingBox();
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + source.width / 2 + 12, source.y + source.height / 2, { steps: 4 });
  await card(to).scrollIntoViewIfNeeded();
  const target = await card(to).boundingBox();
  await page.mouse.move(target.x + target.width / 2, target.y + 25, { steps: 12 });
  await page.mouse.move(target.x + target.width / 2 + 1, target.y + 25);
  if (expectedTarget) {
    assert.equal(await card(to).evaluate((el, valid) => el.classList.contains(valid ? 'org-valid' : 'org-invalid') && el.classList.contains('org-hover'), expectedTarget === 'valid'), true);
    assert.match(await card(to).innerText(), expectedTarget === 'valid' ? /Release to review move/ : /Invalid destination/);
  }
  await page.mouse.up();
}
async function setZoom(value) {
  let current = Number.parseInt(await page.getByLabel('Current chart zoom').innerText(), 10);
  while (current !== value) {
    await page.getByRole('button', { name: current > value ? 'Zoom Out' : 'Zoom In', exact: true }).click();
    current = Number.parseInt(await page.getByLabel('Current chart zoom').innerText(), 10);
  }
}
async function confirm() { await review().getByRole('button', { name: 'Confirm Move', exact: true }).click(); await review().waitFor({ state: 'detached' }); }
async function cancel() { await review().getByRole('button', { name: 'Cancel', exact: true }).click(); await review().waitFor({ state: 'detached' }); }
await mkdir('.local/org-poc', { recursive: true });
try {
  await page.goto(`${origin}/prototypes/survey-team`);
  await card('manager').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await check('fixture scale and available personnel', async () => {
    assert.equal(await page.locator('[data-person]').count(), 33);
    assert.equal(await page.locator('.org-available [data-person]').count(), 3);
  });
  await page.screenshot({ path: '.local/org-poc/desktop.png', fullPage: true });
  await page.setViewportSize({ width: 1600, height: 3000 });
  await check('actual IM drag projects placement, cancel restores source', async () => {
    await drag('im-1', 'chief-2');
    assert.match(await review().innerText(), /Review Manpower Move/);
    assert.equal(await page.locator('.org-crew').filter({ has: card('chief-2') }).locator('[data-person="im-1"]').count(), 1);
    assert.equal(await card('im-1').getByText('Proposed', { exact: true }).count(), 1);
    await page.screenshot({ path: '.local/org-poc/review.png', fullPage: true, animations: 'disabled' });
    await cancel();
    assert.equal(await page.locator('.org-crew').filter({ has: card('chief-1') }).locator('[data-person="im-1"]').count(), 1);
  });
  await check('IM confirmation commits local move', async () => {
    await drag('im-1', 'chief-2');
    await review().getByRole('button', { name: 'Confirm Move', exact: true }).click();
    assert.equal(await page.locator('.org-crew').filter({ has: card('chief-2') }).locator('[data-person="im-1"]').count(), 1);
  });
  await check('invalid IM-to-Superintendent drop rejected', async () => {
    await drag('im-2', 'sup-2'); assert.equal(await review().count(), 0);
    assert.equal(await page.locator('.org-crew').filter({ has: card('chief-1') }).locator('[data-person="im-2"]').count(), 1);
  });
  await check('whole crew moves with current descendants', async () => {
    await drag('chief-1', 'sup-2');
    assert.match(await review().innerText(), /2 Instrument Men move together/);
    await review().getByRole('button', { name: 'Confirm Move', exact: true }).click();
    const branch = page.locator('.org-branch').filter({ has: card('sup-2') });
    for (const id of ['chief-1', 'im-2', 'im-3']) assert.equal(await branch.locator(`[data-person="${id}"]`).count(), 1);
    assert.equal(await branch.locator('[data-person="im-1"]').count(), 0);
  });
  await check('available assignment and preserved review facts', async () => {
    await drag('available-0', 'chief-2');
    assert.match(await review().innerText(), /Unassigned \/ Available Personnel/);
    assert.match(await review().innerText(), /Existing request assignments\s+Retained/);
    await review().getByRole('button', { name: 'Confirm Move', exact: true }).click();
    assert.equal(await page.locator('.org-available [data-person]').count(), 2);
  });
  await check('keyboard move, Escape cancellation and focus return', async () => {
    const button = card('im-4').getByRole('button', { name: 'Move', exact: true });
    await button.focus(); await page.keyboard.press('Enter');
    await review().getByRole('button', { name: /Sofia Patel/ }).click();
    await page.keyboard.press('Escape'); await review().waitFor({ state: 'detached' });
    await button.waitFor();
    assert.equal(await button.evaluate(el => el === document.activeElement), true);
  });
  await check('collapse and expand retain hierarchy', async () => {
    await card('sup-1').getByRole('button', { name: 'Collapse' }).click();
    assert.equal(await page.locator('#branch-sup-1').isVisible(), false);
    await card('sup-1').getByRole('button', { name: 'Expand' }).click();
    assert.equal(await page.locator('#branch-sup-1').isVisible(), true);
  });
  await page.setViewportSize({ width: 1600, height: 4600 });
  await page.getByRole('button', { name: 'Reset Demo' }).click();
  const normalCardWidth = (await card('manager').boundingBox()).width;
  const toolbarWidth = (await page.getByRole('button', { name: 'Zoom In', exact: true }).boundingBox()).width;
  const headerHeight = (await page.locator('.org-header').boundingBox()).height;
  const availableWidth = (await card('available-0').boundingBox()).width;
  for (const zoom of [50, 100, 150]) {
    await check(`IM drag at ${zoom}%: native painted target, highlight, review and placement`, async () => {
      await page.getByRole('button', { name: 'Reset Demo' }).click();
      await setZoom(zoom);
      assert.ok(Math.abs((await card('manager').boundingBox()).width - normalCardWidth * zoom / 100) < 2);
      assert.equal((await page.getByRole('button', { name: 'Zoom In', exact: true }).boundingBox()).width, toolbarWidth);
      assert.equal((await page.locator('.org-header').boundingBox()).height, headerHeight);
      assert.equal((await card('available-0').boundingBox()).width, availableWidth);
      await drag('im-1', 'chief-2', 'valid');
      // Review remains normal size outside the zoomed chart.
      assert.equal(Math.round((await review().boundingBox()).width), 680);
      await confirm();
      assert.equal(await page.locator('.org-crew').filter({ has: card('chief-2') }).locator('[data-person="im-1"]').count(), 1);
    });
    if (zoom !== 100) await check(`collapsed whole-crew move and invalid target at ${zoom}%`, async () => {
      await page.getByRole('button', { name: 'Reset Demo' }).click();
      await card('chief-1').getByRole('button', { name: /Collapse.*crew/ }).click();
      await drag('chief-1', 'sup-2', 'valid');
      assert.match(await review().innerText(), /3 Instrument Men move together/);
      await confirm();
      assert.equal(await card('chief-1').getByRole('button', { name: /Expand.*crew/ }).getAttribute('aria-expanded'), 'false');
      assert.equal(await page.locator('#branch-chief-1').isVisible(), false);
      const branch = page.locator('.org-branch').filter({ has: card('sup-2') });
      assert.equal(await branch.locator('[data-person="chief-1"]').count(), 1);
      await card('chief-1').getByRole('button', { name: /Expand.*crew/ }).click();
      for (const id of ['im-1', 'im-2', 'im-3']) assert.equal(await branch.locator(`[data-person="${id}"]`).isVisible(), true);
      await drag('im-1', 'sup-1', 'invalid');
      assert.equal(await review().count(), 0);
      assert.equal(await branch.locator('[data-person="im-1"]').count(), 1);
    });
  }
  await check('collapsed Chief stays closed; proposed/canceled/confirmed and available roster counts are accurate', async () => {
    await page.getByRole('button', { name: 'Reset Demo' }).click();
    await setZoom(50);
    for (const id of ['chief-2', 'chief-3', 'chief-5']) await card(id).getByRole('button', { name: /Collapse.*crew/ }).click();
    assert.match(await card('chief-2').innerText(), /2 Instrument Men hidden/);
    assert.equal(await page.locator('#branch-chief-2').isVisible(), false);
    await drag('im-1', 'chief-2', 'valid');
    assert.match(await card('chief-2').innerText(), /3 Instrument Men hidden/);
    assert.match(await card('chief-2').innerText(), /Proposed/);
    assert.equal(await page.locator('#branch-chief-2').isVisible(), false);
    await cancel();
    assert.match(await card('chief-2').innerText(), /2 Instrument Men hidden/);
    await drag('im-1', 'chief-2', 'valid'); await confirm();
    assert.match(await card('chief-2').innerText(), /3 Instrument Men hidden/);
    assert.equal(await page.locator('#branch-chief-2').isVisible(), false);
    await drag('available-0', 'chief-2', 'valid'); await confirm();
    assert.match(await card('chief-2').innerText(), /4 Instrument Men hidden/);
    assert.equal(await page.locator('.org-available [data-person]').count(), 2);
    await setZoom(150);
    await card('chief-2').getByRole('button', { name: /Expand.*crew/ }).click();
    for (const id of ['im-1', 'im-4', 'im-5', 'available-0']) assert.equal(await page.locator('#branch-chief-2').locator(`[data-person="${id}"]`).isVisible(), true);
    assert.equal(await page.locator('#branch-chief-3').isVisible(), false);
    assert.equal(await page.locator('#branch-chief-5').isVisible(), false);
  });
  for (const zoom of [50, 100, 150]) await check(`native drop after canvas scrolling at ${zoom}%`, async () => {
    await page.getByRole('button', { name: 'Reset Demo' }).click();
    await setZoom(zoom);
    await drag('im-1', 'chief-8', 'valid');
    if (zoom === 150) {
      const offset = await page.locator('.org-scroll').evaluate(el => ({ x: el.scrollLeft, y: el.scrollTop }));
      assert.ok(offset.x > 0 && offset.y > 0);
    }
    await confirm();
    assert.equal(await page.locator('#branch-chief-8 [data-person="im-1"]').count(), 1);
  });
  await check('zoom bounds/reset and overview captures', async () => {
    await page.getByRole('button', { name: 'Reset Demo' }).click();
    await setZoom(50);
    assert.equal(await page.getByRole('button', { name: 'Zoom Out', exact: true }).isDisabled(), true);
    for (let i = 1; i <= 8; i++) await card(`chief-${i}`).getByRole('button', { name: /Collapse.*crew/ }).click();
    await page.setViewportSize({ width: 1600, height: 1100 });
    await page.screenshot({ path: '.local/org-poc/zoom-min-collapsed.png', fullPage: true, animations: 'disabled' });
    await setZoom(150);
    assert.equal(await page.getByRole('button', { name: 'Zoom In', exact: true }).isDisabled(), true);
    await page.screenshot({ path: '.local/org-poc/zoom-max-collapsed.png', fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Reset to 100%', exact: true }).click();
    assert.equal(await page.getByLabel('Current chart zoom').innerText(), '100%');
    assert.equal(await page.getByRole('button', { name: 'Reset to 100%', exact: true }).isDisabled(), true);
    await page.screenshot({ path: '.local/org-poc/zoom-normal-collapsed.png', fullPage: true, animations: 'disabled' });
  });
  await check('fixed viewport and toolbar; zoom never shifts surrounding page; canvas and page scroll independently', async () => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.getByRole('button', { name: 'Reset Demo' }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    const footprint = () => page.evaluate(() => {
      const rect = selector => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return [r.x, r.y + scrollY, r.width, r.height];
      };
      return { panel: rect('.org-chart-container'), viewport: rect('.org-scroll'), toolbar: rect('.org-toolbar'), tray: rect('.org-available'), pageHeight: document.documentElement.scrollHeight };
    });
    const baseline = await footprint();
    const anchoring = await page.locator('.org-toolbar').evaluate(el => {
      const toolbar = el.getBoundingClientRect();
      const panel = el.closest('.org-chart-container').getBoundingClientRect();
      const canvas = document.querySelector('.org-scroll').getBoundingClientRect();
      return { position: getComputedStyle(el).position, left: toolbar.left - panel.left, top: toolbar.top - panel.top, clear: toolbar.bottom <= canvas.top };
    });
    assert.equal(anchoring.position, 'absolute');
    assert.equal(anchoring.left, 13);
    assert.equal(anchoring.top, 13);
    assert.equal(anchoring.clear, true);
    for (const zoom of [50, 60, 70, 100, 130, 150]) {
      await setZoom(zoom);
      assert.deepEqual(await footprint(), baseline);
    }
    await page.locator('.org-scroll').scrollIntoViewIfNeeded();
    const canvas = await page.locator('.org-scroll').boundingBox();
    const before = await page.locator('.org-toolbar').boundingBox();
    const pageY = await page.evaluate(() => scrollY);
    await page.mouse.move(canvas.x + 200, canvas.y + 150);
    await page.mouse.wheel(350, 400);
    await page.waitForFunction(() => document.querySelector('.org-scroll').scrollTop > 0);
    assert.equal(await page.evaluate(() => scrollY), pageY);
    assert.ok(await page.locator('.org-scroll').evaluate(el => el.scrollLeft > 0));
    assert.deepEqual(await page.locator('.org-toolbar').boundingBox(), before);
    await page.screenshot({ path: '.local/org-poc/toolbar-panned.png', animations: 'disabled' });
    await page.locator('.org-toolbar').hover();
    await page.mouse.wheel(0, 3000);
    await page.waitForFunction(() => document.querySelector('.org-available-list').getBoundingClientRect().bottom <= innerHeight);
    for (const id of ['available-0', 'available-1', 'available-2']) {
      const bounds = await card(id).boundingBox();
      assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 768);
    }
    await page.screenshot({ path: '.local/org-poc/page-scroll-available.png', animations: 'disabled' });
    await page.locator('.org-scroll').evaluate(el => { el.scrollLeft = 0; el.scrollTop = 0; });
    await setZoom(100);
  });
  await check('130% chart at reported window size exposes the complete available tray', async () => {
    await page.setViewportSize({ width: 1915, height: 948 });
    await setZoom(130);
    for (const name of ['Zoom In', 'Zoom Out']) {
      const button = page.getByRole('button', { name, exact: true });
      assert.equal(await button.innerText(), '');
      assert.equal(await button.locator('svg[aria-hidden="true"]').count(), 1);
      assert.equal(await button.getAttribute('title'), name);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('.org-toolbar').hover();
    await page.mouse.wheel(0, 10000);
    await page.waitForFunction(() => document.querySelector('.org-available-list').getBoundingClientRect().bottom <= innerHeight);
    for (const id of ['available-0', 'available-1', 'available-2']) {
      const bounds = await card(id).boundingBox();
      assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 948);
    }
    await page.screenshot({ path: '.local/org-poc/reported-window-available.png', animations: 'disabled' });
    await setZoom(100);
  });
  await page.getByRole('button', { name: 'Reset Demo' }).click();
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.getByRole('button', { name: 'Dark Theme' }).click();
  await page.evaluate(() => Promise.allSettled(document.getAnimations().map(animation => animation.finished)));
  await page.screenshot({ path: '.local/org-poc/desktop-dark.png', fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 797, height: 1000 });
  await check('narrow chart scroll contained to chart', async () => {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.locator('.org-scroll').evaluate(el => el.scrollWidth > el.clientWidth), true);
  });
  // Chromium may omit offscreen text layers in very tall full-page captures.
  // Geometry is tested at the real viewport above, then every layer is brought
  // into view for the raw visual evidence.
  await page.setViewportSize({ width: 797, height: 3200 });
  await page.screenshot({ path: '.local/org-poc/narrow.png', fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Light Theme' }).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.setViewportSize({ width: 390, height: 3500 });
  await page.screenshot({ path: '.local/org-poc/mobile.png', fullPage: true, animations: 'disabled' });
  await page.reload();
  await card('manager').waitFor();
  assert.equal(await page.locator('.org-available [data-person]').count(), 3);
  assert.deepEqual(failures, []); assert.deepEqual(apiCalls, []);
  receipts.push('refresh resets fixtures; zero API requests; zero browser errors');
  await writeFile('.local/org-poc/evidence.json', JSON.stringify({ receipts, apiCalls, failures }, null, 2));
  console.log(JSON.stringify({ checks: receipts.length, receipts }, null, 2));
} finally { await browser.close(); }

