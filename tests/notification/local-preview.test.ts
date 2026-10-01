import test from 'node:test';
import assert from 'node:assert/strict';
import { ForbiddenError } from '@/shared/errors';
import {
  captureQueuedNotifications,
  listLocalNotificationPreviews,
  retryFailedNotifications,
} from '@/modules/notification/application/local-preview';
import type { DbClient, UUID } from '@/shared/types';

const tenantId = 'tenant-1' as UUID;
const projectId = 'project-1' as UUID;
const actorId = 'requester-1' as UUID;

test('local notification preview renders reviewable content and requester recipient scope', async () => {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const db: DbClient = { query: async <T extends object>(sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    return { rows: [{
      id: 'message-1', ticket_id: 'ticket-1', ticket_number: 'FSS-A1-00001', recipient_user_id: actorId,
      recipient_name: 'Requester', recipient_email: 'requester@example.com', event_type: 'RETURNED_FOR_CORRECTION',
      payload: { reason: 'Revised control required' }, delivery_state: 'QUEUED', attempt_count: 0,
      created_at: new Date('2026-09-24T12:00:00Z'), delivered_at: null, last_error: null,
    }] as T[] };
  } };
  const messages = await listLocalNotificationPreviews(db, {
    tenantId, projectId, actorId, actorRole: 'REQUESTER',
  });
  assert.equal(messages[0]?.subject, 'FSS-A1-00001 returned for correction');
  assert.match(messages[0]?.body ?? '', /Revised control required/);
  assert.equal(calls[0]?.params?.[2], false);
  assert.equal(calls[0]?.params?.[3], actorId);
});

test('local capture and retry update durable delivery state for authorized operators', async () => {
  const db: DbClient = { query: async <T extends object>(sql: string) => ({
    rows: (/CAPTURED/.test(sql) ? [{ id: 'one' }, { id: 'two' }] : [{ id: 'three' }]) as T[],
  }) };
  assert.equal(await captureQueuedNotifications(db, { tenantId, projectId, actorRole: 'SURVEY_MANAGER' }), 2);
  assert.equal(await retryFailedNotifications(db, { tenantId, projectId, actorRole: 'PROJECT_ADMIN' }), 1);
  await assert.rejects(
    () => captureQueuedNotifications(db, { tenantId, projectId, actorRole: 'REQUESTER' }),
    ForbiddenError,
  );
});

test('IT previews expose delivery health only, even if an adapter returns operational payloads', async () => {
  for (const actorRole of ['TENANT_ADMIN','PROJECT_ADMIN','SURVEY_MANAGER'] as const) {
    let query='', values: unknown[]=[];
    const db: DbClient={query:async<T extends object>(sql:string,params:unknown[]=[])=>{
      query=sql;values=params;
      return {rows:[{id:'message-1',ticket_id:'private-request-id',ticket_number:'private-number',
        recipient_user_id:actorId,recipient_name:'Synthetic recipient',recipient_email:'recipient@example.invalid',
        event_type:'RETURNED_FOR_CORRECTION',payload:{reason:'private reason',urgentReason:'private urgency'},
        delivery_state:'FAILED',attempt_count:2,created_at:new Date(),delivered_at:null,last_error:'transport echoed private reason'}] as T[]};
    }};
    const [message]=await listLocalNotificationPreviews(db,{tenantId,projectId,actorId,actorRole});
    assert.ok(message);assert.equal(values[2],true);
    if(actorRole==='SURVEY_MANAGER'){
      assert.equal(values[5],false);assert.match(message.body,/private reason/);assert.equal(message.ticketId,'private-request-id');
    }else{
      assert.equal(values[5],true);assert.match(query,/CASE WHEN \$6::boolean THEN '\{\}'::jsonb ELSE o.payload END/);
      assert.equal(message.ticketId,null);assert.equal(message.ticketNumber,null);
      assert.equal(message.recipientEmail,'recipient@example.invalid');assert.equal(message.attemptCount,2);
      assert.doesNotMatch(JSON.stringify(message),/private-/);assert.doesNotMatch(JSON.stringify(message),/private reason|private urgency/);
      assert.match(message.lastError??'',/Delivery failed/);
    }
  }
});
