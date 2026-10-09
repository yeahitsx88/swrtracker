// Creates ordinary requests only through current authenticated production HTTP.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
assert.equal(process.env.SWR_CONNECTED_TEST,'209');
const settings=Object.fromEntries((await fs.readFile('.local/alpha-closure209/host-runtime.env','utf8')).split(/\r?\n/).filter(x=>x.includes('=')).map(x=>{const i=x.indexOf('=');return[x.slice(0,i),x.slice(i+1)];})),url=new URL(settings.DATABASE_URL),f=JSON.parse(await fs.readFile('.local/alpha-closure209/fixture.json','utf8'));
const own=JSON.parse(await fs.readFile('.local/alpha-acceptance197/ownership.json','utf8'));assert.equal(own.owner,'Alpha acceptance197');assert.equal(own.hostPort,15500);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15500');assert.equal(url.pathname,'/swr_team_isolated');assert.match(f.schema,/^alpha_connected209_[a-f0-9]{32}$/);assert.equal(url.searchParams.get('options'),'-c search_path='+f.schema+',public');assert.equal(f.origin,'http://127.0.0.1:3225');
const pool=new Pool({connectionString:url.href}),checks=[];
function check(v,label){assert(v,label);checks.push(label);}
async function call(actor,path,data={},status=200){const r=await fetch(f.origin+path,{method:'POST',headers:{cookie:'swr_session='+f.tokens[actor],'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:JSON.stringify(data)});const value=await r.json();assert.equal(r.status,status,JSON.stringify(value));return value;}
async function read(id){return(await pool.query('SELECT * FROM tickets WHERE tenant_id=$1 AND id=$2',[f.tenant,id])).rows[0];}
try{
 const team=(await call('manager','/api/projects/'+f.project+'/survey/teams',{teamId:null,expectedVersion:null,name:'Connected Chief Team',areaId:f.area,areaIds:[f.area],leadUserId:f.people.chief,memberIds:[f.people.chief,f.people.instrument]},201)).teamId;
 for(const key of ['work','delay','inability','reject','stop','leadership','fault']){
  const draft=await call('requester','/api/projects/'+f.project+'/drafts',{aorNodeId:f.area,ticketType:'LAYOUT',craft:'Survey',fieldContact:'Owned contact',description:'Connected '+key+' journey',requestedDate:new Date(Date.now()+7*86400000).toISOString().slice(0,10)},201),id=f.tickets[key]=draft.ticket.id;check(!(await read(id)).ticket_number,key+' draft has no number');
  await call('requester','/api/tickets/'+id+'/submit',{expectedVersion:(await read(id)).row_version});f.refs[key]=(await read(id)).ticket_number;check((await read(id)).status==='SUBMITTED'&&!!f.refs[key],key+' first submission numbers actual draft');
  if(key==='leadership')continue;
  await call('manager','/api/tickets/'+id+'/approve');check((await read(id)).status==='APPROVED',key+' approved without field assignment');
  await call('manager','/api/tickets/'+id+'/delegate',{teamId:team});check((await read(id)).status==='APPROVED'&&!(await read(id)).assigned_instrument_man_id&&!!(await pool.query('SELECT id FROM survey_work_delegations WHERE tenant_id=$1 AND ticket_id=$2 AND ended_at IS NULL',[f.tenant,id])).rows[0],key+' delegated awaiting crew');
  await call('chief','/api/tickets/'+id+'/assign',{assignedPartyChiefId:f.people.chief,assignedInstrumentManId:f.people.instrument});check((await read(id)).status==='ASSIGNED'&&!(await pool.query('SELECT id FROM survey_work_delegations WHERE tenant_id=$1 AND ticket_id=$2 AND ended_at IS NULL',[f.tenant,id])).rows[0],key+' assigned Chief crew resolves active delegation');
  if(key!=='work'){await call('instrument','/api/tickets/'+id+'/start');check((await read(id)).status==='IN_PROGRESS',key+' personally assigned field start');}
 }
 await fs.writeFile('.local/alpha-closure209/fixture.json',JSON.stringify(f));await fs.writeFile('.local/alpha-closure209/journey-setup-results.json',JSON.stringify({checks,tenant:f.tenant,project:f.project,legacySeeded:true},null,2));console.log('Connected workflow HTTP setup: '+checks.length+' checks; ordinary states established through authenticated actions.');
}catch(e){await fs.writeFile('.local/alpha-closure209/fixture-partial.json',JSON.stringify(f));await fs.writeFile('.local/alpha-closure209/journey-setup-partial.json',JSON.stringify({checks,complete:false},null,2));throw e;}finally{await pool.end();}
