// Opt-in regression test: actual repositories and HTTP handlers over pg_temp
// schema clones. All writes are session-local and the outer transaction rolls back.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Pool } from 'pg';
import { NextRequest } from 'next/server';
import { getPool } from '../../src/lib/db';
import { signToken } from '../../src/lib/auth';
import { resolveVisibility } from '../../src/lib/resolve-visibility';
import { getTicketRouteContext, withTicketMutation } from '../../src/lib/ticket-route-helpers';
import { TicketRepository } from '../../src/modules/ticket/infrastructure/ticket.repository';
import { listLocalNotificationPreviews } from '../../src/modules/notification/application/local-preview';
import { GET as detail, PATCH as edit } from '../../src/app/api/tickets/[ticketId]/route';
import { POST as create } from '../../src/app/api/tickets/route';
import { POST as cancel } from '../../src/app/api/tickets/[ticketId]/field-cancel/route';
import { handleGetTicketHistory as history } from '../../src/app/api/tickets/[ticketId]/history/handler';
import { handleGetTicketAttachments as metadata, handleDownloadTicketAttachment as download, type TicketAttachmentDownloadDeps } from '../../src/app/api/tickets/[ticketId]/attachments/handler';
import type { DbClient, UUID } from '../../src/shared/types';

const id=(n:number)=>`85000000-0000-4000-8000-${String(n).padStart(12,'0')}` as UUID;
const tenant=id(1),foreignTenant=id(2),company=id(3),project=id(4),unassignedProject=id(5),foreignProject=id(6);
const manager=id(10),superintendent=id(11),chief=id(12),im=id(13),mate=id(14),requester=id(15),outsider=id(16);
const area=id(20),sibling=id(21),child=id(22),foreignArea=id(23),department=id(24);
const sharedTicket=id(30),ownTicket=id(31),hiddenTicket=id(32),foreignTicket=id(33),attachmentId=id(40),roster=id(41),grant=id(42);
const repo=new TicketRepository();

