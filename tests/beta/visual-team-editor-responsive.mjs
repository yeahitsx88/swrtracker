import {playwrightModuleURL} from '../playwright-runtime.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
assert.equal(process.env.SWR_VISUAL_TEAM,'198');
const owned=JSON.parse(await fs.readFile('.local/alpha-acceptance197/ownership.json','utf8'));assert.equal(owned.hostPort,15500);assert.match(owned.container,/^swr-alpha-acceptance197-db-[a-f0-9]{8}$/);
const f=JSON.parse(await fs.readFile('.local/visual-team198/fixture.json','utf8')),origin='http://127.0.0.1:3213';
const {chromium}=await import(playwrightModuleURL),browser=await chromium.launch({channel:'msedge',headless:true});
const captures=[],errors=[];let checks=0;
try{for(const who of ['manager','superintendent'])for(const mode of ['LIGHT','DARK']){
 const c=await browser.newContext({viewport:{width:390,height:820},reducedMotion:'reduce'});await c.addCookies([{name:'swr_session',value:f.tokens[who],url:origin,httpOnly:true}]);
 assert.equal((await c.request.put(origin+'/api/account/appearance',{data:{scope:'PERSONAL',mode},headers:{'Idempotency-Key':randomUUID()}})).status(),200);
 const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(origin+'/projects/'+f.project+'/survey/teams');await p.getByRole('button',{name:'Open Visual Editor',exact:true}).click();await p.locator('.org-chart').waitFor();if(mode==='DARK')await p.getByRole('button',{name:'Dark Theme',exact:true}).click();
 const card=p.locator('[data-person="'+f.people.instrument+'"]');await card.scrollIntoViewIfNeeded();
 async function shot(state){const path='.impeccable/review/visual-team198-'+who+'-'+state+'-'+mode.toLowerCase()+'-390.png';await p.screenshot({path});captures.push(path);}
 await shot('chart');await card.locator('.org-card-actions button').click();await p.getByRole('dialog').last().getByRole('button',{name:/^Visual secondChief /}).click();await p.getByRole('heading',{name:/^Review Visual/}).waitFor();
 const review=p.getByRole('dialog').last();if(who==='manager'){await review.getByRole('button',{name:'Preview Manpower Move',exact:true}).click();await review.getByLabel(/^Reason /).fill('Reviewed responsive visual assignment');}
 const checkbox=review.getByRole('checkbox',{name:who==='manager'?'I confirm the displayed move and preservation of existing request assignments.':'I confirm this crew reassignment.',exact:true});await checkbox.check();
 await review.locator('.popout-body').evaluate(n=>n.scrollTop=0);await shot('review-top');
 const action=review.getByRole('button',{name:who==='manager'?'Confirm Manpower Move':'Confirm crew reassignment',exact:true});await action.focus();await shot('review-confirm');
 assert(await action.isEnabled());assert(await action.evaluate(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}));assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));checks+=3;
 if(who==='manager')await review.getByRole('button',{name:'Reload Current Movement Choices',exact:true}).click();else await review.getByRole('button',{name:'Reload workforce',exact:true}).click();await p.getByRole('heading',{name:/^Review Visual/}).waitFor({state:'hidden'});await p.keyboard.press('Escape');assert.equal(await p.locator('dialog.survey-org-chart-overlay').count(),0);checks++;await c.close();
}assert.deepEqual(errors,[]);await fs.writeFile('.local/visual-team198/results/responsive.json',JSON.stringify({checks,captures,pageErrors:errors},null,2));console.log(JSON.stringify({checks,captures:captures.length,pageErrors:errors}));}finally{await browser.close();}
