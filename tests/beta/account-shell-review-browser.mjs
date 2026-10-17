import {playwrightModuleURL} from '../playwright-runtime.mjs';
// Synthetic UI acceptance only; no database, credentials or imported records.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(playwrightModuleURL);
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
const origin='http://127.0.0.1:3107', project='20000000-0000-4000-8000-000000000002';
const buckets=(labels)=>labels.map((label,index)=>({key:label,label,count:100-index*5}));
const data={total:200,completed:180,canceled:10,open:10,firstDate:'2021-06-06',lastDate:'2024-05-22',imported:200,simulatedCompletions:50,
  statuses:[{key:'COMPLETED',label:'COMPLETED',count:180},{key:'SURVEY_CANCELED',label:'SURVEY_CANCELED',count:10},{key:'SUBMITTED',label:'SUBMITTED',count:10}],
  areas:buckets(['Utilities','Brownfield','Train 1','Train 2','Train 3','Offsite']),types:buckets(['LAYOUT','CHECK_OUT','AS_BUILT']),months:buckets(['2024-01','2024-02','2024-03']),
  facets:{areas:buckets(['Utilities','Train 1']),crews:[],statuses:buckets(['COMPLETED','SUBMITTED']),types:buckets(['LAYOUT','AS_BUILT'])},
  items:[{id:'20000000-0000-4000-8000-000000000010',number:'TEST-001',description:'Synthetic test request',status:'COMPLETED',type:'LAYOUT',area:'Utilities',requester:'Test Requester',crew:null,needBy:'2024-01-01',completedAt:'2024-01-01'}]};
