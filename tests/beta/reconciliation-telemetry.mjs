import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {Pool} from 'pg';
import {NextRequest} from 'next/server';
import recorder from '../../src/modules/support/infrastructure/request-observation.ts';
const {recordRequestObservation}=recorder;
assert.equal(process.env.SWR_RECONCILIATION,'1');
const f=JSON.parse(await readFile('.local-reconciliation-fixture.json','utf8')),url=new URL(process.env.DATABASE_URL??'');assert.match(f.schema,/^reconcile_http_[a-f0-9]{32}$/);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15489');assert.equal(url.pathname,'/swr_team_isolated');assert.equal(f.origin,'http://127.0.0.1:3320');url.searchParams.set('options','-c search_path='+f.schema+',public');process.env.DATABASE_URL=url.href;
const pool=new Pool({connectionString:url.href,max:4}),checks=[],latencies=[];
const check=(v,label)=>{assert(v,label);checks.push(label);},sleep=ms=>new Promise(r=>setTimeout(r,ms));
const headers=who=>({cookie:'swr_session='+f.tokens[who],'Idempotency-Key':randomUUID()});
async function get(){const start=performance.now(),r=await fetch(f.origin+'/api/projects/'+f.project+'/survey/organization',{headers:headers('manager'),signal:AbortSignal.timeout(5000)});assert.equal(r.status,200);await r.text();latencies.push(performance.now()-start);return r.headers.get('x-request-id');}
async function observation(id){return(await pool.query('SELECT * FROM project_request_observations WHERE tenant_id=$1 AND correlation_id=$2',[f.tenant,id])).rows[0];}
async function eventual(id){const end=Date.now()+5000;while(Date.now()<end){const row=await observation(id);if(row)return row;await sleep(15);}throw Error('Specific correlation record missing at bounded deadline');}
async function witness(){const rows=[];for(const table of ['tickets','ticket_events','ticket_assignment_history','attachments','project_support_tickets','project_support_messages','administrative_events'])rows.push((await pool.query('SELECT to_jsonb(t) row FROM '+table+' t WHERE tenant_id=$1 ORDER BY to_jsonb(t)::text',[f.tenant])).rows);return createHash('sha256').update(JSON.stringify(rows)).digest('hex');}
try{
 const before=await witness();await eventual(await get());
 const blocker=await pool.connect();let id;try{
  await blocker.query('BEGIN');await blocker.query('LOCK project_request_observations IN SHARE MODE');id=await get();check(Boolean(id),'Correlation header reaches completed response');
  const pending=(await pool.query("SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'INSERT INTO project_request_observations%'")).rows[0].n;
  check(pending>0,'HTTP body completes while telemetry INSERT remains deliberately blocked');check(!await observation(id),'Blocked observation is not synchronously available');await blocker.query('ROLLBACK');
 }finally{await blocker.query('ROLLBACK');blocker.release();}
 await eventual(id);check(true,'Specific observation eventually persists after lock release');
 const stalled=await pool.connect();try{await stalled.query('BEGIN');await stalled.query('LOCK project_request_observations IN SHARE MODE');const refs=await Promise.all(Array.from({length:4},()=>get()));await sleep(350);check((await Promise.all(refs.map(observation))).every(r=>!r),'Bounded pool/lock timeouts leave completed successful responses independent of telemetry');const connections=(await pool.query("SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND query LIKE 'INSERT INTO project_request_observations%'")).rows[0].n;check(connections<=2,'Observation recorder uses at most two independent connections');await stalled.query('ROLLBACK');}finally{await stalled.query('ROLLBACK');stalled.release();}
 check(await witness()===before,'Blocked recording and timeouts preserve all business/history/support records');
 const lock=await pool.connect();try{
  await lock.query('BEGIN');await lock.query('SELECT id FROM tenants WHERE id=$1 FOR UPDATE',[f.tenant]);
  assert.equal((await lock.query('SELECT session_version FROM users WHERE tenant_id=$1 AND id=$2',[f.tenant,f.people.customViewer])).rows[0].session_version,1,'Fresh-authority fixture must start with its valid original session');
  const req=new NextRequest(f.origin+'/api/projects/'+f.project+'/survey/organization',{headers:headers('customViewer')}),expected={tenantId:f.tenant,userId:f.people.customViewer,sessionVersion:1};
  const recording=recordRequestObservation(req,expected,{projectId:f.project,route:'/owned/fresh-authority',method:'GET',status:200,durationMs:1,correlationId:randomUUID(),errorCode:null,ticketId:null,priorStatus:null});const refused=assert.rejects(recording,{type:'UnauthorizedError'});
  await sleep(20);await lock.query('UPDATE users SET session_version=session_version+1 WHERE tenant_id=$1 AND id=$2',[f.tenant,f.people.customViewer]);await lock.query('COMMIT');await refused;check(true,'Recorder refuses stale authority after waiting at lifecycle barrier');
 }finally{await lock.query('ROLLBACK');lock.release();}
 check(!(await pool.query("SELECT id FROM project_request_observations WHERE tenant_id=$1 AND route='/owned/fresh-authority'",[f.tenant])).rows.length,'Fresh-authority refusal writes no observation');
 const denied=await fetch(f.origin+'/api/tickets/'+f.partial+'/approve',{method:'POST',headers:{...headers('requester'),'content-type':'application/json'},body:'{}'});assert.equal(denied.status,403);await denied.text();const record=await eventual(denied.headers.get('x-request-id'));check(record.ticket_id===f.partial&&record.prior_status==='DRAFT','Pre-handler verified ticket and status survive after scheduling');
 const ordinary=await fetch(f.origin+'/api/tickets/'+f.partial,{headers:headers('admin')});check([403,404].includes(ordinary.status),'Administrator metadata exception supplies no ordinary draft visibility');await ordinary.text();
 const diagnostics=await fetch(f.origin+'/api/projects/'+f.project+'/diagnostics',{headers:headers('admin')});assert.equal(diagnostics.status,200);check((await diagnostics.json()).errors.some(e=>e.correlationId===record.correlation_id&&e.ticketId===f.partial&&e.priorStatus==='DRAFT'&&e.actorName==='Acceptance requester'),'Current scoped administrator sees approved UUID/status/actor metadata despite ordinary draft denial');
 check(await witness()===before,'Denied business command and fresh-authority refusal preserve business state');
 await writeFile('audits/alpha1-reconciliation/telemetry.json',JSON.stringify({checks,httpLatencyMs:latencies.map(n=>Math.round(n*100)/100),poolLimit:2,lockTimeoutMs:100,connectionTimeoutMs:300,statementTimeoutMs:250,eventualDeadlineMs:5000,retainedWitness:before,limits:['Latency samples are local observations, not production SLOs. The previous synchronous recorder awaited the same bounded persistence path; no statistically controlled pre-change latency benchmark was captured.']},null,2)+'\n');console.log('After-response telemetry: '+checks.length+' checks');
}finally{await pool.end();}
// The independently bounded recorder pool is process-lived in production.
process.exit(0);
