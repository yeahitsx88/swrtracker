import {inUnitRequestScope} from '../setup/unit-request-scope';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {Pool,type PoolClient} from 'pg';
import {NextRequest} from 'next/server';
import {getPool} from '../../src/lib/db';
import {signToken} from '../../src/lib/auth';
import {acquireTenantLifecycleLock} from '../../src/lib/tenant-lifecycle-lock';
import {POST as restartHandler} from '../../src/app/api/tickets/[ticketId]/restart-delay/route';
import type {UUID} from '../../src/shared/types';
const restart=inUnitRequestScope(restartHandler);

async function main(){
 const url=new URL(process.env.DATABASE_URL??'');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15489');assert.equal(url.pathname,'/swr_team_isolated');assert.equal(process.env.SWR_TEAM_POSTGRES,'1');
 const schema='ticket_replay_'+randomUUID().replaceAll('-','');assert.match(schema,/^ticket_replay_[a-f0-9]{32}$/);
 const setup=new Pool({connectionString:url.href,max:1}),application=getPool(),oldQuery=application.query,oldConnect=application.connect,oldSecret=process.env.JWT_SECRET;
 let created=false,pg:Pool|undefined,pending:Promise<Response>|undefined,holder:PoolClient|undefined,waiter:PoolClient|undefined;
 try{
  const db=await setup.connect();
  try{
  // Migration042 commits its wrapper; retain session schema for later migrations.
   await db.query('BEGIN');await db.query(`CREATE SCHEMA "${schema}"`);await db.query(`SET search_path TO "${schema}",public`);
   for(const file of (await readdir('db/migrations')).filter(f=>f.endsWith('.sql')).sort()){await db.query(await readFile('db/migrations/'+file,'utf8'));assert.equal((await db.query('SELECT current_schema() AS name')).rows[0].name,schema,'Migration must stay in the newly owned schema');}
   await db.query('COMMIT');created=true;
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
  pg=new Pool({connectionString:url.href,max:4,options:'-c search_path='+schema+',public'});
  const tenant=randomUUID(),project=randomUUID(),company=randomUUID(),chief=randomUUID(),replacement=randomUUID(),area=randomUUID(),level=randomUUID(),ticket=randomUUID();
  await pg.query("INSERT INTO tenants(id,name) VALUES($1,'Replay wait fixture')",[tenant]);
  await pg.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'Synthetic GC','GC')",[company,tenant]);
  await pg.query("INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,'Synthetic replay','ACTIVE','FULL')",[project,tenant]);
  for(const user of [chief,replacement]){
   await pg.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,'Synthetic Chief','fixture')",[user,tenant,company,user+'@example.test']);
   await pg.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'PARTY_CHIEF')",[project,user]);
  }
  await pg.query("INSERT INTO aor_levels(id,tenant_id,project_id,depth,label) VALUES($1,$2,$3,0,'Area')",[level,tenant,project]);
  await pg.query("INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,name,code) VALUES($1,$2,$3,$4,'Synthetic Area','WAIT')",[area,tenant,project,level]);
  await pg.query("INSERT INTO tickets(id,tenant_id,project_id,company_id,requester_id,aor_node_id,ticket_type,requested_date,workflow_variant,status,assigned_party_chief_id,craft,description) VALUES($1,$2,$3,$4,$5,$6,'LAYOUT',NOW(),'STANDARD_APPROVAL','DELAYED',$5,'Survey','Replay wait')",[ticket,tenant,project,company,chief,area]);
  process.env.JWT_SECRET='ticket-wait-synthetic-secret-long-enough';application.query=pg.query.bind(pg) as typeof application.query;application.connect=pg.connect.bind(pg) as typeof application.connect;
  const key=randomUUID(),token=signToken(chief as UUID,tenant as UUID,1),request=()=>new NextRequest('http://localhost/api/tickets/'+ticket+'/restart-delay',{method:'POST',headers:{cookie:'swr_session='+token,'idempotency-key':key}}),params={params:Promise.resolve({ticketId:ticket})};
  assert.equal((await restart(request(),params)).status,200);
  assert.equal((await restart(request(),params)).status,200);
  holder=await pg.connect();waiter=await pg.connect();
  const pid=(await waiter.query('SELECT pg_backend_pid() pid')).rows[0].pid;
  application.connect=(async()=>({query:async(sql:string,args?:unknown[])=>{
   const result=await waiter!.query(sql,args);if(sql==='BEGIN')await waiter!.query('SET LOCAL statement_timeout=6000');return result;
  },release:()=>{}})) as typeof application.connect;
  await holder.query('BEGIN');await acquireTenantLifecycleLock(holder,tenant as UUID,'SHARED');
  await holder.query('UPDATE tickets SET assigned_party_chief_id=$2 WHERE id=$1',[ticket,replacement]);
  pending=restart(request(),params);
  let observed=false;
  for(let i=0;i<100;i++){
   const row=(await pg.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1",[pid])).rows[0];
   if(row?.wait_event_type==='Lock'){observed=true;break;}
   await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.equal(observed,true,'retry must wait behind concurrent SHARED assignment writer');
  await holder.query('COMMIT');
  assert.equal((await pending).status,404,'post-wait visibility must deny old Chief replay');pending=undefined;
  assert.equal((await pg.query("SELECT count(*)::int n FROM ticket_events WHERE ticket_id=$1 AND event_type='ticket.delay_restarted'",[ticket])).rows[0].n,1);
  console.log('Ticket replay visibility PostgreSQL checks passed: 5; observed two-client ticket wait');
 }finally{
  if(holder)await holder.query('ROLLBACK');if(pending)await pending;
  application.query=oldQuery;application.connect=oldConnect;holder?.release();waiter?.release();if(pg)await pg.end();
  if(created)await setup.query(`DROP SCHEMA "${schema}" CASCADE`);await setup.end();
  if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
