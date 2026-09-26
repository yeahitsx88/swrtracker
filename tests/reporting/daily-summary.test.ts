import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import type { DbClient, UUID } from '@/shared/types';
import { ForbiddenError } from '@/shared/errors';
import { getDailySummary } from '@/modules/reporting/application/daily-summary';
import { dailyReportEvents } from '@/modules/ticket/application/daily-report-events';
const query={tenantId:randomUUID() as UUID,projectId:randomUUID() as UUID,userId:randomUUID() as UUID,
  from:'2026-09-25T05:00:00.000Z',until:'2026-09-26T05:00:00.000Z'};
const db:DbClient={async query(){throw Error('Direct database access is not allowed');}};
const now=new Date('2026-09-26T06:00:00.000Z');

test('daily summary preserves scoped boundaries and separates event occurrences from distinct requests',async()=>{
  const result=await getDailySummary({async read(receivedDb,receivedQuery){
    assert.equal(receivedDb,db);assert.equal(receivedQuery,query);
    return {...query,activity:[{eventType:'ticket.assigned',requests:2,events:3},
      {eventType:'ticket.completed',requests:1,events:1}]};
  }},db,query,now);
  assert.equal(result.view,'daily');assert.equal(result.projectId,query.projectId);
  assert.equal(result.from,query.from);assert.equal(result.until,query.until);assert.equal(result.asOf,now);
  assert.equal(result.totalEvents,4);assert.equal(result.activity.length,14);
  assert.deepEqual(result.activity.find(item=>item.eventType==='ticket.assigned'),
    {eventType:'ticket.assigned',label:'Crew assignments',requests:2,events:3});
  assert.deepEqual(result.activity.find(item=>item.eventType==='ticket.submitted'),
    {eventType:'ticket.submitted',label:'Requests submitted',requests:0,events:0});
  assert.ok(result.activity.every(item=>!item.label.includes('PENDING_PC_APPROVAL')));
});

test('quiet days have a stable zero-filled summary and source failures remain errors',async()=>{
  const result=await getDailySummary({read:async()=>({...query,activity:[]})},db,query,now);
  assert.equal(result.totalEvents,0);
  assert.deepEqual(result.activity.map(item=>item.eventType),[...dailyReportEvents]);
  assert.ok(result.activity.every(item=>item.requests===0&&item.events===0));
  await assert.rejects(getDailySummary({read:async()=>{throw new ForbiddenError('Denied');}},db,query),ForbiddenError);
  await assert.rejects(getDailySummary({read:async()=>{throw Error('Offline');}},db,query),/Offline/);
});