const focusFailures=[];
try {
  for(const width of [1440,390,810,1559,1902]) {
    const context=await browser.newContext({viewport:{width,height:width===1902?912:884}});
    await context.addCookies([{name:'swr_session',value:'synthetic-browser-fixture',url:origin}]);
    const page=await context.newPage(),errors=[],calls=[];
    let accountFail=false,reviewFail=false,empty=false,logoutFail=true,accountName='John Doe';
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/api/**',async route=>{
      const request=route.request(),url=new URL(request.url());calls.push(url);
      let body={},status=200;
      if(url.pathname==='/api/account') { if(accountFail){status=503;body={error:{type:'InternalError',message:'Test account unavailable. Retry greeting.'}};}else body={name:accountName,email:'test@example.invalid',company:'Test company',assignment:null}; }
      else if(url.pathname==='/api/projects') body={projects:[{id:project,name:'Synthetic historical simulation (read-only)',role:'VIEWER',status:'ACTIVE'}]};
      else if(url.pathname.endsWith('/review')) {if(reviewFail){reviewFail=false;status=503;body={error:{type:'InternalError',message:'Test history unavailable. Retry.'}};}else body=empty?{...data,total:0,items:[]}:data;}
      else if(url.pathname==='/api/auth/logout'){if(logoutFail){logoutFail=false;status=503;body={error:{type:'InternalError',message:'Test logout unavailable. Please try again.'}};}else body={success:true};}
      await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    });
    const settle=()=>page.waitForLoadState('networkidle');
    const menu=()=>page.getByRole('button',{name:'Menu',exact:true});
    const visit=()=>page.goto(`${origin}/projects/${project}/requests`,{waitUntil:'networkidle'});
    const capture=async suffix=>{
      if(process.env.SWR_QA_CAPTURE==='0') return;
      await page.evaluate(async()=>{scrollTo(0,0);await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No horizontal page overflow');
      await page.waitForFunction(()=>document.querySelector('.account-drawer').getAnimations().length===0);
      await page.screenshot({path:`.impeccable/review/menu-overlay-${width}-${suffix}.png`});
    };
    await visit();await page.getByText('Hello, John Doe!',{exact:true}).waitFor();
    const lane=page.getByRole('region',{name:'Review charts; scroll horizontally'});
    await lane.waitFor();
    assert.equal(await lane.evaluate(node=>getComputedStyle(node).gridAutoFlow),'column');
    assert.equal(await lane.locator('> section').count(),4);
    assert.equal(await page.getByRole('button',{name:'Previous chart',exact:true}).isDisabled(),true);
    const aggregateCount=()=>calls.filter(url=>url.pathname.endsWith('/review')).length;
    const before=aggregateCount();
    await page.getByRole('button',{name:'Next chart',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#review-charts').scrollLeft>0);
    await page.getByRole('button',{name:'Previous chart',exact:true}).click();
    await page.getByRole('button',{name:'Expand chart grid',exact:true}).click();
    await page.getByRole('region',{name:'All review charts'}).waitFor();
    await page.getByRole('button',{name:'Collapse to one row',exact:true}).click();
    assert.equal(aggregateCount(),before,'Presentation controls must not refetch history');
    await page.evaluate(()=>scrollTo(0,0));
    if([1440,390,1902].includes(width)) await capture('closed');
    const original=await page.locator('main').boundingBox();
    await menu().click();await page.getByRole('navigation',{name:'Account navigation'}).waitFor();
    const nav=page.locator('.account-menu-panel');
    assert.equal(await nav.evaluate(node=>node.getAnimations().some(animation=>animation.transitionProperty==='transform'&&animation.effect.getTiming().duration===260)),true,'Opening uses the authored 260ms slide');
    assert.equal(await nav.getByRole('link',{name:'Assignment Details',exact:true}).getAttribute('href'),`/assignment-details?projectId=${project}`);
    await page.waitForFunction(()=>document.querySelector('.account-drawer').getAnimations().length===0);
    const current=await page.locator('main').boundingBox();
    assert.deepEqual(current,original,'Opening the overlay must not move or resize the page');
    assert.equal(await nav.evaluate(node=>node.matches(':modal')),true);
    assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden');
    const bounds=await nav.boundingBox();
    assert.equal(bounds.y,0);assert.equal(bounds.height,width===1902?912:884);
    assert.equal(Math.round(bounds.x+bounds.width),width,'Drawer fills the right edge');
    for(let i=0;i<8;i++) await page.keyboard.press('Tab');
    assert.equal(await nav.evaluate(node=>node.contains(document.activeElement)),true,'Dialog contains keyboard focus');
    await capture('menu');
    await page.keyboard.press('Escape');assert.equal(await menu().getAttribute('aria-expanded'),'false');
    assert.equal(await nav.evaluate(node=>node.getAnimations().some(animation=>animation.transitionProperty==='transform'&&animation.effect.getTiming().duration===180)),true,'Closing keeps the faster exit animation');
    if(!await menu().evaluate(node=>node===document.activeElement)) focusFailures.push(width);
    // Reopen during exit motion using the keyboard: no timer can close a newer menu.
    await page.keyboard.press('Space');await page.waitForFunction(()=>document.querySelector('.account-drawer').matches(':modal'));
    await page.waitForFunction(()=>document.querySelector('.account-drawer').getAnimations().length===0);
    await page.mouse.click(10,180);
    await page.waitForFunction(()=>!document.querySelector('.account-drawer').open);
    assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
    // Dragging from inside to the backdrop is not a backdrop click.
    await menu().click();await page.waitForFunction(()=>document.querySelector('.account-drawer').getAnimations().length===0);
    await page.mouse.move(width-100,180);await page.mouse.down();await page.mouse.move(10,180);await page.mouse.up();
    assert.equal(await nav.evaluate(node=>node.open),true);
    await nav.getByRole('button',{name:'Close account menu'}).click();
    await page.emulateMedia({reducedMotion:'reduce'});
    await menu().click();
    assert.equal(await nav.evaluate(node=>getComputedStyle(node).transform),'none');
    assert.equal(await nav.evaluate(node=>node.getAnimations().length),0,'Reduced motion has no spatial animation');
    await page.keyboard.press('Escape');await page.emulateMedia({reducedMotion:'no-preference'});
    await page.evaluate(()=>scrollTo(0,180));const scrollPosition=await page.evaluate(()=>scrollY);
    await menu().click();await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>scrollY),scrollPosition,'Dismissal restores focus without moving the page');
    await lane.locator('.review-status-legend button').first().click();await settle();
    await page.getByRole('region',{name:'Filtered requests'}).waitFor();
    assert.equal(calls.filter(url=>url.pathname.endsWith('/review')).at(-1).searchParams.get('status'),'COMPLETED');
    await Promise.all([page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/review')&&new URL(response.url()).searchParams.get('limit')==='50'),page.getByRole('combobox',{name:'Items per page',exact:true}).selectOption('50')]);await settle();
    assert.equal(calls.filter(url=>url.pathname.endsWith('/review')).at(-1).searchParams.get('limit'),'50');
    await page.getByRole('button',{name:'Overview',exact:true}).click();
    // Error/empty/recovery branches use the same presentation; no auth policy mocks are claimed as security acceptance.
    reviewFail=true;await page.getByRole('button',{name:'Reset all',exact:true}).click();await settle();
    await page.locator('.review-workspace').getByRole('alert').waitFor();await page.getByRole('button',{name:'Retry',exact:true}).click();await settle();await lane.waitFor();
    empty=true;await page.getByRole('textbox',{name:'Search requests',exact:true}).fill('no matches');await page.getByRole('button',{name:'Apply filters',exact:true}).click();await settle();
    await page.getByRole('heading',{name:'No matching requests'}).waitFor();
    await menu().click();await page.getByRole('button',{name:'Sign out',exact:true}).click();await settle();
    await nav.getByRole('alert').waitFor();assert.equal(await menu().getAttribute('aria-expanded'),'true');
    assert.equal(await page.getByRole('button',{name:'Sign out',exact:true}).isEnabled(),true);
    await page.getByRole('button',{name:'Close account menu'}).click();
    accountFail=true;await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'Retry greeting'}).waitFor();
    assert.equal(await page.getByText('Hello, John Doe!',{exact:true}).count(),0,'Failure does not invent a name');
    accountFail=false;await page.getByRole('button',{name:'Retry greeting'}).click();await settle();await page.getByText('Hello, John Doe!',{exact:true}).waitFor();
    accountName='Alexandria Catherine Montgomery-Worthington';await page.reload({waitUntil:'networkidle'});await page.getByText(`Hello, ${accountName}!`,{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Long account names must wrap without overflow');
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({width,drawer:'modal overlay',stationaryPage:true,backdropDismissal:true,rapidReopen:true,reducedMotion:true,charts:4,drilldown:true,recovery:true,overflow:false,pageErrors:0}));
    await context.close();
  }
  assert.deepEqual(focusFailures,[],'Closing the menu must return focus at every width');
}finally{await browser.close();}
