// Opt-in read-only request acceptance on the owned local Sabine preview.
// Logs no credentials. Only creates/revokes its own test login sessions.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
if(process.env.SWR_SABINE_UI!=='1')throw Error('SWR_SABINE_UI=1 required');
const config=JSON.parse(fs.readFileSync('.data/sabine/runtime.json','utf8'));
const manifest=JSON.parse(fs.readFileSync('.data/sabine/manifest.json','utf8'));
const database=new URL(config.DATABASE_URL);
assert.equal(database.hostname,'127.0.0.1');assert.equal(database.port,'15488');assert.equal(database.pathname,'/swr_sabine_simulation');
const {chromium}=await import(pathToFileURL(process.env.SWR_PLAYWRIGHT_MODULE).href);
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const base='http://127.0.0.1:3106';
async function login(context){
  const response=await context.request.post(`${base}/api/auth/login`,{data:{tenantId:manifest.tenantId,email:'manager@sabine.example',password:config.SABINE_PASSWORD}});
  assert.equal(response.status(),200);
  // APIRequestContext omits Secure cookies on HTTP loopback. Supply the returned
  // bearer to this device-local test browser only, as the existing fixture does.
  const cookie=response.headers()['set-cookie']?.match(/(?:^|\n)swr_session=([^;]+)/);
  assert.ok(cookie);await context.addCookies([{name:'swr_session',value:cookie[1],url:base}]);
}
try {
  const second=await browser.newContext();await login(second);
  for(const width of [810,390]){
    const context=await browser.newContext({viewport:{width,height:884}});await login(context);
    const profile=await context.request.get(`${base}/api/account`);assert.equal(profile.status(),200);
    const account=await profile.json();assert.equal(typeof account.name,'string');
    const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`${base}/projects/${manifest.historyProjectId}/requests`,{waitUntil:'networkidle'});
    await page.getByText(`Hello, ${account.name}!`,{exact:true}).waitFor();
    const charts=page.getByRole('region',{name:'Review charts; scroll horizontally'});await charts.waitFor();
    assert.equal(await charts.locator('> section').count(),4);
    await page.getByRole('button',{name:'Next chart',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#review-charts').scrollLeft>0);
    await page.getByRole('button',{name:'Expand chart grid',exact:true}).click();await page.getByRole('region',{name:'All review charts'}).waitFor();
    await page.getByRole('button',{name:'Collapse to one row',exact:true}).click();
    await page.getByRole('button',{name:'Menu',exact:true}).click();
    const nav=page.getByRole('navigation',{name:'Account navigation'});await nav.waitFor();
    assert.equal(await nav.getByRole('link',{name:'Assignment Details',exact:true}).getAttribute('href'),`/assignment-details?projectId=${manifest.historyProjectId}`);
    await page.getByRole('button',{name:'Close account menu'}).click();
    await page.goto(`${base}/projects/${manifest.liveProjectId}/survey/operations`,{waitUntil:'networkidle'});
    await page.getByText(`Hello, ${account.name}!`,{exact:true}).waitFor();
    await page.getByRole('heading',{name:'Queue health',exact:true}).waitFor();
    await page.getByRole('button',{name:'Menu',exact:true}).click();
    assert.equal(await nav.getByRole('link',{name:'Home',exact:true}).getAttribute('href'),`/projects/${manifest.liveProjectId}`);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    const cookie=(await context.cookies()).find(item=>item.name==='swr_session');assert.ok(cookie);
    await nav.getByRole('button',{name:'Sign out',exact:true}).click();await page.waitForURL('**/login');
    const revoked=await fetch(`${base}/api/account`,{headers:{cookie:`swr_session=${cookie.value}`}});assert.equal(revoked.status,401);
    assert.equal((await second.request.get(`${base}/api/account`)).status(),200,'Other account session must remain active');
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({width,authenticatedGreeting:true,historicalCharts:4,liveQueue:true,sessionOnlyLogout:true,requestMutations:0,pageErrors:0}));
    await context.close();
  }
  assert.equal((await second.request.post(`${base}/api/auth/logout`)).status(),200);await second.close();
}finally{await browser.close();}
