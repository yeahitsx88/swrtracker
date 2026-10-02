import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {NextRequest} from 'next/server';
import {runLifecycleSchemaAcceptance} from './account-offboarding-postgres';
import {getPool} from '../../src/lib/db';
import {signToken} from '../../src/lib/auth';
import {POST as approve} from '../../src/app/api/tickets/[ticketId]/approve/route';
import {POST as assign} from '../../src/app/api/tickets/[ticketId]/assign/route';
import {POST as rejectInability} from '../../src/app/api/tickets/[ticketId]/field-inability/reject/route';
import {POST as validateInability} from '../../src/app/api/tickets/[ticketId]/field-inability/validate/route';
import type {UUID} from '../../src/shared/types';

runLifecycleSchemaAcceptance(async(db,f)=>{
 const pg=getPool(),oldQuery=pg.query,oldConnect=pg.connect,oldSecret=process.env.JWT_SECRET;
 process.env.JWT_SECRET='ticket-replay-synthetic-secret-long-enough';
 pg.query=(async(sql:string,params?:unknown[])=>db.query(sql,params)) as typeof pg.query;
 pg.connect=(async()=>({query:async(sql:string,params?:unknown[])=>{
  if(sql==='BEGIN')return db.query('SAVEPOINT ticket_route');
  if(sql==='COMMIT')return db.query('RELEASE SAVEPOINT ticket_route');
  if(sql==='ROLLBACK')return db.query('ROLLBACK TO SAVEPOINT ticket_route');
  return db.query(sql,params);
 },release:()=>{}})) as typeof pg.connect;
 let checks=0;
 try{
  const company=(await db.query('SELECT company_id FROM users WHERE id=$1',[f.subject])).rows[0].company_id;
  const ticket=randomUUID(),im=randomUUID(),area=randomUUID(),level=randomUUID();
  await db.query("INSERT INTO aor_levels(id,tenant_id,project_id,depth,label) VALUES($1,$2,$3,0,'Area')",[level,f.tenant,f.project]);
  await db.query("INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,name,code) VALUES($1,$2,$3,$4,'Replay Area','REP')",[area,f.tenant,f.project,level]);
  await db.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,'IM','fixture')",[im,f.tenant,company,im+'@example.test']);
  await db.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'INSTRUMENT_MAN')",[f.project,im]);
  await db.query("INSERT INTO tickets(id,tenant_id,project_id,company_id,requester_id,aor_node_id,ticket_type,requested_date,workflow_variant,status,craft,description) VALUES($1,$2,$3,$4,$5,$6,'LAYOUT',NOW(),'STANDARD_APPROVAL','SUBMITTED','Survey','Replay authority')",[ticket,f.tenant,f.project,company,f.actor,area]);
  const key=randomUUID(),assignmentKey=randomUUID();let version=1;
  const request=(action:string,k:string,body={})=>new NextRequest('http://localhost/api/tickets/'+ticket+'/'+action,{method:'POST',headers:{cookie:'swr_session='+signToken(f.subject as UUID,f.tenant as UUID,version),'content-type':'application/json','idempotency-key':k},body:JSON.stringify(body)});
  const params={params:Promise.resolve({ticketId:ticket})};
  assert.equal((await approve(request('approve',key),params)).status,200);checks++;
  assert.equal((await approve(request('approve',key),params)).status,200,'authorized retry survives APPROVED status');checks++;
  const body={assignedPartyChiefId:null,assignedInstrumentManId:im};
  assert.equal((await assign(request('assign',assignmentKey,body),params)).status,200);checks++;
  assert.equal((await approve(request('approve',key),params)).status,200,'authorized historical retry survives assignment');checks++;
  const before=(await db.query('SELECT row_version FROM tickets WHERE id=$1',[ticket])).rows[0].row_version;
  await db.query("UPDATE project_memberships SET role='VIEWER' WHERE project_id=$1 AND user_id=$2",[f.project,f.subject]);
  await db.query('UPDATE users SET session_version=session_version+1 WHERE id=$1',[f.subject]);version++;
  assert.equal((await approve(request('approve',key),params)).status,403,'renewed Viewer cannot replay former approval');checks++;
  assert.equal((await assign(request('assign',assignmentKey,body),params)).status,403,'renewed Viewer cannot replay former assignment');checks++;
  assert.equal((await db.query('SELECT row_version FROM tickets WHERE id=$1',[ticket])).rows[0].row_version,before);checks++;
  assert.equal((await db.query("SELECT count(*)::int n FROM ticket_events WHERE ticket_id=$1 AND event_type='ticket.approved'",[ticket])).rows[0].n,1);checks++;
  await db.query("UPDATE project_memberships SET role='SURVEY_MANAGER' WHERE project_id=$1 AND user_id=$2",[f.project,f.subject]);
  await db.query('UPDATE users SET session_version=session_version+1 WHERE id=$1',[f.subject]);version++;
  for(const [action,handler]of [['field-inability/reject',rejectInability],['field-inability/validate',validateInability]]as const){
   await db.query("UPDATE tickets SET status='PENDING_FIELD_VALIDATION',assigned_party_chief_id=$2,assigned_instrument_man_id=$3,field_validation_reviewer_id=$2,pending_pc_reason='Synthetic inability' WHERE id=$1",[ticket,f.subject,im]);
   const resolutionKey=randomUUID(),reason={reason:'Synthetic reviewed inability'};
   assert.equal((await handler(request(action,resolutionKey,reason),params)).status,200);checks++;
   assert.equal((await handler(request(action,resolutionKey,reason),params)).status,200,'exact authorized retry survives cleared captured duty');checks++;
   assert.equal((await handler(request(action,randomUUID(),reason),params)).status,403,'cleared duty cannot authorize fresh command');checks++;
   await db.query('UPDATE tickets SET field_validation_reviewer_id=$2,assigned_party_chief_id=$3 WHERE id=$1',[ticket,f.actor,f.subject]);
   assert.equal((await handler(request(action,resolutionKey,reason),params)).status,403,'new captured reviewer denies old actor replay');checks++;
  }
  console.log('Ticket replay authority PostgreSQL route checks passed: '+checks);
 }finally{pg.query=oldQuery;pg.connect=oldConnect;if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;}
}).catch(error=>{console.error(error);process.exitCode=1;});
