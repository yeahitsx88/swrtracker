import {playwrightModuleURL} from '../playwright-runtime.mjs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
const url=new URL(process.env.DATABASE_URL??'');
if(process.env.SWR_TEAM_POSTGRES!=='1'||url.hostname!=='127.0.0.1'||url.port!=='15489'||url.pathname!=='/swr_team_isolated')throw new Error('Disposable loopback fixture only');
const {chromium}=await import(playwrightModuleURL);
const browser=await chromium.launch({headless:true,channel:'msedge'});
const id=n=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`,project=id(2),origin='http://127.0.0.1:3107';
const token=(user,sv=1)=>jwt.sign({sub:user,tenantId:id(1),sv},process.env.JWT_SECRET,{expiresIn:'1h',jwtid:randomUUID()});
try{
  for(const width of [1440,390]){
    const context=await browser.newContext({viewport:{width,height:900}});
    await context.addCookies([{name:'swr_session',value:token(id(9)),url:origin}]);
    const page=await context.newPage(),calls=[],errors=[];
    page.on('request',request=>{if(request.url().includes('/api/'))calls.push(new URL(request.url()));});
    page.on('pageerror',error=>errors.push(error.message));
    const explorer=page.locator('#panel-overview .kpi-explorer');
    const settle=()=>page.waitForLoadState('networkidle');
    const capture=async name=>{
      await page.evaluate(async()=>{scrollTo(0,0);await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.screenshot({path:`.impeccable/review/superintendent-${width}-${name}.png`,fullPage:true});
    };
    await page.goto(`${origin}/projects/${project}/survey/operations`,{waitUntil:'networkidle'});
    await explorer.locator('p[aria-live=polite]').waitFor();
    await page.getByRole('link',{name:'Survey Operations',exact:true}).waitFor();
    assert.equal(await page.getByRole('tab',{name:/Local Messages/}).count(),0);
    assert.equal(calls.filter(call=>call.pathname.endsWith('/metrics')).length,1,'Overview must reuse the initial aggregate');
    assert.equal(calls.filter(call=>call.pathname==='/api/tickets').length,0,'Drill-down is lazy');
    assert.ok(!calls.some(call=>call.searchParams.get('view')==='activity'),'No Manager-only activity call');
    assert.equal(await explorer.locator('p[aria-live=polite] strong').textContent(),'7');
    await page.getByRole('heading',{name:'Area-wide workload',exact:true}).waitFor();
    assert.equal(await explorer.getByRole('combobox',{name:'Assigned Instrument Man',exact:true}).count(),0);
    await capture('area');
    await explorer.getByRole('combobox',{name:'Workload view',exact:true}).selectOption('linkedCrews');await settle();
    assert.equal(await explorer.locator('p[aria-live=polite] strong').textContent(),'3');
    await explorer.locator('summary').filter({hasText:'Filters and date range'}).click();
    assert.equal(await explorer.getByRole('combobox',{name:'Party Chief / crew',exact:true}).locator('option').count(),2);
    await explorer.getByRole('combobox',{name:'Group by',exact:true}).selectOption('crews');
    const before=calls.filter(call=>call.pathname.endsWith('/metrics')).length;
    for(const kind of ['donut','gauge','trend','heat','bar']){await explorer.getByRole('combobox',{name:'Visualization',exact:true}).selectOption(kind);}
    assert.equal(calls.filter(call=>call.pathname.endsWith('/metrics')).length,before,'Presentation changes do not refetch aggregates');
    await explorer.getByRole('combobox',{name:'Request type',exact:true}).selectOption('LAYOUT');
    await explorer.getByRole('combobox',{name:'Party Chief / crew',exact:true}).selectOption(id(7));
    await explorer.getByRole('button',{name:'Apply filters',exact:true}).click();await settle();
    await explorer.locator('summary').filter({hasText:'Filters and date range'}).click();
    await capture('linked');
    await explorer.getByRole('button',{name:'Show matching requests',exact:true}).click();await settle();
    const detail=explorer.getByRole('region',{name:'Matching KPI requests'});
    await detail.locator('li').first().waitFor();
    assert.equal(await detail.locator('li').count(),3);
    const ticketCall=calls.filter(call=>call.pathname==='/api/tickets').at(-1);
    assert.equal(ticketCall.searchParams.get('cohort'),'linkedCrews');assert.equal(ticketCall.searchParams.get('crewId'),id(7));
    await explorer.getByRole('combobox',{name:'Workload view',exact:true}).selectOption('areaWorkload');await settle();
    assert.equal(await explorer.locator('p[aria-live=polite] strong').textContent(),'7');
    assert.equal(await explorer.getByRole('region',{name:'Matching KPI requests'}).count(),0);
    assert.equal(await explorer.getByRole('combobox',{name:'Group by',exact:true}).inputValue(),'areas');
    const areaCall=calls.filter(call=>call.pathname.endsWith('/metrics')).at(-1);
    assert.equal(areaCall.searchParams.get('crewId'),null);assert.equal(areaCall.searchParams.get('ticketType'),'LAYOUT');
    await explorer.getByRole('combobox',{name:'Workload view',exact:true}).selectOption('linkedCrews');await settle();
    await explorer.getByRole('button',{name:'Reset filters',exact:true}).click();await settle();
    assert.equal(await explorer.getByRole('combobox',{name:'Workload view',exact:true}).inputValue(),'linkedCrews');
    await explorer.getByRole('combobox',{name:'KPI',exact:true}).selectOption('completed');await settle();
    assert.equal(await explorer.locator('p[aria-live=polite] strong').textContent(),'1');
    assert.equal(calls.filter(call=>call.pathname.endsWith('/metrics')).at(-1).searchParams.get('cohort'),'linkedCrews');
    let fail=true;
    await page.route('**/api/projects/*/metrics*',async route=>{
      if(fail){fail=false;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{type:'InternalError',message:'Fixture unavailable; retry analytics.'}})});}else await route.continue();
    });
    await explorer.getByRole('combobox',{name:'KPI',exact:true}).selectOption('all');await settle();
    await explorer.getByRole('alert').waitFor();
    assert.equal(await explorer.getByRole('combobox',{name:'Workload view',exact:true}).inputValue(),'linkedCrews');
    await explorer.getByRole('button',{name:'Retry analytics',exact:true}).click();await settle();
    assert.equal(await explorer.locator('p[aria-live=polite] strong').textContent(),'3');
    await page.getByRole('tab',{name:/Need Assignment/}).click();await settle();
    await page.locator('.ops-queue-row').first().waitFor();
    await page.locator('.ops-queue-row summary').first().click();
    assert.equal(await page.getByRole('button',{name:'Save Assignment',exact:true}).count(),0);
    assert.ok(!calls.some(call=>call.pathname.endsWith('/members')));
    assert.ok(!calls.some(call=>call.pathname.endsWith('/notifications')));
    if(width===390){
      await page.getByRole('tab',{name:'Overview',exact:true}).click();await settle();
      await page.unroute('**/api/projects/*/metrics*');
      await page.route('**/api/projects/*/metrics*',async route=>{
        const response=await route.fetch(),body=await response.json();
        body.analytics.linkedCrewCount=0;body.analytics.personnelFilters=false;
        body.metrics.total=0;body.metrics.populationTotal=0;
        for(const key of ['areas','types','statuses','crews','instrumentMen','months','cells'])body.metrics.charts[key]=[];
        body.metrics.charts.facets={areas:[],crews:[],instrumentMen:[]};
        await route.fulfill({response,json:body});
      });
      await explorer.getByRole('combobox',{name:'Workload view',exact:true}).selectOption('linkedCrews');await settle();
      await explorer.getByText('No linked crews in your authorized Areas.',{exact:false}).waitFor();
      await capture('empty');
    }
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({width,initialAggregateCalls:1,areaTotal:7,linkedTotal:3,drilldownScoped:true,overflow:false,pageErrors:0}));
    await context.close();
  }
}finally{await browser.close();}
