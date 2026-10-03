import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const local='.local-customer-rehearsal',out='audits/customer-lifecycle-rehearsal/operations';
const s=JSON.parse(await fs.readFile(local+'/operations.json','utf8')),f=JSON.parse(await fs.readFile(local+'/manifest.json','utf8')).datasets.human;
const {chromium}=await import(pathToFileURL(process.env.SWR_PLAYWRIGHT_MODULE).href),browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),origin='http://localhost:3116';
const results=[];
async function session(actor){const c=await browser.newContext({viewport:{width:1440,height:1000}}),p=await c.newPage();await p.goto(origin+'/login');await p.getByLabel('Tenant ID',{exact:true}).fill(f.tenant);await p.getByLabel('Email',{exact:true}).fill(actor.email);await p.getByLabel('Password',{exact:true}).fill(f.password);await p.getByRole('button',{name:'Sign In',exact:true}).click();await p.waitForURL('**/projects');return {c,p};}
try{
 const {c,p}=await session(s.successor);
 await p.goto(`${origin}/projects/${s.project.id}/admin`);await p.getByLabel('Find a project member',{exact:true}).fill('Zoe Zimmerman');await p.getByText(/Zoe Zimmerman ·/).first().waitFor();await p.waitForLoadState('networkidle');
 const r=await c.request.get(`${origin}/api/projects/${s.project.id}/administrators`),admins=await r.json(),zoe=s.people.find(p=>p.name==='Zoe Zimmerman');
 results.push({id:'OPS-F01',role:'PROJECT_ADMIN',actor:s.successor.id,expected:'Find and administer an eligible project member beyond the first100',observed:{listedAdministrators:admins.administrators.length,zoeInAdminList:admins.administrators.some(p=>p.userId===zoe.id),memberSearchFindsZoe:true,grantButtons:await p.getByRole('button',{name:'Grant Admin',exact:true}).count()},evidence:'admin-truncated-eligible-members.png'});
 await p.screenshot({path:out+'/admin-truncated-eligible-members.png',fullPage:true});await c.close();
 const {c:crew,p:chiefPage}=await session(s.crews[0].chief);await chiefPage.goto(`${origin}/projects/${s.project.id}/crew/work`);await chiefPage.waitForLoadState('networkidle');
 const buttons=chiefPage.getByRole('button',{name:'Complete Work',exact:true});
 if(await buttons.count()){
  const response=chiefPage.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/complete')&&r.request().method()==='POST');await buttons.first().click();const denied=await response;
  await chiefPage.getByText(/Current authority for this ticket action is required/).waitFor();await chiefPage.screenshot({path:out+'/chief-offered-forbidden-completion.png',fullPage:true});
  results.push({id:'OPS-F02',role:'PARTY_CHIEF',actor:s.crews[0].chief.id,expected:'Only the assigned Instrument Man receives completion controls',observed:{completionButtonOffered:true,status:denied.status(),body:await denied.json()},evidence:'chief-offered-forbidden-completion.png'});
 }else results.push({id:'OPS-F02',status:'NOT_REPRODUCED_NO_CURRENT_ACTIVE_WORK'});
 await crew.close();await fs.writeFile(out+'/friction-reproductions.json',JSON.stringify({at:new Date().toISOString(),results},null,2));console.log(JSON.stringify({observations:results.length,results:results.map(r=>({id:r.id,observed:r.observed}))}));
}finally{await browser.close();}
