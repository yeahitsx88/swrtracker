import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import type { DbClient, UUID } from '@/shared/types';
import { ForbiddenError } from '@/shared/errors';
import { getProjectReport, type ProjectReportSource } from '@/modules/reporting/application/project-report';
import type { OperationalReportQuery, OperationalGroup } from '@/modules/ticket/application';

const query:OperationalReportQuery={tenantId:randomUUID() as UUID,projectId:randomUUID() as UUID,
  userId:randomUUID() as UUID,dimension:'craft',limit:1,offset:2};
const db:DbClient={async query(){throw Error('Reporting must use the Ticket application source');}};
const now=new Date('2026-09-25T12:00:00Z');

test('project report derives explicit open, closed and crew workload counts from scoped status aggregates',async()=>{
  const statuses:OperationalGroup['statuses']={CREATED:1,SUBMITTED:2,APPROVED:3,ASSIGNED:4,
    IN_PROGRESS:5,PENDING_PC_APPROVAL:6,DELAYED:7,COMPLETED:8,REJECTED:9,
    REQUESTER_CANCELED:10,FIELD_CANCELED:11,SURVEY_CANCELED:12};
  const source:ProjectReportSource={async read(receivedDb,receivedQuery){
    assert.equal(receivedDb,db);assert.equal(receivedQuery,query);
    return {dimension:'craft',hasMore:true,groups:[{key:'Pipe',label:'Pipe',total:78,statuses}]};
  }};
  const result=await getProjectReport(source,db,query,now);
  assert.equal(result.projectId,query.projectId);assert.equal(result.dimension,'craft');
  assert.equal(result.asOf,now);assert.equal(result.limit,1);assert.equal(result.offset,2);assert.equal(result.hasMore,true);
  assert.deepEqual(result.groups[0]?.counts,{total:78,open:37,closed:41,completed:8,canceled:33,notApproved:9,workload:22});
  assert.deepEqual(result.groups[0]?.statuses,statuses);
});

test('project report preserves missing assignments, sparse counts, empty pages and authorization failures',async()=>{
  const source:ProjectReportSource={async read(){return {dimension:'partyChief',hasMore:false,
    groups:[{key:null,label:null,total:2,statuses:{CREATED:2}}]};}};
  const result=await getProjectReport(source,db,{...query,dimension:'partyChief'},now);
  assert.equal(result.groups[0]?.key,null);assert.equal(result.groups[0]?.label,null);
  assert.deepEqual(result.groups[0]?.counts,{total:2,open:2,closed:0,completed:0,canceled:0,notApproved:0,workload:0});
  const empty=await getProjectReport({read:async()=>({dimension:'project',groups:[],hasMore:false})},db,query,now);
  assert.deepEqual(empty.groups,[]);assert.equal(empty.hasMore,false);
  await assert.rejects(getProjectReport({read:async()=>{throw new ForbiddenError('Denied');}},db,query,now),ForbiddenError);
  await assert.rejects(getProjectReport({read:async()=>{throw Error('Database unavailable');}},db,query,now),/Database unavailable/);
});
