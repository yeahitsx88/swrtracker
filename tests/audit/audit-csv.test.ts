import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Client, Pool } from 'pg';
import type { DbClient, UUID } from '@/shared/types';
import type { AuditLogEntry, AuditLogPort } from '@/modules/audit/application/audit-log';
import { exportAuditCsv } from '@/modules/audit/application/audit-csv';
import { openAuditCsv } from '@/modules/audit/infrastructure/audit-csv-stream';

const id='00000000-0000-0000-0000-000000000001' as UUID;
const query={tenantId:id,userId:id};
const entry:AuditLogEntry={id,source:'tenant',eventType:'project.archived',
  ticketId:null,ticketNumber:null,projectId:id,projectName:'Site, "North"\nUnit 1',
  actorId:id,actorName:' =SUM(1,2)',payload:{reason:'All work complete',nested:{value:'λ'}},
  createdAt:new Date('2026-09-25T12:00:00Z')};
const admin={async query(){return {rows:[{role:'TENANT_ADMIN'}]};}} as unknown as DbClient;

test('CSV exports every matching page with quoted fields, full payload, and spreadsheet-safe text',async()=>{
  const offsets:number[]=[];
  const repo:AuditLogPort={async list(_db,filter){
    assert.equal(filter.limit,500);assert.equal(filter.eventType,'project.archived');
    assert.equal(filter.projectId,id);offsets.push(filter.offset);
    return filter.offset===0 ? Array.from({length:500},()=>entry) : [{...entry,actorName:'Last actor'}];
  }};
  const chunks=[];
  for await(const chunk of exportAuditCsv(repo,admin,{...query,projectId:id,eventType:' project.archived '})) chunks.push(chunk);
  assert.deepEqual(offsets,[0,500]);assert.equal(chunks.length,2);
  const csv=chunks.join('');
  assert.ok(csv.startsWith('\uFEFF"Event ID","Source"'));
  assert.equal(csv.split('"project.archived"').length-1,501);
  assert.ok(csv.includes('"Site, ""North""\nUnit 1"'));
  assert.ok(csv.includes('"\' =SUM(1,2)"'));
  assert.ok(csv.includes('"{""reason"":""All work complete"",""nested"":{""value"":""λ""}}"'));
  assert.ok(csv.endsWith('\r\n'));assert.ok(chunks[1]?.includes('Last actor'));
});

function exportPool(options:{deny?:boolean;failPage?:number;rollbackFailure?:boolean}={}){
  const calls:string[]=[];let pages=0,releases=0;
  const db={async query(sql:string){
    calls.push(sql);
    if(sql.includes('SELECT tm.role'))return {rows:options.deny?[]:[{role:'TENANT_ADMIN'}]};
    if(sql.startsWith('WITH events')){
      pages++;
      if(pages===options.failPage)throw new Error('Database read failed');
      return {rows:pages===1?Array.from({length:500},()=>entry):[]};
    }
    if(sql==='ROLLBACK' && options.rollbackFailure)throw new Error('Rollback failed');
    return {rows:[]};
  },release(){releases++;}} as unknown as DbClient & {release():void};
  return {pool:{async connect(){return db;}},calls,get releases(){return releases;}};
}

