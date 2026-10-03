// Whole-project rehearsal built on the existing isolated fixture and production HTTP API.
// Account bootstrap is explicitly assisted; no workflow or authority checks are bypassed.
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import {Pool} from 'pg';
const local='.local-customer-rehearsal',out='audits/customer-lifecycle-rehearsal/operations';
await fs.mkdir(out,{recursive:true});
const manifest=JSON.parse(await fs.readFile(local+'/manifest.json','utf8')),f=manifest.datasets.human;
assert.match(f.schema,/^customer_rehearsal_[a-f0-9]{32}$/);assert.equal(f.port,3116);
const cfg=JSON.parse(execFileSync('docker',['inspect','swr-area-unlink-ui-f590f61c'],{encoding:'utf8'}))[0];
assert.equal(cfg.NetworkSettings.Ports['5432/tcp'][0].HostPort,'15489');
const env=Object.fromEntries(cfg.Config.Env.map(s=>{const i=s.indexOf('=');return [s.slice(0,i),s.slice(i+1)];}));assert.equal(env.POSTGRES_DB,'swr_team_isolated');
const url=new URL('postgresql://127.0.0.1:15489/swr_team_isolated');url.username=env.POSTGRES_USER||'postgres';url.password=env.POSTGRES_PASSWORD;
const pool=new Pool({connectionString:url.href}),db=await pool.connect();await db.query(`SET search_path TO "${f.schema}",public`);
const origin='http://localhost:3116',stateFile=local+'/operations.json',mode=process.argv[2],cookies=new Map();
let state,logical={shift:0,hour:7};
try{state=JSON.parse(await fs.readFile(stateFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const persist=()=>fs.writeFile(stateFile,JSON.stringify(state,null,2));
async function ledger(entry){await fs.appendFile(out+'/ledger.ndjson',JSON.stringify({at:new Date().toISOString(),logical,...entry})+'\n');}
async function parallel(items,fn,width=4){let next=0;const results=await Promise.allSettled(Array.from({length:width},async()=>{while(next<items.length){const index=next++;await fn(items[index],index);}}));const failure=results.find(r=>r.status==='rejected');if(failure)throw failure.reason;}
async function call(actor,path,body,method=body?'POST':'GET',expect=200,key=randomUUID()){
 const start=performance.now();let r,data;
 try{r=await fetch(origin+path,{method,headers:{'content-type':'application/json','idempotency-key':key,...(cookies.has(actor.id)?{cookie:cookies.get(actor.id)}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});data=await r.json();}
 catch(e){await ledger({kind:'transport-error',actor:actor.id,role:actor.role,path,message:e.message});throw e;}
 const entry={kind:'http',actor:actor.id,role:actor.role,path,method,status:r.status,ms:Math.round((performance.now()-start)*100)/100,ticketId:data.ticket?.id,resultStatus:data.ticket?.status};
 if(r.status!==expect)entry.error=data.error??data;
 await ledger(entry);if(r.status!==expect)throw Error(`${actor.name}: ${method} ${path} ${r.status}: ${JSON.stringify(data)}`);
 return {data,response:r};
}
async function login(actor){const password=actor.id===state.jordan.id?state.jordanPassword:f.password;
 const {response}=await call(actor,'/api/auth/login',{tenantId:actor.tenantId??f.tenant,email:actor.email,password},'POST',200);cookies.set(actor.id,response.headers.get('set-cookie').split(';')[0]);}
const base=()=>`/api/projects/${state.project.id}`;
const post=async(actor,path,body={},expected=200)=>(await call(actor,path,body,'POST',expected)).data;
const get=async(actor,path)=>(await call(actor,path,undefined,'GET')).data;
const date=days=>new Date(Date.now()+days*86400000).toISOString().slice(0,10);
const first=['Sam','Taylor','Morgan','Jamie','Drew','Avery','Casey','Riley','Cameron','Quinn','Reese','Dakota','Blake','Parker','Emerson','Finley','Harper','Logan','Rowan','Skyler'];
const last=['Rivera','Reed','Hayes','Park','Ellis','Quinn','Brooks','Chen','Patel','Walker','Carter','Bennett','Cole','Foster','Gray','Hughes','Kim','Lewis','Morris','Nguyen'];
function person(index,role,companyId){return {id:randomUUID(),name:first[index%first.length]+' '+last[Math.floor(index/first.length)%last.length],email:`person${String(index+1).padStart(3,'0')}@rehearsal.example.test`,role,companyId,index};}
try{
 if(mode==='setup'){
  assert.ok(!state,'Refuse to overwrite existing organization');
  const project=(await db.query("SELECT id,name,status FROM projects WHERE tenant_id=$1 AND lower(name) LIKE '%northbank%pump%station%'",[f.tenant])).rows;assert.equal(project.length,1);assert.equal(project[0].status,'SETUP');
  const jordanAccess=JSON.parse(await fs.readFile(local+'/jordan-access.json','utf8'));
  const jordan=(await db.query('SELECT id,name,email FROM users WHERE tenant_id=$1 AND email=$2',[f.tenant,jordanAccess.email])).rows[0];assert.ok(jordan);
  state={baseline:manifest.baseline,startedAt:new Date().toISOString(),project:project[0],jordan:{...jordan,role:'PROJECT_ADMIN'},jordanPassword:jordanAccess.password,people:[],areas:[],crews:[],requests:[],day:0,assistance:['Existing tenant and Jordan bootstrap retained. Internal GC/owner account provisioning uses isolated SQL because application supports subcontractor-requester invitations only. All operational role/membership grants use authenticated Jordan API. Manager hierarchy uses existing staffing/team APIs; Jordan supplies required setup-only Area coverage as existing rules dictate. No Survey Reviewer grants are fabricated: Survey Manager reviews, Superintendents coordinate covered Area work.'],period:{shifts:20,clock:'Compressed logical shifts; application timestamps use unmodified actual clock.'}};
  await persist();await login(state.jordan);
  const companies=[{id:f.company,name:'Cedar Ridge GC',type:'GC'}];
  for(const [name,type] of [['Precision Earthworks','SUBCONTRACTOR'],['Northbank Mechanical','SUBCONTRACTOR'],['Atlas Concrete','SUBCONTRACTOR'],['Municipal Water Owner','OWNER_REP']]){const result=await post(state.jordan,base()+'/companies',{name:'SYNTHETIC '+name,type,confirmed:true});companies.push(result.company);}
  await post(state.jordan,base()+'/companies',{companyId:f.company,confirmed:true});state.companies=companies;
  state.people.push(person(0,'SURVEY_MANAGER',f.company));
  for(let i=1;i<=3;i++)state.people.push(person(i,'SURVEY_SUPERINTENDENT',f.company));
  for(let i=4;i<19;i++)state.people.push(person(i,'PARTY_CHIEF',f.company));
  for(let i=19;i<64;i++)state.people.push(person(i,'INSTRUMENT_MAN',f.company));
  for(let i=0;i<100;i++){const company=companies[i<40?0:i<60?1:i<80?2:i<95?3:4];const p=person(i+64,'REQUESTER',company.id);p.companyType=company.type;p.discipline=['Civil','Structural','Utilities','Mechanical','Quality'][i%5];p.frequency=i<20?'frequent':i<65?'regular':'occasional';p.homeArea=i%3;p.attachmentPropensity=i%4===0;state.people.push(p);}
  await persist();const hash=await bcrypt.hash(f.password,12);
  for(const p of state.people){
   if(p.companyType==='SUBCONTRACTOR'){
    const invitation=await post(state.jordan,base()+'/invites',{email:p.email,companyId:p.companyId},201);
    const result=await post({id:'anonymous',name:p.name,role:'INVITEE'},'/api/auth/register',{tenantId:f.tenant,email:p.email,password:f.password,name:p.name,inviteToken:invitation.inviteToken},201);p.id=result.user.id;
   }else{
    await db.query('INSERT INTO users(id,tenant_id,company_id,name,email,password_hash) VALUES($1,$2,$3,$4,$5,$6)',[p.id,f.tenant,p.companyId,p.name,p.email,hash]);
    await ledger({kind:'assisted-account',actor:state.jordan.id,subject:p.id,role:p.role,companyId:p.companyId});
    await post(state.jordan,base()+'/members',{userId:p.id,role:p.role},201);
   }
  }
  await persist();state.manager=state.people[0];state.superintendents=state.people.slice(1,4);
  const level=(await post(state.jordan,base()+'/aor',{kind:'LEVEL',depth:0,label:'Work Front'},201)).level;
  for(let i=0;i<3;i++){const node=(await post(state.jordan,base()+'/aor',{kind:'NODE',levelId:level.id,name:['Pump Building & Structures','Intake & Utilities','Site Civil & Outfall'][i],code:['STRUCT','UTIL','CIVIL'][i]},201)).node;state.areas.push(node);
   await post(state.jordan,base()+'/aor/assignments',{kind:'USER',userId:state.superintendents[i].id,aorNodeId:node.id},201);
  }
  await persist();await login(state.manager);
  for(let i=0;i<15;i++){
   const area=state.areas[Math.floor(i/5)],chief=state.people[4+i],ims=state.people.slice(19+i*3,22+i*3),superintendent=state.superintendents[Math.floor(i/5)];
   const snapshot=await get(state.manager,base()+'/survey/staffing?mode=snapshot');
   await post(state.manager,base()+'/survey/staffing',{expectedSnapshot:snapshot.snapshotToken,partyChiefId:chief.id,areaId:area.id,superintendentId:superintendent.id,instrumentManIds:ims.map(p=>p.id),confirmRoleChanges:true});
   const team=await post(state.manager,base()+'/survey/teams',{name:`${['Structures','Utilities','Civil'][Math.floor(i/5)]} Crew ${i%5+1}`,areaId:area.id,leadUserId:chief.id,memberIds:[chief.id,...ims.map(p=>p.id)]},201);
   state.crews.push({index:i,areaId:area.id,chief,ims,superintendent,teamId:team.teamId,specialty:['control/layout','foundation checks','as-built','utility alignment','general support'][i%5]});
   await ledger({kind:'crew-established',...state.crews.at(-1)});await persist();
  }
  const activation=await post(state.jordan,base()+'/activate',{acknowledgeWarnings:true});state.project.status=activation.project.status;state.activation=activation;
  await fs.writeFile(out+'/organization.json',JSON.stringify({project:state.project,people:state.people,areas:state.areas,crews:state.crews,assistance:state.assistance,activation},null,2));await persist();
  console.log('Established 64 Survey personnel, 100 requesters, 15 four-person crews and 3 work fronts. Project activated through Jordan.');
 }else if(mode==='expand'){
  assert.ok(state.departure&&state.successor,'Replacement must be established');assert.ok(!state.expansion,'Refuse duplicate expansion');
  await login(state.successor);state.expansionStart=state.people.length;const hash=await bcrypt.hash(f.password,12),newPeople=[];
  for(let i=0;i<550;i++){
   const sub=i>=500,companies=state.companies.filter(c=>c.type==='SUBCONTRACTOR'),companyId=sub?companies[(i-500)%companies.length].id:f.company;
   const p=person(260+i,'REQUESTER',companyId);p.email=`expansion${String(i+1).padStart(3,'0')}@rehearsal.example.test`;p.companyType=sub?'SUBCONTRACTOR':'GC';p.discipline=['Civil','Structural','Utilities','Mechanical','Quality'][i%5];p.frequency=i%5===0?'frequent':i%3===0?'occasional':'regular';p.homeArea=i%3;p.expansion=true;
   if(i===499)p.name='Zoe Zimmerman';
   if(sub){const invitation=await post(state.successor,base()+'/invites',{email:p.email,companyId},201);const result=await post({id:'anonymous',name:p.name,role:'INVITEE'},'/api/auth/register',{tenantId:f.tenant,email:p.email,password:f.password,name:p.name,inviteToken:invitation.inviteToken},201);p.id=result.user.id;}
   else {await db.query('INSERT INTO users(id,tenant_id,company_id,name,email,password_hash) VALUES($1,$2,$3,$4,$5,$6)',[p.id,f.tenant,companyId,p.name,p.email,hash]);await post(state.successor,base()+'/members',{userId:p.id,role:'REQUESTER'},201);await ledger({kind:'assisted-account',subject:p.id,role:p.role,operator:state.successor.id,phase:'expansion'});}
   state.people.push(p);newPeople.push(p);await persist();if((i+1)%100===0)console.log(`Added ${i+1} expansion requesters.`);
  }
  state.expansion={addedTenantRequesters:500,addedSubcontractorRequesters:50,finishedAt:new Date().toISOString()};await persist();await fs.writeFile(out+'/expansion.json',JSON.stringify({operator:state.successor,expansion:state.expansion,people:newPeople},null,2));console.log('Expansion complete: 650 requesters, 64 Survey personnel.');
 }else if(mode==='run'||mode==='surge'||mode==='post-handover'||mode==='balanced-run'){
  assert.equal(state.crews.length,15);await parallel([state.successor??state.jordan,...state.people.filter(p=>!p.inactive)],login,4);
  // Preserve interrupted preflight specimens instead of deleting or rewriting history.
  for(const row of (await db.query('SELECT id,requester_id,aor_node_id,status FROM tickets WHERE project_id=$1 ORDER BY created_at,id',[state.project.id])).rows){
   if(!state.requests.some(t=>t.id===row.id)){state.requests.push({id:row.id,number:state.requests.length,requesterId:row.requester_id,areaId:row.aor_node_id,status:row.status,createdShift:0,readyShift:100,preflight:true});await ledger({kind:'retained-preflight',ticketId:row.id,status:row.status});}
  }
  state.runOffset??=state.requests.length;await persist();
  const balanced=mode==='balanced-run',postHandover=mode==='post-handover',surge=mode==='surge',requesters=state.people.filter(p=>p.role==='REQUESTER'),surgeRequesters=requesters.filter(p=>p.expansion),counts=balanced?[60,45,75,40,65,55,0,0,0,0,0,0]:postHandover?[40,20,0,0,0,0]:surge?[120,100,160,80,110,90,0,0,0,0]:[12,18,24,32,40,16,8,28,36,44,14,10,30,38,48,20,12,26,34,42],firstShift=balanced?38:postHandover?32:surge?22:1,lastShift=balanced?49:postHandover?37:surge?31:20;
  if(balanced){assert.ok(state.reorganization);state.period.rebalanced={firstShift,lastShift,demandShifts:6,recoveryShifts:6};}
  if(postHandover)state.period.postHandover={firstShift,lastShift,demandShifts:2,recoveryShifts:4};
  if(surge){assert.equal(surgeRequesters.length,550);state.surgeOffset??=state.requests.length;state.period.surge={firstShift,lastShift,demandShifts:6,recoveryShifts:4};await persist();}
  const cmd=async(p,t,action,body={})=>{const result=await post(p,`/api/tickets/${t.id}/${action}`,body);if(result.ticket)t.status=result.ticket.status;return result;};
  async function snapshot(day){
   const m=await get(state.manager,base()+'/metrics?view=charts');
   const sql=(await db.query("SELECT count(*) FILTER(WHERE status<>'DRAFT')::int AS total,count(*) FILTER(WHERE status='COMPLETED')::int AS completed,count(*) FILTER(WHERE status NOT IN ('DRAFT','COMPLETED','REQUESTER_CANCELED','FIELD_CANCELED','SURVEY_CANCELED','REJECTED'))::int AS open,count(*) FILTER(WHERE status='APPROVED' AND assigned_instrument_man_id IS NULL)::int AS unassigned FROM tickets WHERE project_id=$1",[state.project.id])).rows[0];
   const match=m.metrics.total===sql.total&&m.metrics.completedTotal===sql.completed&&m.metrics.openTotal===sql.open&&m.metrics.approvedWithoutInstrumentMan===sql.unassigned;
   await ledger({kind:'metrics-comparison',day,sql,metrics:m.metrics,match});assert.ok(match,'Metrics agree with SQL');
  }
  await snapshot(0);
  for(let day=Math.max(state.day+1,firstShift);day<=lastShift;day++){
   logical={shift:day,hour:6};
   const startIndex=state.requests.length;
   await parallel(Array.from({length:counts[day-firstShift]},(_,i)=>startIndex+i),async n=>{
    // First100 cover the whole population; later activity weights frequent users.
    const seq=n-state.runOffset,ri=seq<100?seq:(n%5===0?n%100:n%65===0?65+n%35:n%40),surgeSeq=n-state.surgeOffset,requester=surge?surgeRequesters[surgeSeq<550?surgeSeq:(surgeSeq*5)%550]:requesters[ri];
    const areaIndex=n%10<5?0:n%10<8?1:2,area=state.areas[areaIndex];
    const frontCrews=state.crews.filter(c=>c.areaId===area.id),ci=n%10<5?0:1+(n%4),crew=balanced?frontCrews.reduce((best,c)=>state.dispatchLoads[c.index]<state.dispatchLoads[best.index]?c:best):frontCrews[ci];if(balanced)state.dispatchLoads[crew.index]++;
    const t={number:n,requesterId:requester.id,areaId:area.id,crewIndex:crew.index,createdShift:day,readyShift:day,plannedSubmissionHour:n%17===0?22:7+n%10,type:['LAYOUT','LAYOUT','CHECK_OUT','AS_BUILT','TOPO','PERMIT'][n%6],plannedDurationHours:[2,4,8,16,32,48][n%6],status:'DRAFT',branch:n%23===0?'field-return':n%17===0?'review-return':n%13===0?'delay':n%29===0?'cancel':n%19===0?'reassign':'ordinary'};
    const body={projectId:state.project.id,aorNodeId:area.id,ticketType:t.type,fieldContact:requester.name+' — '+requester.discipline+' foreman',description:`Shift ${day}: ${t.type} at ${area.name}, grid ${n%18+1}. ${n%17===0?'Confirm limits with foreman.':'Drawing NB-'+(100+n%30)+' Rev '+(n%3)+', stakes/verification for next work package.'}`,requestedDate:date(day+(n%9===0?0:3)),craft:requester.discipline,fieldChannel:'Radio '+(areaIndex+2)};
    if(n%31===0){const bad=await call(requester,'/api/tickets',{...body,fieldContact:''},'POST',400);await ledger({kind:'intake-friction',number:n,error:bad.data.error});}
    const created=await post(requester,'/api/tickets',body,201);t.id=created.ticket.id;state.requests.push(t);
    if(n%5===0){const bytes=Buffer.from(`Synthetic survey support\nNB-${n}\n${area.name}\nRev ${n%3}\n`),form=new FormData();form.set('file',new Blob([bytes],{type:'text/plain'}),`NB-${n}-support.txt`);form.set('purpose','REQUEST_INSTRUCTION');
     const begin=performance.now(),r=await fetch(origin+`/api/tickets/${t.id}/attachments`,{method:'POST',headers:{cookie:cookies.get(requester.id),'idempotency-key':randomUUID()},body:form});const data=await r.json();await ledger({kind:'attachment-upload',actor:requester.id,ticketId:t.id,status:r.status,ms:performance.now()-begin,sha256:createHash('sha256').update(bytes).digest('hex')});assert.equal(r.status,201,JSON.stringify(data));t.attachment=data.attachment;t.attachmentHash=createHash('sha256').update(bytes).digest('hex');}
    if(n%37===0){t.parkedDraft=true;t.readyShift=100;return;}
    await cmd(requester,t,'submit',{urgentReason:n%9===0?'Concrete/utility work window changed; Survey review requested':undefined});
    t.readyShift=day+(n%4===0?1:0);
    await ledger({kind:'request-created',...t});
   },6);
   state.requests.sort((a,b)=>a.number-b.number);await persist();
   logical={shift:day,hour:10};
   for(const t of state.requests.filter(t=>t.readyShift<=day&&!t.failed)){
    const requester=state.people.find(p=>p.id===t.requesterId),crew=state.crews[t.crewIndex],im=crew.ims[t.number%3];
    try{
     if(t.status==='SUBMITTED'){
      if(t.branch==='review-return'&&!t.returned){await cmd(state.manager,t,'return',{reason:'Specify reference drawing revision and exact stake limits.'});t.returned=true;t.readyShift=day+1;continue;}
      await cmd(state.manager,t,'approve');
      if(t.number%9===0){const current=await get(state.manager,`/api/tickets/${t.id}`);if(current.ticket.priority!=='HIGH')await cmd(state.manager,t,'priority',{priority:'HIGH',reason:'Concrete pour / utility tie-in approved Survey sequence.'});}
      if(t.number%16===0)await cmd(state.manager,t,'need-by',{requestedDate:date(day+5),reason:'Coordinate inspection and concrete pour after revised work window.'});
      // Keep a real Chief queue visible before field assignment.
      await cmd(crew.superintendent,t,'assign',{assignedPartyChiefId:crew.chief.id});t.readyShift=day+1;
     }else if(t.status==='RETURNED_FOR_CORRECTION'){
      const current=await get(requester,`/api/tickets/${t.id}`);
      await call(requester,`/api/tickets/${t.id}`,{description:`Corrected NB-${t.number}: checked revision C, exact stake limits and Area readiness confirmed.`,expectedVersion:current.ticket.rowVersion},'PATCH');
      await cmd(requester,t,'submit',{});t.readyShift=day+1;
     }else if(t.status==='APPROVED'){
      await cmd(crew.chief,t,'assign',{assignedPartyChiefId:crew.chief.id,assignedInstrumentManId:im.id});await cmd(im,t,'start');t.readyShift=day+Math.max(1,Math.ceil(t.plannedDurationHours/16));
      if(t.branch==='cancel')await cmd(requester,t,'requester-cancel');
     }else if(t.status==='IN_PROGRESS'){
      if(t.branch==='field-return'&&!t.fieldReturned){await cmd(im,t,'field-inability',{reason:'Area not ready: excavation/access limits not released by construction.'});await cmd(crew.chief,t,'field-inability/validate',{reason:'Confirmed unsafe access; requester must release Area and correct details.'});t.fieldReturned=true;t.readyShift=day+1;}
      else if(t.branch==='delay'&&!t.delayed){await cmd(im,t,'delay',{reason:'Equipment / workfront conflict; maintain recorded assignment.'});t.delayed=true;t.readyShift=day+2;}
      else if(t.branch==='reassign'&&!t.reassigned){const front=state.crews.filter(c=>c.areaId===crew.areaId),next=front[(front.findIndex(c=>c.index===crew.index)+1)%front.length];await cmd(crew.superintendent,t,'assign',{assignedPartyChiefId:next.chief.id,assignedInstrumentManId:next.ims[0].id});t.crewIndex=next.index;t.reassigned=true;t.readyShift=day+1;}
      else {const current=await get(state.manager,`/api/tickets/${t.id}`),assigned=state.people.find(p=>p.id===current.ticket.assignedInstrumentManId);await cmd(assigned,t,'complete');t.completedShift=day;}
     }else if(t.status==='DELAYED'){await cmd(crew.chief,t,'restart-delay');t.readyShift=day+1;}
     await get(requester,`/api/tickets/${t.id}`);
    }catch(e){t.failed=e.message;await ledger({kind:'workflow-friction',ticketId:t.id,branch:t.branch,status:t.status,message:e.message});}
   }
   logical={shift:day,hour:16};await snapshot(day);
   await parallel([state.manager,...state.superintendents,...state.crews.filter((_,i)=>i%3===day%3).map(c=>c.chief),...requesters.filter((_,i)=>i%10===day%10)],p=>get(p,`/api/tickets?projectId=${state.project.id}&limit=50&queue=open`),4);
   state.day=day;await persist();console.log(`Shift ${day}: ${state.requests.length} requests; ${state.requests.filter(t=>t.status==='COMPLETED').length} completed; ${state.requests.filter(t=>t.failed).length} workflow interruptions.`);
  }
  await fs.writeFile(out+'/requests.json',JSON.stringify(state.requests,null,2));await persist();
 }else if(mode==='recover'){
  await parallel([state.manager,...state.people.filter(p=>p.role==='SURVEY_SUPERINTENDENT'||p.role==='INSTRUMENT_MAN')],login,4);
  logical={shift:21,hour:7};
  for(const t of state.requests.filter(t=>t.failed)){
   const previous=t.failed,current=(await get(state.manager,`/api/tickets/${t.id}`)).ticket;
   if(current.status==='APPROVED'&&previous.includes('/need-by')){
    await post(state.manager,`/api/tickets/${t.id}/need-by`,{requestedDate:date(27),reason:'Survey Manager coordinates revised inspection window after Superintendent request.'});
    const crew=state.crews[t.crewIndex];await post(crew.superintendent,`/api/tickets/${t.id}/assign`,{assignedPartyChiefId:crew.chief.id,assignedInstrumentManId:crew.ims[t.number%3].id});
    await post(crew.ims[t.number%3],`/api/tickets/${t.id}/start`);t.status='IN_PROGRESS';
   }else if(current.status==='IN_PROGRESS'&&previous.includes('/complete')){
    const assigned=state.people.find(p=>p.id===current.assignedInstrumentManId);await post(assigned,`/api/tickets/${t.id}/complete`);t.status='COMPLETED';t.completedShift=21;
   }else if(current.status==='APPROVED'&&previous.includes('priority is already HIGH')){
    // Fresh read above resolves the409; retain existing priority and continue assignment.
    const crew=state.crews[t.crewIndex];await login(crew.chief);
    await post(crew.superintendent,`/api/tickets/${t.id}/assign`,{assignedPartyChiefId:crew.chief.id});
    t.status='APPROVED';t.readyShift=22;
   }else continue;
   t.recoveredFrom=previous;delete t.failed;await ledger({kind:'operator-recovery',ticketId:t.id,original:previous,status:t.status,correction:'Use the currently authorized person; no product authorization changes.'});await persist();
  }
  console.log('Recovered blocked operator attempts through the currently authorized Manager/Instrument Man.');
 }else if(mode==='boundaries'){
  const alex={...f.actors.admin,role:'TENANT_ADMIN'},foreign={...f.actors.foreignAdmin,role:'TENANT_ADMIN'};
  await parallel([alex,foreign,state.jordan,state.manager,state.people.find(p=>p.role==='REQUESTER')],login,3);
  const second=state.secondaryProject??(await post(alex,'/api/projects',{name:'SYNTHETIC Southbank Access Road',crewBuild:'FULL'},201)).project;state.secondaryProject=second;await persist();
  const requester=state.people.find(p=>p.role==='REQUESTER');
  if(!(await db.query('SELECT id FROM project_memberships WHERE project_id=$1 AND user_id=$2',[second.id,requester.id])).rowCount)await post(alex,`/api/projects/${second.id}/members`,{userId:requester.id,role:'REQUESTER'},201);
  // Membership changes deliberately revoke sessions: renew before continuing.
  await login(requester);
  const level=(await db.query('SELECT id FROM aor_levels WHERE project_id=$1',[second.id])).rows[0]??(await post(alex,`/api/projects/${second.id}/aor`,{kind:'LEVEL',depth:0,label:'Area'},201)).level;
  const area=(await db.query('SELECT id FROM aor_nodes WHERE project_id=$1',[second.id])).rows[0]??(await post(alex,`/api/projects/${second.id}/aor`,{kind:'NODE',levelId:level.id,name:'Southbank access alignment',code:'ACCESS'},201)).node;
  const draft=(await post(requester,'/api/tickets',{projectId:second.id,aorNodeId:area.id,ticketType:'LAYOUT',fieldContact:requester.name,description:'Secondary-project access-road control check (boundary specimen)',requestedDate:date(7)},201)).ticket;
  const results=[];
  const expectDenied=async(actor,path)=>{const r=await fetch(origin+path,{headers:{cookie:cookies.get(actor.id)}});results.push({actor:actor.id,role:actor.role,path,status:r.status,denied:[403,404].includes(r.status)});};
  await expectDenied(state.jordan,`/api/projects/${second.id}/members`);await expectDenied(state.manager,`/api/tickets/${draft.id}`);await expectDenied(foreign,`/api/projects/${state.project.id}/members`);
  const mine=await get(requester,`/api/tickets?projectId=${state.project.id}&limit=200`);results.push({actor:requester.id,check:'Northbank query excludes owned Southbank draft',pass:!mine.data.some(t=>t.id===draft.id)});
  const ownSecond=await get(requester,`/api/tickets/${draft.id}`);results.push({actor:requester.id,check:'Explicit Southbank membership grants own draft read',pass:ownSecond.ticket.id===draft.id});
  const jordanProjects=await get(state.jordan,'/api/projects/administration');results.push({actor:state.jordan.id,check:'Jordan administration discovery excludes Southbank',pass:!jordanProjects.projects.some(p=>p.id===second.id)});
  await fs.writeFile(out+'/boundary-checks.json',JSON.stringify({at:new Date().toISOString(),secondaryProject:second,secondaryDraft:draft.id,results},null,2));
  assert.ok(results.every(r=>r.denied??r.pass));console.log('Six normal cross-project/tenant boundary checks passed; one secondary draft retained separately.');
 }else if(mode==='departure'){
  assert.ok(!state.departure,'Refuse to repeat completed Jordan departure');
  const alex={...f.actors.admin,role:'TENANT_ADMIN'};await login(alex);await login(state.jordan);
  const evidence={startedAt:new Date().toISOString(),subject:state.jordan,operator:alex,checks:[],assistance:'Successor GC account provisioned in isolated schema; membership and admin grant through Central IT application APIs.'};
  const successor=person(180,'PROJECT_ADMIN',f.company);successor.name='Casey Brooks';successor.email='casey.brooks@rehearsal.example.test';
  assert.equal((await db.query('SELECT id FROM users WHERE tenant_id=$1 AND email=$2',[f.tenant,successor.email])).rowCount,0);
  await db.query('INSERT INTO users(id,tenant_id,company_id,name,email,password_hash) VALUES($1,$2,$3,$4,$5,$6)',[successor.id,f.tenant,f.company,successor.name,successor.email,await bcrypt.hash(f.password,12)]);
  await post(alex,base()+'/members',{userId:successor.id,role:'REQUESTER'},201);
  await post(alex,base()+'/administrators',{userId:successor.id,enabled:true,confirmed:true});await login(successor);
  const discovery=await get(successor,'/api/projects/administration');evidence.checks.push({name:'Successor administers Northbank without project creation',pass:!discovery.canCreateProject&&discovery.projects.some(p=>p.id===state.project.id)});
  async function historyHashes(){const hashes={};for(const table of ['tickets','ticket_events','attachments','companies','aor_assignments','crew_rosters','survey_reporting_links','survey_teams','survey_team_members','project_responsibility_grants','ticket_return_cycles','ticket_assignment_history']){const rows=(await db.query(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows;hashes[table]=createHash('sha256').update(JSON.stringify(rows)).digest('hex');}return hashes;}
  const before=await historyHashes(),localPath=base()+`/members/${state.jordan.id}/offboarding`,globalPath=`/api/accounts/${state.jordan.id}/offboarding`;
  const localPreview=(await get(alex,localPath)).preview;evidence.localPreview=localPreview;assert.equal(localPreview.blockerTotal,0);
  const localBody={subjectUserId:state.jordan.id,scope:{kind:'PROJECT_ACCESS',projectId:state.project.id},reason:'Jordan resigned; Casey appointed as Northbank Project Admin by Central IT.',snapshot:localPreview.snapshot,confirmed:true},key=randomUUID();
  const localResult=(await call(alex,localPath,localBody,'POST',200,key)).data.result;
  const replay=(await call(alex,localPath,localBody,'POST',200,key)).data.result;evidence.checks.push({name:'Same confirmed local retry creates no second transition',pass:localResult.eventId===replay.eventId});
  const stale=await call(state.jordan,base()+'/members',undefined,'GET',401);evidence.checks.push({name:'Jordan old session loses administration immediately',pass:stale.response.status===401});
  const current=(await db.query('SELECT deactivated_at FROM users WHERE id=$1',[state.jordan.id])).rows[0];evidence.checks.push({name:'Project removal does not automatically disable account',pass:current.deactivated_at===null});
  const globalPreview=(await get(alex,globalPath)).preview;assert.equal(globalPreview.blockerTotal,0);evidence.globalPreview=globalPreview;
  const globalResult=(await post(alex,globalPath,{subjectUserId:state.jordan.id,scope:{kind:'TENANT_ACCOUNT'},reason:'Confirmed company departure; Central IT separately disables Jordan tenant account.',snapshot:globalPreview.snapshot,confirmed:true})).result;
  if(localResult.reviewId){const path='/api/accounts/offboarding-reviews/'+localResult.reviewId,review=await get(alex,path);await post(alex,path,{reviewId:localResult.reviewId,disposition:'TENANT_ACCOUNT_DISABLED',reason:'Central IT reviewed resignation and confirmed separate tenant account disablement.',tenantEventId:globalResult.eventId,snapshot:review.snapshot,confirmed:true});evidence.checks.push({name:'Central IT review resolves against separate tenant disable event',pass:true});}
  const rejected=await call(state.jordan,'/api/auth/login',{tenantId:f.tenant,email:state.jordan.email,password:state.jordanPassword},'POST',401);evidence.checks.push({name:'Jordan cannot renew login after tenant disable',pass:rejected.response.status===401});
  const after=await historyHashes();evidence.checks.push({name:'Requests, events, files and organizational relationships preserved exactly',pass:JSON.stringify(before)===JSON.stringify(after)});evidence.historyBefore=before;evidence.historyAfter=after;
  const canContinue=await get(successor,base()+'/members');evidence.checks.push({name:'Successor can administer populated membership after Jordan departure',pass:canContinue.total>=165});
  const protectedAlex=(await db.query("SELECT count(*)::int AS n FROM tenant_memberships WHERE tenant_id=$1 AND user_id=$2 AND role='TENANT_ADMIN'",[f.tenant,alex.id])).rows[0].n;evidence.checks.push({name:'Central IT authority retained',pass:protectedAlex===1});
  evidence.localResult=localResult;evidence.globalResult=globalResult;evidence.successor=successor;evidence.finishedAt=new Date().toISOString();
  await fs.writeFile(out+'/jordan-departure.json',JSON.stringify(evidence,null,2));assert.ok(evidence.checks.every(c=>c.pass));
  state.successor=successor;state.departure=true;await persist();console.log(JSON.stringify({departure:'completed',checks:evidence.checks.length,successor:successor.name}));
 }else if(mode==='reorganize'){
  assert.ok(state.managerDeparture,'Promoted manager must already be established');assert.ok(!state.reorganization,'Refuse repeated reorganization');await login(state.manager);
  const evidence={at:new Date().toISOString(),manager:state.manager,policy:'Keep crews intact; allocate eight Structures/four Utilities/three Civil crews for observed 50/30/20 demand. Resolve active assignments before explicit reporting/Area unlink and new staffing. Dispatch future work across all eligible crews.',moves:[],checks:[]};
  evidence.beforeWorkload=(await db.query("SELECT assigned_party_chief_id,count(*)::int requests,count(*) FILTER(WHERE status NOT IN ('DRAFT','COMPLETED','REQUESTER_CANCELED','FIELD_CANCELED','SURVEY_CANCELED','REJECTED'))::int outstanding FROM tickets WHERE project_id=$1 GROUP BY assigned_party_chief_id ORDER BY requests DESC",[state.project.id])).rows;
  const preserved=['tickets','ticket_events','attachments','crew_rosters','survey_team_members','ticket_assignment_history'];
  const hashes=async()=>{const h={};for(const table of preserved)h[table]=createHash('sha256').update(JSON.stringify((await db.query(`SELECT to_jsonb(t) row FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows)).digest('hex');return h;};
  for(const index of [9,13,14]){const crew=state.crews[index],active=(await db.query("SELECT id,status FROM tickets WHERE project_id=$1 AND assigned_party_chief_id=$2 AND status NOT IN ('DRAFT','COMPLETED','REQUESTER_CANCELED','FIELD_CANCELED','SURVEY_CANCELED','REJECTED')",[state.project.id,crew.chief.id])).rows;
   for(const ticket of active){const replacement=state.crews.find(c=>c.areaId===crew.areaId&&c.index!==crew.index&&!['9','13','14'].includes(String(c.index)));const t=(await get(state.manager,`/api/tickets/${ticket.id}`)).ticket;await login(replacement.ims[0]);await post(state.manager,`/api/tickets/${t.id}/assign`,{assignedPartyChiefId:replacement.chief.id,assignedInstrumentManId:replacement.ims[0].id});const ledgerTicket=state.requests.find(r=>r.id===t.id);ledgerTicket.crewIndex=replacement.index;}
  }
  const before=await hashes();
  for(const index of [9,13,14]){const crew=state.crews[index],originalArea=crew.areaId,originalSuperintendent=crew.superintendent.id;
   let detail=(await get(state.manager,base()+`/survey/staffing?partyChiefId=${crew.chief.id}`)).staffing;
   await call(state.manager,base()+'/survey/staffing',{action:'unlink',kind:'reporting',linkId:detail.reporting.id,partyChiefId:crew.chief.id,expectedSnapshot:detail.snapshotToken,confirmUnlink:true},'PATCH');
   detail=(await get(state.manager,base()+`/survey/staffing?partyChiefId=${crew.chief.id}`)).staffing;const assignment=detail.areas.data.find(a=>a.id===originalArea);assert.ok(assignment.individualAssignmentId);
   await call(state.manager,base()+'/survey/staffing',{action:'unlink',kind:'area',linkId:assignment.individualAssignmentId,partyChiefId:crew.chief.id,expectedSnapshot:detail.snapshotToken,confirmUnlink:true},'PATCH');
   const snapshot=await get(state.manager,base()+'/survey/staffing?mode=snapshot'),superintendent=state.superintendents.find(p=>p.coveredAreaIds.includes(state.areas[0].id));
   await post(state.manager,base()+'/survey/staffing',{expectedSnapshot:snapshot.snapshotToken,partyChiefId:crew.chief.id,areaId:state.areas[0].id,superintendentId:superintendent.id,instrumentManIds:crew.ims.map(p=>p.id),confirmRoleChanges:true});
   const team=(await get(state.manager,base()+`/survey/teams?teamId=${crew.teamId}`)).team;
   await post(state.manager,base()+'/survey/teams',{teamId:team.id,expectedVersion:team.rowVersion,name:`Structures Relief Crew ${index}`,areaId:state.areas[0].id,leadUserId:crew.chief.id,memberIds:[crew.chief.id,...crew.ims.map(p=>p.id)]});
   crew.areaId=state.areas[0].id;crew.superintendent=superintendent;evidence.moves.push({teamId:crew.teamId,chief:crew.chief,originalArea,newArea:crew.areaId,originalSuperintendent,newSuperintendent:superintendent.id,instrumentManIds:crew.ims.map(p=>p.id)});await persist();
  }
  const after=await hashes();assert.deepEqual(before,after);evidence.historyBefore=before;evidence.historyAfter=after;evidence.checks.push({name:'Reorganization retains all requests/events/files and crew membership exactly after explicit open-work resolution',pass:true});
  const counts=state.areas.map(a=>({area:a.name,crews:state.crews.filter(c=>c.areaId===a.id).length}));assert.deepEqual(counts.map(c=>c.crews),[8,4,3]);evidence.allocations=counts;evidence.checks.push({name:'Fifteen intact crews retain all fifteen Chiefs and forty-five Instrument Men',pass:true});
  const invalid=(await db.query("SELECT count(*)::int n FROM survey_reporting_links l JOIN project_memberships pm ON pm.project_id=l.project_id AND pm.user_id=l.superintendent_id WHERE l.project_id=$1 AND l.deactivated_at IS NULL AND (pm.role<>'SURVEY_SUPERINTENDENT' OR pm.access_disabled_at IS NOT NULL)",[state.project.id])).rows[0].n;assert.equal(invalid,0);evidence.checks.push({name:'Every active reporting link targets a current eligible Superintendent',pass:true});
  state.reorganization=evidence;state.rebalancedOffset=state.requests.length;state.dispatchLoads={};for(const crew of state.crews)state.dispatchLoads[crew.index]=evidence.beforeWorkload.find(r=>r.assigned_party_chief_id===crew.chief.id)?.outstanding??0;
  await persist();await fs.writeFile(out+'/team-reorganization.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify({moves:3,allocations:counts,historyPreserved:true}));
 }else if(mode==='manager-departure'){
  assert.ok(!state.managerDeparture,'Refuse duplicate completed manager departure');
  const command=JSON.parse(await fs.readFile(local+'/manager-handover-command.json','utf8')),guardrails=JSON.parse(await fs.readFile(out+'/manager-handover-guardrails.json','utf8'));
  const actor=state.successor,former=state.manager,incoming=state.people.find(p=>p.id===command.body.incomingUserId),coverage=state.people.find(p=>p.id===command.body.coverageUserId),alex={...f.actors.admin,role:'TENANT_ADMIN'},path=base()+'/survey/manager-handover';
  await login(actor);await login(alex);await login(former);const evidence={at:new Date().toISOString(),former:{...former},incoming:{...incoming,role:'SURVEY_MANAGER'},coverage,checks:[]};
  const hashes={};for(const table of Object.keys(guardrails.requestHistoryHashes))hashes[table]=createHash('sha256').update(JSON.stringify((await db.query(`SELECT to_jsonb(t) row FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows)).digest('hex');
  assert.deepEqual(hashes,guardrails.requestHistoryHashes);evidence.checks.push({name:'Promotion preserves tickets, events, attachments, rosters, teams and assignment history exactly',pass:true});evidence.historyBefore=guardrails.requestHistoryHashes;evidence.historyAfter=hashes;
  const replay=await Promise.all([call(actor,path,command.body,'POST',200,command.key),call(actor,path,command.body,'POST',200,command.key)]);assert.ok(replay.every(r=>r.data.result.eventId===command.result.eventId));evidence.checks.push({name:'Concurrent identical retries retain one appointment event',pass:true});
  await call(actor,path,command.body,'POST',409);evidence.checks.push({name:'A distinct command with the old preview cannot repeat promotion',pass:true});
  await post(alex,base()+'/administrators',{userId:actor.id,enabled:false,confirmed:true});await login(actor);await call(actor,path,command.body,'POST',403,command.key);evidence.checks.push({name:'Historical success cannot be replayed after actor loses Project Admin authority',pass:true});
  await post(alex,base()+'/administrators',{userId:actor.id,enabled:true,confirmed:true});await login(actor);const renewed=await call(actor,path,command.body,'POST',200,command.key);assert.equal(renewed.data.result.eventId,command.result.eventId);
  const localPath=base()+`/members/${former.id}/offboarding`,localPreview=(await get(actor,localPath)).preview;assert.equal(localPreview.blockerTotal,0);evidence.checks.push({name:'Actual replacement resolves last-manager continuity blocker',pass:true});
  const localResult=(await post(actor,localPath,{subjectUserId:former.id,scope:{kind:'PROJECT_ACCESS',projectId:state.project.id},reason:'Survey Manager employment ended; Taylor was promoted with explicit Structures coverage transfer to Morgan.',snapshot:localPreview.snapshot,confirmed:true})).result;
  await call(former,base()+'/metrics?view=charts',undefined,'GET',401);evidence.checks.push({name:'Fired manager prior session rejected immediately after project disable',pass:true});
  const globalPath=`/api/accounts/${former.id}/offboarding`,globalPreview=(await get(alex,globalPath)).preview;assert.equal(globalPreview.blockerTotal,0);
  const globalResult=(await post(alex,globalPath,{subjectUserId:former.id,scope:{kind:'TENANT_ACCOUNT'},reason:'Central IT separately confirms tenant account disablement after employment termination.',snapshot:globalPreview.snapshot,confirmed:true})).result;
  if(localResult.reviewId){const rp='/api/accounts/offboarding-reviews/'+localResult.reviewId,review=await get(alex,rp);await post(alex,rp,{reviewId:localResult.reviewId,disposition:'TENANT_ACCOUNT_DISABLED',reason:'Confirmed separate tenant account disablement after firing and manager succession.',tenantEventId:globalResult.eventId,snapshot:review.snapshot,confirmed:true});}
  await call(former,'/api/auth/login',{tenantId:f.tenant,email:former.email,password:f.password},'POST',401);evidence.checks.push({name:'Fired manager cannot renew tenant login',pass:true});
  former.inactive=true;state.people.find(p=>p.id===former.id).inactive=true;incoming.role='SURVEY_MANAGER';state.manager=incoming;state.superintendents=state.people.filter(p=>p.role==='SURVEY_SUPERINTENDENT'&&!p.inactive);coverage.coveredAreaIds=[state.areas[0].id,state.areas[1].id];state.superintendents.find(p=>p.id!==coverage.id).coveredAreaIds=[state.areas[2].id];
  for(const crew of state.crews)if(crew.superintendent.id===incoming.id)crew.superintendent=coverage;
  await login(incoming);await login(coverage);await get(incoming,base()+'/metrics?view=charts');evidence.checks.push({name:'Promoted manager can read project-wide operational metrics',pass:true});
  const currentLinks=(await db.query('SELECT superintendent_id,party_chief_id FROM survey_reporting_links WHERE tenant_id=$1 AND project_id=$2 AND deactivated_at IS NULL',[f.tenant,state.project.id])).rows;assert.equal(currentLinks.length,15);assert.equal(currentLinks.filter(l=>l.superintendent_id===incoming.id).length,0);assert.equal(currentLinks.filter(l=>l.superintendent_id===coverage.id).length,10);evidence.checks.push({name:'Fifteen crew reporting links remain valid; coverage Superintendent now supervises ten crews',pass:true});
  evidence.localResult=localResult;evidence.globalResult=globalResult;evidence.appointment=command.result;state.managerDeparture=evidence;state.period.managerChangeShift=32;await persist();await fs.writeFile(out+'/survey-manager-departure.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify({checks:evidence.checks.length,manager:incoming.name,coverage:coverage.name,activeSurvey:63}));
 }else if(mode==='manager-handover-guardrails'){
  const actor=state.successor,candidate=state.superintendents[0],coverage=state.superintendents[1];await login(actor);
  const selection={outgoingUserId:state.manager.id,incomingUserId:candidate.id,coverageUserId:coverage.id},path=base()+'/survey/manager-handover',query=new URLSearchParams(selection);
  const checks=[],preview=(await get(actor,path+'?'+query)).preview;assert.equal(preview.blockers.length,0);
  const body={...selection,snapshot:preview.snapshot,reason:'Project leadership approved Taylor promotion after Sam was fired; Morgan takes Structures coverage.',confirmed:true};
  await call(actor,path,{...body,confirmed:false},'POST',400);checks.push({name:'Explicit confirmation required',pass:true});
  const requester=state.people.find(p=>p.role==='REQUESTER');await login(requester);await call(requester,path+'?'+query,undefined,'GET',403);checks.push({name:'Requester cannot inspect or appoint manager',pass:true});
  const foreign={...f.actors.foreignAdmin,role:'TENANT_ADMIN'};await login(foreign);await call(foreign,path+'?'+query,undefined,'GET',404);checks.push({name:'Foreign tenant cannot inspect manager handover',pass:true});
  await call(actor,path,{...body,snapshot:'0'.repeat(64)},'POST',409);checks.push({name:'Stale preview refuses without writes',pass:true});
  const hashes=async()=>{const h={};for(const table of ['project_memberships','users','aor_assignments','survey_reporting_links','administrative_events','api_idempotency'])h[table]=createHash('sha256').update(JSON.stringify((await db.query(`SELECT to_jsonb(t) row FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows)).digest('hex');return h;};
  await db.query(`CREATE FUNCTION reject_rehearsal_manager_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='project.role_changed' THEN RAISE EXCEPTION 'synthetic manager audit failure'; END IF; RETURN NEW; END $$`);
  await db.query('CREATE TRIGGER reject_rehearsal_manager_audit BEFORE INSERT ON administrative_events FOR EACH ROW EXECUTE FUNCTION reject_rehearsal_manager_audit()');
  try{const before=await hashes();await call(actor,path,body,'POST',500);const after=await hashes();assert.deepEqual(after,before);checks.push({name:'Audit failure rolls back role, coverage, sessions, evidence and ledger',pass:true});
   const held=await pool.connect();let completed=false,pending;
   try{await held.query('BEGIN');await held.query('SELECT id FROM '+`"${f.schema}".tenants`+' WHERE id=$1 FOR SHARE',[f.tenant]);pending=call(actor,path,body,'POST',500).then(r=>{completed=true;return r;});
    await new Promise(r=>setTimeout(r,200));assert.equal(completed,false);const waits=(await db.query("SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT id FROM tenants%'")).rows[0].n;assert.ok(waits>=1);await held.query('COMMIT');await pending;checks.push({name:'Appointment waits behind active lifecycle writer barrier',pass:true});
   }finally{await held.query('ROLLBACK');held.release();if(pending)await pending;}
  }finally{await db.query('DROP TRIGGER reject_rehearsal_manager_audit ON administrative_events');await db.query('DROP FUNCTION reject_rehearsal_manager_audit()');}
  const requestHistoryHashes={};for(const table of ['tickets','ticket_events','attachments','crew_rosters','survey_teams','survey_team_members','ticket_assignment_history'])requestHistoryHashes[table]=createHash('sha256').update(JSON.stringify((await db.query(`SELECT to_jsonb(t) row FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows)).digest('hex');await fs.writeFile(out+'/manager-handover-guardrails.json',JSON.stringify({at:new Date().toISOString(),checks,preview,requestHistoryHashes},null,2));await fs.writeFile(local+'/manager-handover-intent.json',JSON.stringify({body,selection,path}));console.log(JSON.stringify({guardrails:checks.length,pass:checks.every(c=>c.pass)}));
 }else if(mode==='manager-departure-preview'){
  assert.ok(!state.managerDeparture,'Refuse duplicate manager departure');
  const actor=state.successor??state.jordan,candidate=state.superintendents[0];await login(actor);
  const evidence={at:new Date().toISOString(),operator:actor,subject:state.manager,candidate,checks:[],mapping:'Project Manager acts using the existing Project Admin capability; no new operational role invented.'};
  const preview=(await get(actor,base()+`/members/${state.manager.id}/offboarding`)).preview;evidence.offboardingPreview=preview;
  const existing=(await call(actor,base()+'/members',{userId:candidate.id,role:'SURVEY_MANAGER'},'POST',409)).data;
  evidence.checks.push({name:'Existing membership cannot silently change role',status:409,response:existing});
  const membership=(await db.query('SELECT pm.role,u.session_version AS role_version FROM project_memberships pm JOIN users u ON u.id=pm.user_id WHERE pm.project_id=$1 AND pm.user_id=$2',[state.project.id,candidate.id])).rows[0];
  const roleChange=(await call(actor,base()+'/survey/teams',{action:'set-role',userId:candidate.id,role:'SURVEY_MANAGER',expectedRole:membership.role,expectedRoleVersion:Number(membership.role_version),confirmRoleChanges:true},'PATCH',400)).data;
  evidence.checks.push({name:'Guarded Survey role API does not support promotion to manager',status:400,response:roleChange});
  const retained=(await db.query('SELECT user_id,role,access_disabled_at FROM project_memberships WHERE project_id=$1 AND user_id=ANY($2::uuid[]) ORDER BY user_id',[state.project.id,[state.manager.id,candidate.id]])).rows;
  evidence.retainedMemberships=retained;evidence.outcome='BLOCKED: promotion requires a guarded Survey Manager handover capability. No authority was changed and no personnel were removed.';
  await fs.writeFile(out+'/survey-manager-departure-preview.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify({outcome:'blocked',blockerTotal:preview.blockerTotal,checks:evidence.checks}));
 }else if(mode==='balance-results'){
  assert.ok(state.reorganization);const ids=state.requests.slice(state.rebalancedOffset).map(t=>t.id),rows=(await db.query('SELECT id,status,assigned_party_chief_id,aor_node_id FROM tickets WHERE project_id=$1 AND id=ANY($2::uuid[])',[state.project.id,ids])).rows;
  const before=state.crews.map(c=>state.reorganization.beforeWorkload.find(r=>r.assigned_party_chief_id===c.chief.id)?.requests??0);
  const crews=state.crews.map(c=>({index:c.index,chief:c.chief.name,areaId:c.areaId,requests:rows.filter(r=>r.assigned_party_chief_id===c.chief.id).length,completed:rows.filter(r=>r.assigned_party_chief_id===c.chief.id&&r.status==='COMPLETED').length,plannedHours:state.requests.slice(state.rebalancedOffset).filter(r=>r.crewIndex===c.index).reduce((n,t)=>n+t.plannedDurationHours,0)}));
  const cv=values=>{const mean=values.reduce((a,b)=>a+b,0)/values.length;return Math.sqrt(values.reduce((n,v)=>n+(v-mean)**2,0)/values.length)/mean;};
  const evidence={at:new Date().toISOString(),cohort:rows.length,crewCount:15,beforeHistoricalCounts:before,crews,beforeMaxShare:Math.max(...before)/before.reduce((a,b)=>a+b,0),afterMaxShare:Math.max(...crews.map(c=>c.requests))/crews.reduce((n,c)=>n+c.requests,0),beforeCountCv:cv(before),afterCountCv:cv(crews.map(c=>c.requests)),afterPlannedHoursCv:cv(crews.map(c=>c.plannedHours)),unassigned:rows.filter(r=>!r.assigned_party_chief_id).length,plannedHoursCaveat:'Synthetic dispatcher estimates; not an application effort field, measured field time or production productivity. Historical baseline differs in period/volume from new cohort.'};
  assert.ok(crews.every(c=>c.requests>0));assert.ok(evidence.afterMaxShare<evidence.beforeMaxShare);await fs.writeFile(out+'/balance-results.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify({cohort:evidence.cohort,beforeMaxShare:evidence.beforeMaxShare,afterMaxShare:evidence.afterMaxShare,beforeCountCv:evidence.beforeCountCv,afterCountCv:evidence.afterCountCv}));
 }else if(mode==='activity'){
  await login(state.manager);const activity=(await get(state.manager,base()+'/metrics?view=activity')).activity;
  const expected=new Map(activity.days.map(d=>[d.date,{date:d.date,submitted:0,recordedCompletions:0}]));
  const tickets=(await db.query('SELECT status,first_submitted_at,submitted_at,completed_at FROM tickets WHERE tenant_id=$1 AND project_id=$2',[f.tenant,state.project.id])).rows;
  for(const t of tickets.filter(t=>t.status!=='DRAFT')){const submitted=t.first_submitted_at??t.submitted_at;if(submitted){const day=new Date(submitted).toISOString().slice(0,10);if(expected.has(day))expected.get(day).submitted++;}if(t.status==='COMPLETED'&&t.completed_at){const day=new Date(t.completed_at).toISOString().slice(0,10);if(expected.has(day))expected.get(day).recordedCompletions++;}}
  const match=JSON.stringify([...expected.values()])===JSON.stringify(activity.days);assert.ok(match);assert.equal(activity.excludedSyntheticCompletions,0);
  await fs.writeFile(out+'/activity-kpi.json',JSON.stringify({at:new Date().toISOString(),actor:state.manager.id,activity,expectedDays:[...expected.values()],match},null,2));console.log(JSON.stringify({activityMatch:match,submitted:activity.days.reduce((n,d)=>n+d.submitted,0),completed:activity.days.reduce((n,d)=>n+d.recordedCompletions,0)}));
 }else if(mode==='observe'){
  await parallel([state.successor??state.jordan,...state.people.filter(p=>!p.inactive)],login,4);
  const tickets=(await db.query('SELECT * FROM tickets WHERE project_id=$1 ORDER BY created_at,id',[state.project.id])).rows;
  const checks=[];
  const check=(name,actual,expected)=>{const pass=JSON.stringify(actual)===JSON.stringify(expected);checks.push({name,actual,expected,pass});};
  async function ids(actor){const result=[];for(let offset=0;;offset+=200){const page=await get(actor,`/api/tickets?projectId=${state.project.id}&limit=200&offset=${offset}`);result.push(...page.data.map(t=>t.id));if(page.data.length<200)break;}return result.sort();}
  for(const p of state.people.filter(p=>!p.inactive)){let expected;
   if(p.role==='REQUESTER')expected=tickets.filter(t=>t.requester_id===p.id);
   else if(p.role==='SURVEY_MANAGER')expected=tickets.filter(t=>t.status!=='DRAFT');
   else if(p.role==='SURVEY_SUPERINTENDENT'){const i=state.superintendents.findIndex(s=>s.id===p.id),areas=p.coveredAreaIds??[state.areas[i].id];expected=tickets.filter(t=>areas.includes(t.aor_node_id)&&t.status!=='DRAFT');}
   else if(p.role==='PARTY_CHIEF')expected=tickets.filter(t=>t.assigned_party_chief_id===p.id&&t.status!=='DRAFT');
   else {const crew=state.crews.find(c=>c.ims.some(im=>im.id===p.id));expected=tickets.filter(t=>(t.assigned_instrument_man_id===p.id||t.assigned_party_chief_id===crew.chief.id)&&t.status!=='DRAFT');}
   check('Visible records for '+p.name+' '+p.role,await ids(p),expected.map(t=>t.id).sort());
  }
  const attachmentChecks=[];
  for(const t of state.requests.filter(t=>t.attachment).filter((_,i)=>i%4===0)){
   const requester=state.people.find(p=>p.id===t.requesterId),r=await fetch(origin+t.attachment.downloadUrl,{headers:{cookie:cookies.get(requester.id)}});
   const digest=createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex');attachmentChecks.push({ticketId:t.id,status:r.status,match:digest===t.attachmentHash});
   const other=state.people.find(p=>p.role==='REQUESTER'&&p.id!==requester.id&&p.companyId!==requester.companyId),denied=await fetch(origin+t.attachment.downloadUrl,{headers:{cookie:cookies.get(other.id)}});attachmentChecks.push({ticketId:t.id,actor:other.id,status:denied.status,denied:[403,404].includes(denied.status)});
  }
  const integrity={};
  for(const [name,sql] of Object.entries({missingEvents:'SELECT count(*)::int AS n FROM tickets t WHERE t.project_id=$1 AND NOT EXISTS(SELECT 1 FROM ticket_events e WHERE e.ticket_id=t.id)',duplicateNumbers:'SELECT count(*)::int AS n FROM (SELECT ticket_number FROM tickets WHERE project_id=$1 AND ticket_number IS NOT NULL GROUP BY ticket_number HAVING count(*)>1) x',badDates:'SELECT count(*)::int AS n FROM tickets WHERE project_id=$1 AND completed_at<first_submitted_at',invalidAssignees:"SELECT count(*)::int AS n FROM tickets t WHERE t.project_id=$1 AND assigned_instrument_man_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM project_memberships pm WHERE pm.project_id=t.project_id AND pm.user_id=t.assigned_instrument_man_id AND pm.role='INSTRUMENT_MAN')",wrongCompany:'SELECT count(*)::int AS n FROM tickets t JOIN users u ON u.id=t.requester_id WHERE t.project_id=$1 AND (u.tenant_id<>t.tenant_id OR u.company_id<>t.company_id)',multipleCurrentAssignment:'SELECT count(*)::int AS n FROM (SELECT ticket_id FROM ticket_assignment_history h JOIN tickets t ON t.id=h.ticket_id WHERE t.project_id=$1 AND h.ended_at IS NULL GROUP BY ticket_id HAVING count(*)>1) x'}))integrity[name]=(await db.query(sql,[state.project.id])).rows[0].n;
  const statusCounts=(await db.query('SELECT status,count(*)::int AS count FROM tickets WHERE project_id=$1 GROUP BY status ORDER BY status',[state.project.id])).rows;
  const events=(await db.query('SELECT e.event_type,count(*)::int AS count FROM ticket_events e JOIN tickets t ON t.id=e.ticket_id WHERE t.project_id=$1 GROUP BY e.event_type ORDER BY e.event_type',[state.project.id])).rows;
  const workload=(await db.query('SELECT assigned_party_chief_id AS chief_id,count(*)::int AS requests,count(*) FILTER(WHERE status NOT IN (\'COMPLETED\',\'REQUESTER_CANCELED\',\'FIELD_CANCELED\',\'SURVEY_CANCELED\',\'REJECTED\',\'DRAFT\'))::int AS outstanding FROM tickets WHERE project_id=$1 GROUP BY assigned_party_chief_id ORDER BY requests DESC',[state.project.id])).rows;
  const distributions={};
  for(const [name,column] of [['type','ticket_type'],['area','aor_node_id'],['priority','priority'],['company','company_id'],['requester','requester_id']])distributions[name]=(await db.query(`SELECT ${column} AS key,count(*)::int AS count FROM tickets WHERE project_id=$1 GROUP BY ${column} ORDER BY count(*) DESC`,[state.project.id])).rows;
  integrity.duplicateCompletionEvents=(await db.query("SELECT count(*)::int AS n FROM (SELECT e.ticket_id FROM ticket_events e JOIN tickets t ON t.id=e.ticket_id WHERE t.project_id=$1 AND e.event_type='ticket.completed' GROUP BY e.ticket_id HAVING count(*)>1) x",[state.project.id])).rows[0].n;
  integrity.completedWithoutCompletionEvent=(await db.query("SELECT count(*)::int AS n FROM tickets t WHERE project_id=$1 AND status='COMPLETED' AND NOT EXISTS(SELECT 1 FROM ticket_events e WHERE e.ticket_id=t.id AND e.event_type='ticket.completed')",[state.project.id])).rows[0].n;
  const metricChecks=[];
  for(const p of [state.manager,...state.superintendents]){
   const i=state.superintendents.findIndex(s=>s.id===p.id),areas=i<0?null:(p.coveredAreaIds??[state.areas[i].id]);
   const m=(await get(p,base()+'/metrics?view=charts')).metrics;
   const population=tickets.filter(t=>t.status!=='DRAFT'&&(!areas||areas.includes(t.aor_node_id))),completed=population.filter(t=>t.status==='COMPLETED'),terminal=['COMPLETED','REQUESTER_CANCELED','FIELD_CANCELED','SURVEY_CANCELED','REJECTED'];
   const expected={total:population.length,completed:completed.length,open:population.filter(t=>!terminal.includes(t.status)).length},actual={total:m.total,completed:m.completedTotal,open:m.openTotal};
   const averages=completed.map(t=>(new Date(t.completed_at)-new Date(t.first_submitted_at))/3600000),expectedAverage=averages.length?averages.reduce((a,b)=>a+b,0)/averages.length:null;
   metricChecks.push({actor:p.id,role:p.role,expected,actual,countsMatch:JSON.stringify(expected)===JSON.stringify(actual),expectedAverage,actualAverage:m.averageSubmissionToCompletionHours,cycleAverageMatch:expectedAverage===null?m.averageSubmissionToCompletionHours===null:Math.abs(expectedAverage-m.averageSubmissionToCompletionHours)<0.000001});
  }
  const summary={baseline:state.baseline,startedAt:state.startedAt,finishedAt:new Date().toISOString(),period:state.period,users:state.people.length,survey:state.people.filter(p=>p.role!=='REQUESTER').length,requesters:state.people.filter(p=>p.role==='REQUESTER').length,crews:15,requests:tickets.length,statusCounts,events,integrity,visibility:{checked:checks.length,failed:checks.filter(c=>!c.pass).length},attachmentChecks,metricChecks,distributions,workflowInterruptions:state.requests.filter(t=>t.failed).map(t=>({id:t.id,status:t.status,branch:t.branch,error:t.failed})),workload};
  await fs.writeFile(out+'/visibility.json',JSON.stringify(checks,null,2));await fs.writeFile(out+'/summary.json',JSON.stringify(summary,null,2));
  console.log(JSON.stringify({requests:summary.requests,statusCounts,visibility:summary.visibility,integrity,attachments:attachmentChecks.length}));
 }else throw Error('Use setup, run, or observe');
}finally{if(state)await persist();db.release();await pool.end();}
