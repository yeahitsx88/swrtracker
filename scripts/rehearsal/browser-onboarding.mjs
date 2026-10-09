import {playwrightModuleURL} from '../../tests/playwright-runtime.mjs';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const manifest=JSON.parse(await fs.readFile('.local-customer-rehearsal/manifest.json','utf8'));
const f=manifest.datasets.auto;
const {chromium}=await import(playwrightModuleURL);
const browser=await chromium.launch({headless:true,channel:'msedge'});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
const out='audits/customer-lifecycle-rehearsal';
try {
 await page.goto(`http://localhost:${f.port}/login`);
 await page.getByLabel('Tenant ID',{exact:true}).waitFor();
 await page.screenshot({path:out+'/login.png',fullPage:true});
 await page.getByLabel('Tenant ID',{exact:true}).fill(f.tenant);
 await page.getByLabel('Email',{exact:true}).fill(f.actors.admin.email);
 await page.getByLabel('Password',{exact:true}).fill(f.password);
 await page.getByRole('button',{name:'Sign In',exact:true}).click();
 await page.waitForURL('**/projects');
 await page.getByText('You do not have an active project membership.',{exact:true}).waitFor();
 assert.ok((await context.cookies()).some(c=>c.name==='swr_session'));
 await page.screenshot({path:out+'/first-admin-landing.png',fullPage:true});
 await fs.writeFile(out+'/browser-observations.json',JSON.stringify({at:new Date().toISOString(),baseline:manifest.baseline,actor:'Assisted client Tenant Admin',automationOnly:true,humanStatus:'HUMAN_PENDING',observed:{loginTenantIdRequired:true,normalPasswordLoginSucceeded:true,landing:new URL(page.url()).pathname,body:await page.locator('body').innerText()},evidence:['login.png','first-admin-landing.png']},null,2));
 console.log('Normal browser login and first-admin landing captured; human walkthrough remains pending.');
}finally{await browser.close();}