test('CSV stream uses a read-only snapshot and releases connection after complete consumption',async()=>{
  const fixture=exportPool();const stream=await openAuditCsv(fixture.pool,query);
  const text=await new Response(stream).text();
  assert.ok(text.includes('Timestamp (UTC)'));
  assert.equal(fixture.calls[0],'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(fixture.calls.at(-1),'ROLLBACK');assert.equal(fixture.releases,1);
});

test('CSV cancellation releases its snapshot and connection',async()=>{
  const fixture=exportPool();const stream=await openAuditCsv(fixture.pool,query);
  const reader=stream.getReader();await reader.read();await reader.cancel();
  assert.equal(fixture.calls.at(-1),'ROLLBACK');assert.equal(fixture.releases,1);
});

test('CSV authorization and first-page errors fail before returning an HTTP body',async()=>{
  for(const options of [{deny:true},{failPage:1}]){
    const fixture=exportPool(options);
    await assert.rejects(openAuditCsv(fixture.pool,query));
    assert.equal(fixture.calls.at(-1),'ROLLBACK');assert.equal(fixture.releases,1);
  }
});

test('CSV later-page failures error the download and release the connection',async()=>{
  const fixture=exportPool({failPage:2});const stream=await openAuditCsv(fixture.pool,query);
  await assert.rejects(new Response(stream).text(),/Database read failed/);
  assert.equal(fixture.calls.at(-1),'ROLLBACK');assert.equal(fixture.releases,1);
});

test('empty CSV exports retain headers and invalid filters do not read events',async()=>{
  let reads=0;
  const repo:AuditLogPort={async list(){reads++;return [];}};
  let csv='';for await(const chunk of exportAuditCsv(repo,admin,query))csv+=chunk;
  assert.equal(csv.split('\r\n').length,2);assert.equal(reads,1);
  await assert.rejects(async()=>{for await(const _ of exportAuditCsv(repo,admin,{...query,from:'bad-date'})){assert.fail('Unexpected data');}});
  assert.equal(reads,1);
});

test('PostgreSQL CSV snapshot excludes events arriving between export pages',
  {skip:!process.env.DATABASE_URL},async()=>{
  const schema='audit_export_'+randomUUID().replaceAll('-','');
  const owner=new Client({connectionString:process.env.DATABASE_URL});await owner.connect();
  const pool=new Pool({connectionString:process.env.DATABASE_URL,options:`-c search_path=${schema}`});
  try{
    await owner.query(`CREATE SCHEMA ${schema}`);
    await owner.query(`SET search_path TO ${schema}`);
    // Isolated read-model tables exercise actual PostgreSQL snapshot/stream behavior.
    await owner.query(`CREATE TABLE users(id uuid,tenant_id uuid,name text,deactivated_at timestamptz);
      CREATE TABLE tenant_memberships(tenant_id uuid,user_id uuid,role text);
      CREATE TABLE projects(id uuid,tenant_id uuid,name text);
      CREATE TABLE tickets(id uuid,tenant_id uuid,ticket_number text,project_id uuid);
      CREATE TABLE ticket_draft_tombstones(ticket_id uuid,tenant_id uuid,project_id uuid);
      CREATE TABLE ticket_events(id uuid,tenant_id uuid,ticket_id uuid,actor_id uuid,event_type text,payload jsonb,created_at timestamptz);
      CREATE TABLE tenant_events(id uuid,tenant_id uuid,actor_id uuid,event_type text,payload jsonb,created_at timestamptz);`);
    await owner.query("INSERT INTO users VALUES($1,$1,'Admin',NULL)",[id]);
    await owner.query("INSERT INTO tenant_memberships VALUES($1,$1,'TENANT_ADMIN')",[id]);
    await owner.query(`INSERT INTO tenant_events
      SELECT gen_random_uuid(),$1,$1,'original.event',jsonb_build_object('sequence',n),NOW()
      FROM generate_series(1,501) AS n`,[id]);
    const stream=await openAuditCsv(pool,query);
    // openAuditCsv has read the first 500 rows and established its snapshot.
    await owner.query("INSERT INTO tenant_events VALUES(gen_random_uuid(),$1,$1,'arrived.later','{}',NOW())",[id]);
    const csv=await new Response(stream).text();
    assert.equal(csv.split('"original.event"').length-1,501);
    assert.ok(!csv.includes('arrived.later'));
    const next=await new Response(await openAuditCsv(pool,query)).text();
    assert.equal(next.split('"original.event"').length-1,501);
    assert.ok(next.includes('arrived.later'));
  }finally{
    await pool.end();
    try{await owner.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);}finally{await owner.end();}
  }
});
