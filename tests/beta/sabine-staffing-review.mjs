import {playwrightModuleURL} from '../playwright-runtime.mjs';
// Owned local preview acceptance: no staffing/request writes or screenshots.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
if (process.env.SWR_SABINE_UI !== '1') throw Error('SWR_SABINE_UI=1 required');
const config = JSON.parse(fs.readFileSync('.data/sabine/runtime.json','utf8'));
const manifest = JSON.parse(fs.readFileSync('.data/sabine/manifest.json','utf8'));
const database = new URL(config.DATABASE_URL);
assert.equal(database.hostname,'127.0.0.1'); assert.equal(database.port,'15488'); assert.equal(database.pathname,'/swr_sabine_simulation');
const { chromium } = await import(playwrightModuleURL);
const browser = await chromium.launch({headless:true,channel:'msedge'});
const origin = 'http://127.0.0.1:3106';
try {
  for (const width of [810,390]) {
    const context = await browser.newContext({viewport:{width,height:884}});
    try {
      const login = await context.request.post(`${origin}/api/auth/login`,{data:{tenantId:manifest.tenantId,email:'manager@sabine.example',password:config.SABINE_PASSWORD}});
      assert.equal(login.status(),200); const cookie = login.headers()['set-cookie']?.match(/(?:^|\n)swr_session=([^;]+)/); assert.ok(cookie);
      await context.addCookies([{name:'swr_session',value:cookie[1],url:origin}]);
      const page = await context.newPage(), errors = [], writes = [];
      page.on('pageerror',error => errors.push(error.message));
      page.on('request',request => { if (!['GET','HEAD'].includes(request.method())) writes.push(new URL(request.url()).pathname); });
      await page.goto(`${origin}/projects/${manifest.liveProjectId}/survey/teams`,{waitUntil:'networkidle'});
      const search = page.getByLabel('Search name, email or role',{exact:true}); await search.fill('Party Chief');
      await search.locator('..').locator('..').getByRole('button',{name:'Search',exact:true}).click();
      await page.getByRole('button',{name:/^Staffing for /}).first().click();
      await page.getByRole('heading',{name:'Current assignments',exact:true}).waitFor();
      const roster = page.locator('.tm-area-picker').filter({hasText:/Current Instrument Men/});
      assert.equal(await roster.getAttribute('open'),null);
      await roster.locator('summary').click(); await page.getByLabel('Search current roster',{exact:true}).waitFor();
      await roster.getByLabel('Items per page',{exact:false}).selectOption('25');
      await page.waitForLoadState('networkidle');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
      await page.getByRole('button',{name:'Add Instrument Men',exact:true}).click();
      await page.getByLabel('Search project name, email or role',{exact:true}).waitFor();
      await page.getByRole('button',{name:'Back to personnel',exact:true}).click();
      assert.deepEqual(errors,[]); assert.deepEqual(writes,[]);
      console.log(JSON.stringify({width,staffingRead:true,boundedRoster:true,onDemandPersonnel:true,staffingWrites:0,requestWrites:0,pageErrors:0}));
      await context.request.post(`${origin}/api/auth/logout`);
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
