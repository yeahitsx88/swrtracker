import {playwrightModuleURL} from '../playwright-runtime.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import jwt from 'jsonwebtoken';
assert.equal(process.env.SWR_SURVEY_WORKFLOW_TEST,'1');
const f=JSON.parse(await fs.readFile('.local-survey-ui.json','utf8'));assert.equal(f.origin,'http://127.0.0.1:3150');
const {chromium}=await import(playwrightModuleURL);
const browser=await chromium.launch({channel:'msedge',headless:true});
const checks=[];function check(value,label){assert(value,label);checks.push(label);}
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 await context.addCookies([{name:'swr_session',value:jwt.sign({sub:f.manager,tenantId:f.tenant,sv:1},f.secret,{algorithm:'HS256',expiresIn:'1h',jwtid:crypto.randomUUID()}),url:f.origin,httpOnly:true,sameSite:'Lax'}]);
 const page=await context.newPage();await page.goto(`${f.origin}/projects/${f.project}/home`);
 const widgets=page.locator('[data-widget]');await widgets.first().waitFor();
 const names=()=>widgets.evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-widget')));
 const initial=await names();check(initial.length>=5,'Survey dashboard widgets rendered');
 // Batch 297 replaced the Arrange mode with direct drag (title bar or grip) and a keyboard alternative on the grip.
 const grip=id=>page.locator('[data-widget="'+id+'"] .home-widget-grip');
 await grip(initial[0]).focus();await page.keyboard.press('Space');await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-pressed')==='true');await page.keyboard.press('ArrowDown');await page.waitForTimeout(250);await page.keyboard.press('Enter');await page.waitForFunction(()=>!document.querySelector('[aria-pressed="true"].home-widget-grip'));
 check((await names())[1]===initial[0],'Keyboard pick-up and arrow move reorder the widget');
 await grip(initial[0]).focus();await page.keyboard.press('Space');await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-pressed')==='true');await page.keyboard.press('ArrowUp');await page.waitForTimeout(250);await page.keyboard.press('Enter');await page.waitForFunction(()=>!document.querySelector('[aria-pressed="true"].home-widget-grip'));
 check((await names())[0]===initial[0],'Keyboard move restores first widget');
 const from=await grip(initial[0]).boundingBox(),to=await widgets.nth(2).boundingBox();
 await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();await page.mouse.move(from.x+from.width/2+6,from.y+from.height/2+6);await page.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:15});await page.mouse.up();
 await page.waitForFunction(id=>document.querySelectorAll('[data-widget]')[0]?.getAttribute('data-widget')!==id,initial[0]);
 const dragged=(await names()).indexOf(initial[0]);check(dragged>0,'Pointer drag by the grip reorders the widget');
 await page.reload();await widgets.first().waitFor();await page.waitForFunction(([i,id])=>document.querySelectorAll('[data-widget]')[i]?.getAttribute('data-widget')===id,[dragged,initial[0]]);
 check((await names())[dragged]===initial[0],'Widget order persists across reload');
 const bounds=await widgets.evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {x:r.x,top:r.top,bottom:r.bottom};}));
 for(const left of [...new Set(bounds.map(r=>r.x))]){const column=bounds.filter(r=>r.x===left).sort((a,b)=>a.top-b.top);for(let i=1;i<column.length;i++)check(Math.abs(column[i].top-column[i-1].bottom-16)<2,'Adjacent widgets have a consistent 16px gap');}
 await page.screenshot({path:'.local-survey-widgets-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Reset dashboard layout',exact:true}).click();
 check(JSON.stringify(await names())===JSON.stringify(initial),'Reset restores default widget order');
 await page.setViewportSize({width:390,height:844});
 check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile dashboard has no page overflow');
 check(await widgets.evaluateAll(nodes=>new Set(nodes.map(node=>node.getBoundingClientRect().x)).size===1),'Mobile dashboard uses one continuous column');
 await page.evaluate(async()=>{document.activeElement?.blur();window.scrollTo(0,0);await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
 await page.screenshot({path:'.local-survey-widgets-mobile.png',fullPage:true});
 console.log(JSON.stringify({checks},null,2));await fs.writeFile('.local-survey-widget-results.json',JSON.stringify({checks},null,2));
}finally{await browser.close();}