async function main(){
  if(process.env.SWR_SECURITY_POSTGRES!=='1')throw Error('SWR_SECURITY_POSTGRES=1 required');
  const config=JSON.parse(fs.readFileSync('.data/sabine/runtime.json','utf8'));
  const url=new URL(config.DATABASE_URL);
  if(url.hostname!=='127.0.0.1'||url.port!=='15488'||url.pathname!=='/swr_sabine_simulation')throw Error('Fixed local temporary-fixture target required');
  process.env.DATABASE_URL=url.href;process.env.JWT_SECRET='synthetic-security-regression-only';
  const pg=new Pool({connectionString:url.href,max:1});const db=await pg.connect();
  const appPool=getPool();const originalQuery=appPool.query,originalConnect=appPool.connect;
  let checks=0,storageReads=0;
  const fingerprint=async()=> (await db.query(`SELECT count(*)::text AS n,md5(string_agg(id::text||':'||status::text||':'||row_version::text,',' ORDER BY id)) AS hash FROM public.tickets`)).rows[0];
  const before=await fingerprint();
  try{
    await db.query('BEGIN');
    const tables=['companies','projects','users','project_memberships','aor_levels','aor_nodes','aor_assignments','crew_rosters',
      'tickets','ticket_events','ticket_sequences','cad_work','ticket_assignment_history','departments','department_memberships',
      'department_titles','priority_whitelist','api_idempotency','attachments','revoked_auth_sessions',
      'ticket_return_cycles','ticket_need_by_revisions','notification_outbox'];
    for(const table of tables)await db.query(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING ALL) ON COMMIT DROP`);
    await db.query('SET LOCAL search_path=pg_temp');
    await db.query(fs.readFileSync('db/migrations/029_partial_drafts_and_recovery.sql', 'utf8'));
    for(const table of tables){assert.equal((await db.query('SELECT to_regclass($1)::oid=to_regclass($2)::oid AS safe',[table,`pg_temp.${table}`])).rows[0].safe,true);}
    // Route transactions are SAVEPOINTs inside the rollback-only outer fixture.
    appPool.query=(async(sql:string,params?:unknown[])=>{
      try{return await db.query(sql,params);}catch(error){
        console.error('Synthetic SQL failed:',(error as {code?:string}).code,sql.slice(0,160));throw error;
      }
    }) as typeof appPool.query;
    appPool.connect=(async()=>({query:async(sql:string,params?:unknown[])=>{
      if(sql==='BEGIN')return db.query('SAVEPOINT route_command');
      if(sql==='COMMIT')return db.query('RELEASE SAVEPOINT route_command');
      if(sql==='ROLLBACK'){await db.query('ROLLBACK TO SAVEPOINT route_command');return db.query('RELEASE SAVEPOINT route_command');}
      return db.query(sql,params);
    },release:()=>{}})) as unknown as typeof appPool.connect;
    await db.query(`INSERT INTO pg_temp.companies(id,tenant_id,name,type) VALUES($1,$2,'Synthetic GC','GC')`,[company,tenant]);
    for(const [pid,tid] of [[project,tenant],[unassignedProject,tenant],[foreignProject,foreignTenant]])await db.query(`INSERT INTO pg_temp.projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,'Synthetic project','ACTIVE','FULL')`,[pid,tid]);
    for(const [uid,role] of [[manager,'SURVEY_MANAGER'],[superintendent,'SURVEY_SUPERINTENDENT'],[chief,'PARTY_CHIEF'],[im,'INSTRUMENT_MAN'],[mate,'INSTRUMENT_MAN'],[requester,'REQUESTER'],[outsider,'REQUESTER']]){
      await db.query(`INSERT INTO pg_temp.users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,'Synthetic person','not-a-login-hash')`,[uid,tenant,company,`${uid}@example.invalid`]);
      if(uid!==outsider)await db.query(`INSERT INTO pg_temp.project_memberships(project_id,user_id,role) VALUES($1,$2,$3)`,[project,uid,role]);
    }
    const level=id(25),childLevel=id(26);
    await db.query(`INSERT INTO pg_temp.aor_levels(id,tenant_id,project_id,depth,label) VALUES($1,$3,$4,0,'Area'),($2,$3,$4,1,'Subarea')`,[level,childLevel,tenant,project]);
    for(const [node,parent,lev,tid,pid] of [[area,null,level,tenant,project],[sibling,null,level,tenant,project],[child,area,childLevel,tenant,project],[foreignArea,null,level,foreignTenant,foreignProject]]){
      await db.query(`INSERT INTO pg_temp.aor_nodes(id,tenant_id,project_id,level_id,parent_id,name,code) VALUES($1,$2,$3,$4,$5,'Synthetic Area',$6)`,[node,tid,pid,lev,parent,String(node)]);
    }
    await db.query(`INSERT INTO pg_temp.departments(id,tenant_id,project_id,name,manager_title,created_by) VALUES($1,$2,$3,'Synthetic department','Synthetic Manager',$4)`,[department,tenant,project,manager]);
    await db.query(`INSERT INTO pg_temp.aor_assignments(id,tenant_id,project_id,user_id,aor_node_id) VALUES($1,$2,$3,$4,$5)`,[grant,tenant,project,superintendent,area]);
    for(const user of [im,mate])await db.query(`INSERT INTO pg_temp.crew_rosters(id,tenant_id,project_id,party_chief_id,instrument_man_id) VALUES($1,$2,$3,$4,$5)`,[user===im?roster:id(43),tenant,project,chief,user]);
    for(const [ticket,pid,tid,assigned] of [[sharedTicket,project,tenant,mate],[ownTicket,project,tenant,im],[hiddenTicket,unassignedProject,tenant,mate],[foreignTicket,foreignProject,foreignTenant,mate]]){
      await db.query(`INSERT INTO pg_temp.tickets(id,tenant_id,project_id,company_id,aor_node_id,requester_id,assigned_party_chief_id,assigned_instrument_man_id,ticket_number,ticket_type,workflow_variant,status,craft,description,requested_date)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'LAYOUT','STANDARD_APPROVAL','DELAYED','','Synthetic regression work','2026-10-15')`,[ticket,tid,pid,company,area,requester,chief,assigned,`FSS-${ticket}`]);
    }
    const request=(user:UUID,ticket=sharedTicket)=>new NextRequest(`http://localhost/api/tickets/${ticket}`,{headers:{cookie:`swr_session=${signToken(user,tenant)}`}});
    const context=(ticket=sharedTicket)=>({params:Promise.resolve({ticketId:ticket})});
    const editRequest=(ticket:UUID)=>new NextRequest(`http://localhost/api/tickets/${ticket}`,{method:'PATCH',headers:{cookie:`swr_session=${signToken(im,tenant)}`,'content-type':'application/json','idempotency-key':`edit-${ticket}`},body:JSON.stringify({description:'Synthetic probe'})});
    await db.query(`INSERT INTO pg_temp.attachments(id,ticket_id,tenant_id,uploaded_by,filename,mime_type,storage_key,size_bytes,purpose,return_cycle,content_sha256)
      VALUES($1,$2,$3,$4,'synthetic.txt','text/plain','synthetic-only',20,'REQUEST_INSTRUCTION',0,$5)`,[attachmentId,sharedTicket,tenant,requester,'0'.repeat(64)]);
    const downloadDeps={getTicketRouteContext,createTicketRepo:()=>repo,
      findAttachment:async(tid:string,ticket:string,file:string,held:DbClient)=>(await held.query<NonNullable<Awaited<ReturnType<TicketAttachmentDownloadDeps['findAttachment']>>>>('SELECT * FROM pg_temp.attachments WHERE tenant_id=$1 AND ticket_id=$2 AND id=$3',[tid,ticket,file])).rows[0]??null,
      createStorage:()=>({read:async()=>{storageReads++;return Buffer.from('Synthetic file bytes');}}),
      withTicketMutation};
    const file=(user:UUID,ticket=sharedTicket)=>download(request(user,ticket),{params:Promise.resolve({ticketId:ticket,attachmentId})},downloadDeps);
    const surfaces=async(user:UUID,ticket=sharedTicket)=>[
      await detail(request(user,ticket),context(ticket)),await history(request(user,ticket),context(ticket)),
      await metadata(request(user,ticket),context(ticket)),await file(user,ticket)];
    const staleScope=await resolveVisibility(db,tenant,project,im,'INSTRUMENT_MAN');
    for(const response of await surfaces(im)){assert.equal(response.status,200);checks++;}
    assert.equal(storageReads,1);
    const cancelReq=(user:UUID,key:string)=>new NextRequest(`http://localhost/api/tickets/${sharedTicket}/field-cancel`,{method:'POST',headers:{cookie:`swr_session=${signToken(user,tenant)}`,'content-type':'application/json','idempotency-key':key},body:JSON.stringify({reason:'Synthetic reason'})});
    const state=async()=> (await db.query('SELECT status,row_version FROM pg_temp.tickets WHERE id=$1',[sharedTicket])).rows[0];
    const prior=await state();
    assert.equal((await cancel(cancelReq(im,'teammate'),context())).status,403);checks++;
    assert.deepEqual(await state(),prior);checks++;
    assert.equal((await db.query('SELECT count(*)::int AS n FROM pg_temp.api_idempotency')).rows[0].n,0);checks++;
    assert.equal((await cancel(cancelReq(mate,'owner'),context())).status,200);checks++;
    assert.equal((await state()).status,'PENDING_PC_APPROVAL');checks++;
    await db.query('UPDATE pg_temp.crew_rosters SET deactivated_at=NOW() WHERE id=$1',[roster]);
    for(const response of await surfaces(im)){assert.equal(response.status,404);checks++;}
    assert.equal(storageReads,1,'denied file must never reach storage');checks++;
    assert.equal(await repo.findById(db,tenant,sharedTicket,staleScope),null);checks++;
    const page=await repo.list(db,tenant,{projectId:project,visibility:staleScope,limit:25,offset:0});
    assert.deepEqual(page.data.map(row=>row.id),[ownTicket]);checks++;
    assert.equal((await detail(request(im,ownTicket),context(ownTicket))).status,200);checks++;
    assert.equal(await repo.findPartyChiefForInstrumentMan(db,tenant,project,im),null);checks++;
    for(const ticket of [sharedTicket,id(999)]){
      const response=await edit(editRequest(ticket),context(ticket));
      assert.equal(response.status,404);assert.equal((await response.json()).error.code,'NOT_FOUND');checks++;
    }
    assert.equal((await edit(editRequest(ownTicket),context(ownTicket))).status,403,'readable work retains its legitimate role denial');checks++;
    await db.query('UPDATE pg_temp.crew_rosters SET deactivated_at=NULL WHERE id=$1',[roster]);
    assert.equal((await detail(request(im),context())).status,200);checks++;
    for(const ticket of [hiddenTicket,foreignTicket,id(999)])for(const response of await surfaces(im,ticket)){
      assert.equal(response.status,404);const body=await response.json();assert.equal(body.error.code,'NOT_FOUND');checks++;
    }
    assert.equal((await file(outsider)).status,404);checks++;
    assert.equal((await file(requester)).status,200);checks++;
    await db.query('UPDATE pg_temp.users SET session_version=2 WHERE id=$1',[im]);
    assert.equal((await file(im)).status,401);checks++;
    await db.query('UPDATE pg_temp.users SET session_version=1 WHERE id=$1',[im]);
    assert.equal((await detail(request(im,'not-a-uuid' as UUID),context('not-a-uuid' as UUID))).status,400);checks++;
    assert.equal((await download(request(im,ownTicket),{params:Promise.resolve({ticketId:ownTicket,attachmentId:'1'})},downloadDeps)).status,400);checks++;
    await db.query(`INSERT INTO pg_temp.notification_outbox(id,tenant_id,ticket_id,recipient_user_id,event_type,payload,idempotency_key) VALUES($1,$2,$3,$4,'RETURNED_FOR_CORRECTION',$5,'synthetic-preview')`,[id(50),tenant,sharedTicket,requester,JSON.stringify({reason:'private synthetic reason',urgentReason:'private synthetic urgency'})]);
    for(const actorRole of ['TENANT_ADMIN','PROJECT_ADMIN','SURVEY_MANAGER'] as const){
      const messages=await listLocalNotificationPreviews(db,{tenantId:tenant,projectId:project,actorId:manager,actorRole});
      assert.equal(messages.length,1);
      if(actorRole==='SURVEY_MANAGER'){assert.equal(messages[0]?.ticketId,sharedTicket);assert.match(messages[0]?.body??'',/private synthetic reason/);}
      else{assert.equal(messages[0]?.ticketId,null);assert.equal(messages[0]?.ticketNumber,null);assert.doesNotMatch(JSON.stringify(messages),/private synthetic/);}
      checks++;
    }
    const createReq=(node:UUID,user:UUID,key:string)=>new NextRequest('http://localhost/api/tickets',{method:'POST',headers:{cookie:`swr_session=${signToken(user,tenant)}`,'content-type':'application/json','idempotency-key':key},body:JSON.stringify({projectId:project,aorNodeId:node,workflowVariant:'DIRECT_ASSIGNMENT',requesterId:requester,assignedPartyChiefId:chief,assignedInstrumentManId:mate,departmentId:department,ticketType:'LAYOUT',fieldContact:'Synthetic contact',description:'Synthetic direct assignment',requestedDate:'2026-10-15'})});
    const counts=async()=> (await db.query(`SELECT (SELECT count(*) FROM pg_temp.tickets)::int AS tickets,(SELECT count(*) FROM pg_temp.ticket_events)::int AS events,(SELECT count(*) FROM pg_temp.ticket_assignment_history)::int AS assignments,(SELECT COALESCE(sum(last_seq),0) FROM pg_temp.ticket_sequences)::int AS numbers,(SELECT count(*) FROM pg_temp.api_idempotency)::int AS retries`)).rows[0];
    const beforeDenied=await counts();
    for(const node of [sibling,foreignArea,id(998)]){assert.equal((await create(createReq(node,superintendent,'denied-'+node))).status,403);checks++;}
    assert.deepEqual(await counts(),beforeDenied);checks++;
    assert.equal((await create(createReq(child,superintendent,'child'))).status,201);checks++;
    const afterChild=await counts();
    assert.equal((await create(createReq(child,superintendent,'child'))).status,201);checks++;
    assert.deepEqual(await counts(),afterChild);checks++;
    await db.query('UPDATE pg_temp.aor_assignments SET deactivated_at=NOW() WHERE id=$1',[grant]);
    assert.equal((await create(createReq(child,superintendent,'child'))).status,403);checks++;
    assert.deepEqual(await counts(),afterChild);checks++;
    assert.equal((await create(createReq(sibling,manager,'manager'))).status,201);checks++;
    await db.query(`UPDATE pg_temp.project_memberships SET role='REQUESTER' WHERE project_id=$1 AND user_id=$2`,[project,manager]);
    assert.equal((await create(createReq(sibling,manager,'manager'))).status,403);checks++;
    console.log(`Assessment authorization PostgreSQL: ${checks} assertions passed; actual handlers/repositories; pg_temp rollback only; no Sabine writes.`);
  }finally{
    appPool.query=originalQuery;appPool.connect=originalConnect;
    await db.query('ROLLBACK');assert.deepEqual(await fingerprint(),before,'Public requests must remain unchanged');
    db.release();await pg.end();await appPool.end();
  }
}
main().catch(error=>{console.error('Assessment regression failed:',error instanceof Error?error.message:'unknown');process.exitCode=1;});
