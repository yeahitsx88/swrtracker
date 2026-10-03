import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root='.local-customer-rehearsal',out='audits/customer-lifecycle-rehearsal/continuity';
const s=JSON.parse(await fs.readFile(root+'/operations.json','utf8')),f=JSON.parse(await fs.readFile(root+'/manifest.json','utf8')).datasets.human;
const {chromium}=await import(pathToFileURL(process.env.SWR_PLAYWRIGHT_MODULE).href);
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const checks=[],errors=[],timings=[];
function check(name,value){checks.push({name,pass:!!value});assert.ok(value,name);}
await fs.mkdir(out,{recursive:true});
try{
 for(const actor of [s.manager,s.successor,s.crews[0].chief]){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),p=await context.newPage();
  p.on('pageerror',e=>errors.push({role:actor.role,error:e.message}));
  await p.goto('http://localhost:3116/login');
  await p.getByLabel('Tenant ID',{exact:true}).fill(f.tenant);await p.getByLabel('Email',{exact:true}).fill(actor.email);await p.getByLabel('Password',{exact:true}).fill(f.password);await p.getByRole('button',{name:'Sign In',exact:true}).click();await p.waitForURL('**/projects');await p.getByText(s.project.name,{exact:true}).first().waitFor();
  check(`${actor.role}: archived Northbank discoverable`,await p.getByText('Archived',{exact:true}).count()>0);
  await p.locator('a.project-card').filter({hasText:s.project.name}).click();await p.waitForLoadState('networkidle');
  const expected=actor===s.successor?'/admin':'/requests';check(`${actor.role}: correct permitted landing`,new URL(p.url()).pathname.endsWith(expected));
  if(actor===s.successor){
   const headings=await p.locator('.administration-section h3').allTextContents();check('Requested personnel section order',headings[0].includes('Add a project member')&&headings[1].includes('Project members and access')&&headings[2].includes('Independent Project Admin assignments'));
   for(const title of ['Project members and access','Independent Project Admin assignments','Subcontractor Requesters','Protected Survey Reviewer obligations']){
    const toggle=p.getByRole('button',{name:title,exact:true});check(`${title} initially collapsed`,await toggle.getAttribute('aria-expanded')==='false');await toggle.click();check(`${title} expands`,await toggle.getAttribute('aria-expanded')==='true');
   }
   await fs.writeFile('.local-customer-rehearsal/continuity-admin-debug.txt',await p.locator('body').innerText());await p.getByLabel('Filter project members',{exact:true}).fill(s.manager.email);await p.getByRole('region',{name:'project members table',exact:true}).getByText('Taylor Rivera',{exact:true}).waitFor().catch(async e=>{await fs.writeFile('.local-customer-rehearsal/continuity-filter-debug.txt',await p.locator('body').innerText());throw e;});check('Member table filter finds Taylor',await p.getByRole('region',{name:'project members table',exact:true}).getByText('Taylor Rivera',{exact:true}).count()===1);
   await p.getByLabel('Filter project members',{exact:true}).fill('');
   await p.getByRole('region',{name:'project members table',exact:true}).getByRole('button',{name:'Name',exact:false}).click();check('Table sorting exposes descending state',await p.getByRole('region',{name:'project members table',exact:true}).locator('th[aria-sort=descending]').count()===1);
   check('Member multi-selection available',await p.getByRole('checkbox',{name:'Select this page of project members'}).count()===1);
   check('Archived admin table filtering stays enabled',await p.getByLabel('Filter admin candidates',{exact:true}).isEnabled());check('Archived subcontractor filtering stays enabled',await p.getByLabel('Filter subcontractor requesters',{exact:true}).isEnabled());check('Archived request configuration cannot save',await p.getByRole('button',{name:'Save Configuration',exact:true}).isDisabled());check('Subcontractor table displays archived records',await p.getByRole('region',{name:'subcontractor requesters table',exact:true}).locator('tbody tr').count()>0);
  }else{
   check(`${actor.role}: historical request rows visible`,await p.locator('body').innerText().then(t=>/Completed|COMPLETED/.test(t)));
  }
  for(let run=0;run<3;run++){const t=performance.now();await p.reload();await p.waitForLoadState('networkidle');timings.push({role:actor.role,run,navigationToNetworkIdleMs:Math.round(performance.now()-t)});}
  if(actor===s.successor){for(const title of ['Project members and access','Independent Project Admin assignments','Subcontractor Requesters','Protected Survey Reviewer obligations'])await p.getByRole('button',{name:title,exact:true}).click();}
  await p.evaluate(()=>window.scrollTo(0,0));await p.screenshot({path:`${out}/${actor.role.toLowerCase()}-desktop.png`,fullPage:true});
  await p.setViewportSize({width:390,height:844});check(`${actor.role}: no mobile document overflow`,await p.evaluate(()=>document.documentElement.scrollWidth<=390));await p.evaluate(()=>window.scrollTo(0,0));await p.screenshot({path:`${out}/${actor.role.toLowerCase()}-mobile.png`,fullPage:true});
  await context.close();
 }
 check('No browser runtime errors',errors.length===0);
}finally{await fs.writeFile(out+'/browser.json',JSON.stringify({at:new Date().toISOString(),checks,errors,timings,measurement:'Real password logins in separate browser contexts. Navigation timings include Playwright network-idle quiet interval; not Core Web Vitals. Archived retained project inspected without mutations.'},null,2));await browser.close();}
console.log(JSON.stringify({checks:checks.length,pass:true}));

