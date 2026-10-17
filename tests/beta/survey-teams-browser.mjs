import {playwrightModuleURL} from '../playwright-runtime.mjs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(playwrightModuleURL);
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
const origin = 'http://127.0.0.1:3107', projectId = '17764988-064e-4754-8a9b-ab3f32d902e2';
const id = n => `30000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const roles = ['SURVEY_MANAGER','SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN','REQUESTER','PROJECT_ADMIN'];
async function inspect(width, capture) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  await context.addCookies([{ name: 'swr_session', value: 'mock-browser-fixture', url: origin }]);
  const page = await context.newPage(), calls = [], errors = [], mutationKeys = [];
  const people = Array.from({length:33},(_,index)=>({userId:id(index+1),name: index < 6 ? ['Morgan Manager','Sage Superintendent','Casey Chief','Indigo Instrument','Riley Requester','Alex Administrator'][index] : `Instrument ${String(index).padStart(2,'0')}`,email:`person${index}@sample.example`,role:index<6?roles[index]:'INSTRUMENT_MAN',active:true,teamId:index===7?id(900):null,teamName:index===7?'Utilities Team':null,roleVersion:1}));
  let teams = [], variant = 'normal', failNext = false, failPersonnel = false;
  const scopedPage = (items,url) => {
    const search=(url.searchParams.get('search')??'').toLowerCase(),limit=Number(url.searchParams.get('limit')??25),offset=Number(url.searchParams.get('offset')??0);
    const filtered=items.filter(item=>[item.name,item.email,item.role,item.areaName].some(value=>value?.toLowerCase().includes(search)));
    return {data:filtered.slice(offset,offset+limit),total:filtered.length,limit,offset};
  };
  await page.route('**/api/**',async route=>{
    const request=route.request(),url=new URL(request.url()),mode=url.searchParams.get('mode'),method=request.method();
    calls.push(`${method}:${url.pathname}${url.search}`);
    let data={},status=200;
    if(url.pathname==='/api/projects') data={projects:[{id:projectId,name:'Sabine Live',role:'SURVEY_MANAGER',status:'ACTIVE'}]};
    else if(url.pathname.endsWith('/survey/teams')) {
      if(variant==='unauthorized') {status=403;data={error:{type:'ForbiddenError',message:'Only the Survey Manager may manage project teams'}};}
      else if(method==='GET') {
        if(mode==='context') data={project:{status:variant==='closed'?'ARCHIVED':'ACTIVE',crewBuild:'FULL'}};
        else if(mode==='areas') data=scopedPage([{id:id(500),name:'Train 1'},{id:id(501),name:'Utilities, Flare and Offsite'}],url);
        else if(mode==='personnel') {
          if(failPersonnel){failPersonnel=false;status=503;data={error:{type:'InternalError',message:'Fixture unavailable — retry'}};} else data=scopedPage(people,url);
        } else if(url.searchParams.has('teamId')) data={team:teams.find(team=>team.id===url.searchParams.get('teamId'))};
        else data=scopedPage(teams,url);
      } else {
        const input=request.postDataJSON(); mutationKeys.push(request.headers()['idempotency-key']);
        if(failNext) {failNext=false;status=500;data={error:{type:'InternalError',message:'Uncertain response — retry the same form'}};}
        else if(method==='PATCH') {const person=people.find(item=>item.userId===input.userId);assert.equal(input.expectedRoleVersion,person.roleVersion);assert.equal(input.confirmRoleChanges,true);person.role=input.role;person.roleVersion++;data={changed:true};}
        else if(method==='POST') {
          const existing=teams.find(item=>item.id===input.teamId),members=input.memberIds.map(userId=>people.find(person=>person.userId===userId));
          assert.ok(members.some(person=>person.userId===input.leadUserId));
          const team={id:input.teamId??id(700),name:input.name,areaId:input.areaId,areaName:'Train 1',lead:members.find(person=>person.userId===input.leadUserId),members,memberCount:members.length,rowVersion:(existing?.rowVersion??0)+1};
          teams=teams.filter(item=>item.id!==team.id).concat(team);members.forEach(person=>{person.teamId=team.id;person.teamName=team.name;});data={teamId:team.id,rowVersion:team.rowVersion,changed:true};status=existing?200:201;
        } else if(method==='DELETE') {assert.equal(input.confirmDelete,true);teams=teams.filter(team=>team.id!==input.teamId);people.forEach(person=>{if(person.teamId===input.teamId){person.teamId=null;person.teamName=null;}});data={success:true};}
      }
    }
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  });
  page.on('pageerror',error=>errors.push(error.message));
  const visit=()=>page.goto(`${origin}/projects/${projectId}/survey/teams`,{waitUntil:'networkidle'});
  const settle=()=>page.waitForLoadState('networkidle');
  const editorFocus=()=>page.waitForFunction(()=>document.activeElement?.matches('h3[tabindex="-1"]'));
  const screenshot=async name=>{
    await page.evaluate(async()=>{scrollTo(0,0);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:`.impeccable/review/team-${width}-${name}.png`,fullPage:true});
  };
  await visit();await page.getByRole('button',{name:'Change role for Casey Chief',exact:true}).waitFor();
  assert.ok(!calls.some(call=>call.includes('/api/tickets')||call.includes('/metrics')||call.includes('/members')));
  assert.ok(!calls.some(call=>call.includes('/survey/teams')&&!call.includes('mode=personnel')&&!call.includes('mode=context')));
  assert.equal(await page.getByRole('button',{name:'Change role for Morgan Manager'}).isDisabled(),true);
  assert.equal(await page.getByRole('button',{name:'Change role for Alex Administrator'}).isDisabled(),true);
  if(capture)await screenshot('personnel');
  await page.getByRole('tab',{name:'Personnel',exact:true}).focus();await page.keyboard.press('ArrowRight');await settle();
  assert.equal(await page.getByRole('tab',{name:'Teams',exact:true}).getAttribute('aria-selected'),'true');
  await page.getByRole('button',{name:'Create team',exact:true}).click();await settle();
  await editorFocus();
  await page.getByRole('button',{name:'Back to teams',exact:true}).focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.activeElement?.id==='tm-title');
  await page.getByRole('button',{name:'Create team',exact:true}).click();await settle();await editorFocus();
  await page.getByLabel('Team name',{exact:true}).fill('Train 1 Survey Team');
  await page.getByRole('button',{name:'Train 1',exact:true}).click();
  await page.getByRole('button',{name:'Add Casey Chief',exact:true}).click();
  const peopleSection=page.getByRole('heading',{name:'Add project personnel',exact:true}).locator('..');
  await peopleSection.getByRole('button',{name:'Next',exact:true}).click();await settle();
  await page.getByRole('button',{name:'Add Instrument 19',exact:true}).click();
  await page.getByLabel('Team lead — selected member',{exact:false}).selectOption(id(3));
  assert.equal(await page.getByRole('button',{name:'Remove Casey Chief',exact:true}).isDisabled(),true);
  assert.equal(await page.getByRole('button',{name:'Create team',exact:true}).isEnabled(),true);
  if(capture)await screenshot('editor');
  await page.getByRole('button',{name:'Create team',exact:true}).click();await settle();
  await page.getByText('Train 1 Survey Team',{exact:true}).waitFor();
  if(capture)await screenshot('teams');
  await page.getByRole('button',{name:'View / edit team',exact:true}).click();await settle();
  await editorFocus();
  assert.equal(await page.getByLabel('Team lead — selected member',{exact:false}).inputValue(),id(3));
  await page.getByLabel('Team name',{exact:true}).fill('Train 1 Updated Team');
  await page.getByRole('button',{name:'Save team',exact:true}).click();await settle();
  await page.getByText('Train 1 Updated Team',{exact:true}).waitFor();
  variant='closed';await visit();await page.getByRole('tab',{name:'Teams',exact:true}).click();await settle();
  assert.equal(await page.getByRole('button',{name:'Create team',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'View team',exact:true}).click();await settle();
  await editorFocus();
  assert.equal(await page.getByRole('button',{name:'Save team',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Delete team…',exact:true}).count(),0);
  variant='normal';await visit();await page.getByRole('tab',{name:'Teams',exact:true}).click();await settle();
  await page.getByRole('button',{name:'View / edit team',exact:true}).click();await settle();
  await page.getByRole('button',{name:'Delete team…',exact:true}).click();
  await editorFocus();
  assert.equal(await page.getByRole('button',{name:'Delete team',exact:true}).isDisabled(),true);
  await page.getByLabel('I confirm deletion of this team.').check();await page.getByRole('button',{name:'Delete team',exact:true}).click();await settle();
  assert.equal(teams.length,0);
  await page.getByRole('tab',{name:'Personnel',exact:true}).click();await settle();
  await page.getByRole('button',{name:'Change role for Riley Requester',exact:true}).click();
  await editorFocus();
  await page.getByRole('button',{name:'Cancel',exact:true}).focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.activeElement?.id==='tm-title');
  await page.getByRole('button',{name:'Change role for Riley Requester',exact:true}).click();await editorFocus();
  await page.getByLabel('New role',{exact:false}).selectOption('INSTRUMENT_MAN');
  assert.equal(await page.getByRole('button',{name:'Save role',exact:true}).isDisabled(),true);
  await page.getByLabel('I confirm this role change and understand this person must sign in again.').check();failNext=true;
  await page.getByRole('button',{name:'Save role',exact:true}).click();await page.locator('.tm-workspace').getByRole('alert').waitFor();
  await page.getByRole('button',{name:'Save role',exact:true}).click();await settle();
  assert.equal(mutationKeys.at(-1),mutationKeys.at(-2),'Retry must preserve the command key');
  assert.equal(people[4].role,'INSTRUMENT_MAN');
  await page.getByRole('button',{name:'Change role for Riley Requester',exact:true}).click();
  await page.getByLabel('New role',{exact:false}).selectOption('REQUESTER');await page.getByLabel('I confirm this role change and understand this person must sign in again.').check();await page.getByRole('button',{name:'Save role',exact:true}).click();await settle();
  assert.equal(people[4].role,'REQUESTER');
  await page.getByLabel('Search name, email or role',{exact:true}).fill('Retry fixture');failPersonnel=true;
  await page.getByRole('button',{name:'Search',exact:true}).click();await page.getByRole('button',{name:'Retry',exact:true}).waitFor();
  await page.getByRole('button',{name:'Retry',exact:true}).click();await settle();
  await page.getByLabel('Search name, email or role',{exact:true}).fill('');await page.getByRole('button',{name:'Search',exact:true}).click();await settle();await page.getByRole('button',{name:'Change role for Casey Chief',exact:true}).waitFor();
  await page.getByLabel('Search name, email or role',{exact:true}).fill('No such person');await page.getByRole('button',{name:'Search',exact:true}).click();await settle();await page.getByText('No personnel match.',{exact:false}).waitFor();
  variant='unauthorized';calls.length=0;await visit();await page.locator('.tm-workspace').getByRole('alert').waitFor();assert.equal(await page.getByRole('tab',{name:'Personnel',exact:true}).count(),0);assert.ok(!calls.some(call=>call.includes('mode=personnel')));
  assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await context.close();console.log(`Team Management browser scenarios passed at ${width}px (${calls.length} denied-view requests)`);
}
try {await inspect(1440,process.env.SWR_QA_CAPTURE!=='0');await inspect(390,process.env.SWR_QA_CAPTURE!=='0');} finally {await browser.close();}
