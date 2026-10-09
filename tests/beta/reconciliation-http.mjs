import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {Pool} from 'pg';
assert.equal(process.env.SWR_RECONCILIATION,'1');
const f=JSON.parse(await readFile('.local-reconciliation-fixture.json','utf8'));
assert.match(f.schema,/^reconcile_http_[a-f0-9]{32}$/);assert.equal(f.origin,'http://127.0.0.1:3320');
const url=new URL(process.env.DATABASE_URL??'');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15489');assert.equal(url.pathname,'/swr_team_isolated');url.searchParams.set('options','-c search_path='+f.schema+',public');
const db=new Pool({connectionString:url.href,max:4}),checks=[],base='/api/projects/'+f.project;
const check=(value,label)=>{assert(value,label);checks.push(label);};
async function request(who,endpoint,body,method=body?'POST':'GET',key=randomUUID()){
 const r=await fetch(f.origin+endpoint,{method,headers:{...(who?{cookie:'swr_session='+f.tokens[who]}:{}),'content-type':'application/json','Idempotency-Key':key},...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
 const text=await r.text();return {status:r.status,body:text?JSON.parse(text):null,reference:r.headers.get('x-request-id')};
}
async function observed(reference){const deadline=Date.now()+5000;while(Date.now()<deadline){const row=(await db.query('SELECT * FROM project_request_observations WHERE tenant_id=$1 AND correlation_id=$2',[f.tenant,reference])).rows[0];if(row)return row;await new Promise(r=>setTimeout(r,25));}throw Error('Observation not recorded within deadline');}
try{
 check((await db.query('SELECT current_schema() s')).rows[0].s===f.schema,'Explicit new owned schema');
 const inventory=JSON.parse(await readFile('audits/alpha1-reconciliation/route-inventory.json','utf8'));
 for(const entry of inventory.methods){if(entry.route.startsWith('/api/auth/')||entry.route==='/api/health'||entry.route==='/api/health/live'||entry.route==='/api/health/ready')continue;
 const endpoint=entry.route.replaceAll('[projectId]',f.project).replaceAll('[ticketId]',f.partial).replace(/\[[^\]]+\]/g,randomUUID());
 const r=await request(null,endpoint,['GET','HEAD'].includes(entry.method)?undefined:{},entry.method);
 check([400,401,403,404,405].includes(r.status)||(r.status===409&&r.body?.error?.message?.includes('retired')),entry.method+' '+entry.route+' refuses unauthenticated request without server error; got '+r.status);
 }
 for(const who of ['tenantOnly','projectOnly','manager','superintendent','chief','instrument','requester','viewer','customRequester','customViewer']){
 const admin=['tenantOnly','projectOnly'].includes(who);check((await request(who,base+'/diagnostics')).status===(admin?200:403),who+' diagnostics authority');
 const role=await request(who,'/api/roles',{name:'Owned '+randomUUID(),baseRole:'VIEWER',confirmed:true});check(role.status===(who==='tenantOnly'?201:403),who+' custom-role catalog authority');
 const support=await request(who,base+'/help-desk',{subject:'Owned '+who,description:'New synthetic reconciliation assistance.',confirmed:true});check(support.status===201,who+' creates own support');
 const id=support.body.ticket.id;check((await request(who,base+'/help-desk/'+id,{version:1,message:'New synthetic follow-up.',confirmed:true},'PATCH')).status===200,who+' replies to own support');
 if(!admin)check((await request(who,base+'/help-desk/'+id,{version:2,message:'Refused status change.',status:'RESOLVED',confirmed:true},'PATCH')).status===403,who+' cannot manage support status');
 }
 check((await request('foreignManager',base+'/diagnostics')).status===404,'Foreign project diagnostic non-disclosure');
 const prior=await request('requester','/api/tickets/'+f.partial+'/approve',{});check(prior.status===403,'Requester cannot approve own draft');const record=await observed(prior.reference);
 const diagnostic=await request('projectOnly',base+'/diagnostics');
 check(diagnostic.body.errors.some(e=>e.correlationId===prior.reference&&e.ticketId===f.partial&&e.priorStatus==='DRAFT'&&e.actorName==='Acceptance requester'),'Independent administrator sees approved scoped UUID/state/actor metadata');
 check(!JSON.stringify(diagnostic.body).includes(f.password),'Diagnostics excludes synthetic credential bodies');
 const before=(await db.query('SELECT status FROM tickets WHERE id=$1',[f.partial])).rows[0].status;check(before===record.prior_status,'Denied workflow preserves original state');
 const reply={version:2,message:'Concurrent administrative follow-up.',status:'ESCALATED',confirmed:true};
 const mine=(await request('requester',base+'/help-desk')).body.tickets[0],key=randomUUID();
 const pair=await Promise.all([request('projectOnly',base+'/help-desk/'+mine.id,reply,'PATCH',key),request('projectOnly',base+'/help-desk/'+mine.id,reply,'PATCH',key)]);check(pair.every(r=>r.status===200),'Concurrent same-key support decision returns one outcome');
 check((await db.query('SELECT count(*)::int n FROM project_support_messages WHERE ticket_id=$1',[mine.id])).rows[0].n===2,'Exact support retry appends once');
 check((await request('projectOnly',base+'/help-desk/'+mine.id,{...reply,message:'Changed body'},'PATCH',key)).status===409,'Changed body refuses same idempotency key');
 check((await request('viewer',base+'/help-desk/'+mine.id)).status===404,'Different member cannot read another support conversation');
 const later=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
 const created=await request('requester','/api/tickets',{projectId:f.project,aorNodeId:f.area,departmentId:f.department,ticketType:'LAYOUT',fieldContact:'Synthetic contact',description:'Owned connected reconciliation request',requestedDate:later});check(created.status===201,'Requester creates new draft');
 const id=created.body.ticket.id;const submitted=await request('requester','/api/tickets/'+id+'/submit',{});check(submitted.status===200,'Requester submits same record');
 const number=submitted.body.ticket.ticketNumber;check(Boolean(number),'First submission assigns human number');
 check((await request('viewer','/api/tickets/'+id+'/approve',{})).status===403,'Viewer approval refused');
 check((await request('manager','/api/tickets/'+id+'/approve',{})).status===200,'Manager approves connected request');
 check((await request('manager','/api/tickets/'+id+'/assign',{assignedPartyChiefId:f.people.chief,assignedInstrumentManId:f.people.instrument})).status===200,'Manager explicitly assigns Chief and Instrument Man');
 check((await request('instrument','/api/tickets/'+id+'/start',{})).status===200,'Assigned Instrument Man starts work');
 check((await request('instrument','/api/tickets/'+id+'/complete',{})).status===200,'Assigned Instrument Man completes work');
 const final=(await db.query('SELECT id,ticket_number,status FROM tickets WHERE id=$1',[id])).rows[0];check(final.id===id&&final.ticket_number===number&&final.status==='COMPLETED','Connected cycle retains identity and number');
 check((await db.query('SELECT count(*)::int n FROM ticket_events WHERE ticket_id=$1',[id])).rows[0].n>=6,'Connected transitions retain atomic history');
 // Current grant revocation denies read; actor is deliberately left revoked.
 await db.query('UPDATE project_admin_grants SET revoked_at=now(),revoked_by=$3 WHERE tenant_id=$1 AND user_id=$2',[f.tenant,f.people.projectOnly,f.people.admin]);
 check((await request('projectOnly',base+'/diagnostics')).status===403,'Revoked independent administrator cannot read diagnostics');
 await writeFile('audits/alpha1-reconciliation/http-acceptance.json',JSON.stringify({checks,limits:['Default route probes establish unauthenticated refusal, not full authorization for every branch. Role, lifecycle and fault cases also use the full PostgreSQL suites.'],fixtureKind:'fresh owned synthetic',observationRead:'bounded correlation wait'},null,2)+'\n');
 console.log('HTTP reconciliation acceptance: '+checks.length+' checks');
}finally{await db.end();}
