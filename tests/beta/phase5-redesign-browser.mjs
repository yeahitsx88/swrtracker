import {playwrightModuleURL} from '../playwright-runtime.mjs';
// Intercepted presentation acceptance. No database or live account mutations.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
assert.equal(process.env.SWR_REDESIGN_UI,'1');
const {chromium}=await import(playwrightModuleURL);
const browser=await chromium.launch({headless:true,channel:'msedge'});
const base='http://127.0.0.1:3107',project='96000000-0000-4000-8000-000000000002',area='96000000-0000-4000-8000-000000000003',id='96000000-0000-4000-8000-000000000004';
fs.mkdirSync('.impeccable/review',{recursive:true});
let checks=0;
try {
 for(const width of [1440,390]) {
  const context=await browser.newContext({viewport:{width,height:884},reducedMotion:'reduce'});
  await context.addCookies([{name:'swr_session',value:'synthetic-ui-only',url:base}]);
  const page=await context.newPage();page.setDefaultTimeout(8000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  let role='REQUESTER',empty=false,starts=0,analytics=0;
  const ticket={id,tenantId:project,projectId:project,aorNodeId:area,ticketType:'LAYOUT',ticketNumber:'UI-T1-001',requesterId:area,requesterName:'Fixture requester',isOwnRequest:true,status:'ASSIGNED',priority:'HIGH',description:'Check the north control points before the next concrete placement.',requestedDate:'2020-01-01',craft:'Civil',fieldContact:'Fixture contact',fieldChannel:'Channel 2',returnCycle:0,createdAt:'2026-10-01T12:00:00Z'};
  await context.route('**/api/**',async route=>{
   const req=route.request(),path=new URL(req.url()).pathname;
   const answer=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
   if(path==='/api/account')return answer({name:'Alex Fixture',email:'fixture@example.invalid',assignment:{role}});
   if(path==='/api/projects')return answer({projects:[{id:project,name:'North Works — synthetic UI',role,status:'ACTIVE'}]});
   if(path.endsWith('/aor'))return answer({levels:[{id:area,depth:0,label:'Area'}],nodes:[{id:area,levelId:area,parentId:null,name:'North Area',code:'N1'}]});
   if(path.endsWith('/start')){starts++;return answer({ticket:{...ticket,status:'IN_PROGRESS'}});}
   if(path.includes('metrics')){analytics++;return answer({error:{message:'Not requested in this test'}},403);}
   if(path==='/api/tickets')return answer({data:empty?[]:[{...ticket,isOwnRequest:role==='REQUESTER'}],total:empty?0:1,limit:20,offset:0});
   return answer({error:{message:'Unexpected synthetic endpoint: '+path}},404);
  });
  const capture=async name=>{
   await page.evaluate(async()=>{scrollTo(0,0);await document.fonts.ready;});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,name+' overflow');checks++;
   await page.screenshot({path:'.impeccable/review/redesign-'+name+'-'+width+'.png',fullPage:true});
  };
  await page.goto(base+'/projects/'+project+'/my-requests',{waitUntil:'networkidle'});
  await page.getByRole('link',{name:'Open Details for UI-T1-001'}).waitFor();
  assert.equal(await page.getByRole('navigation',{name:'Project',exact:true}).getByRole('link').count(),3);checks++;
  assert.equal(await page.getByText('North Area',{exact:true}).count(),1);checks++;
  const tabs=await page.locator('.project-tabs').evaluate(node=>({position:getComputedStyle(node).position,bottom:node.getBoundingClientRect().bottom}));
  if(width===390){assert.equal(tabs.position,'fixed');assert.equal(Math.round(tabs.bottom),884);}else assert.notEqual(tabs.position,'fixed');checks++;
  const card=await page.locator('.request-card').boundingBox();
  await capture('requests');
  await page.mouse.click(card.x+card.width/2,card.y+card.height/2);
  await page.waitForURL('**/tickets/'+id);checks++;
  empty=true;await page.goto(base+'/projects/'+project+'/my-requests',{waitUntil:'networkidle'});
  await page.getByText('No requests yet',{exact:true}).waitFor();checks++;await capture('empty');
  empty=false;role='INSTRUMENT_MAN';await page.goto(base+'/projects/'+project+'/crew/work',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'Start Work',exact:true}).waitFor();
  assert.equal(await page.getByRole('navigation',{name:'Project',exact:true}).getByRole('link').count(),1);checks++;
  await page.getByRole('button',{name:'Start Work',exact:true}).click();
  await page.waitForLoadState('networkidle');assert.equal(starts,1);checks++;
  assert.match(page.url(),/crew\/work/);checks++;assert.equal(analytics,0);checks++;
  await capture('crew');
  await page.getByRole('button',{name:'Menu',exact:true}).click();
  await page.getByRole('button',{name:'Close account menu'}).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('button',{name:'Menu',exact:true}).evaluate(node=>document.activeElement===node),true);checks++;
  assert.deepEqual(errors,[]);checks++;await context.close();
 }
 console.log('Redesign desktop/mobile browser checks passed: '+checks);
} finally {await browser.close();}
