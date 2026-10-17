import test from 'node:test';
import assert from 'node:assert/strict';
import { markNoticesSeen, readProjectInbox } from '@/modules/notification/application/project-inbox';
import type { DbClient, UUID } from '@/shared/types';

const u = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}` as UUID;
const actor = { tenantId: u(1), projectId: u(2), actorId: u(14), actorRole: 'REQUESTER' as const };

function fakeDb(rows: unknown[], unread = 0) {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    async query(sql: string, params: unknown[] = []) {
      queries.push({ sql, params });
      if (/FROM users u JOIN companies c/.test(sql)) return { rows: [{ company_id: u(4), type: 'SUBCONTRACTOR' }], rowCount: 1 };
      if (/COUNT\(\*\)::int AS unread/.test(sql)) return { rows: [{ unread }], rowCount: 1 };
      if (/WITH seen AS/.test(sql)) return { rows, rowCount: rows.length };
      if (/INSERT INTO notification_reads/.test(sql)) return { rows: [{ seen_through: new Date('2026-10-09T10:00:00Z') }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
  } as unknown as DbClient;
  return { db, queries };
}

test('inbox paging is validated before any query', async () => {
  const { db, queries } = fakeDb([]);
  for (const bad of [-1, 1.5, 100_001]) await assert.rejects(readProjectInbox(db, actor, bad), { type: 'ValidationError' });
  assert.equal(queries.length, 0);
});

test('request and survey notices are merged, described in plain language and flagged unread', async () => {
  const rows = [
    { id: 'a', source: 'REQUEST', event_type: 'COMMENT_ADDED', payload: { authorName: 'Survey Lead', excerpt: 'Gate 3 is open.' }, title: null, message: null, ticket_number: 'FSS-N-00001', created_at: new Date('2026-10-09T09:00:00Z'), ticket_id: u(101), unread: true },
    { id: 'b', source: 'SURVEY', event_type: null, payload: null, title: 'Team change', message: 'You joined Crew 2.', ticket_number: null, created_at: new Date('2026-10-08T09:00:00Z'), ticket_id: null, unread: false },
  ];
  const { db, queries } = fakeDb(rows, 1);
  const inbox = await readProjectInbox(db, actor, 0);
  assert.equal(inbox.unread, 1);
  assert.equal(inbox.hasMore, false);
  assert.deepEqual(inbox.notices.map(n => [n.title, n.unread, n.ticketId]), [
    ['New comment on FSS-N-00001', true, u(101)],
    ['Team change', false, null],
  ]);
  assert.match(inbox.notices[0]!.message, /Survey Lead commented: Gate 3 is open\./);
  const read = queries.find(q => /WITH seen AS/.test(q.sql) && /LIMIT 26/.test(q.sql));
  assert.ok(read, 'reads one row beyond the page to detect more');
  assert.deepEqual(read.params.slice(0, 4), [actor.tenantId, actor.projectId, actor.actorId, 0]);
  assert.match(read.sql, /recipient_user_id = \$3/);
  assert.match(read.sql, /recipient_id = \$3/);
});

test('marking seen is an upsert that never moves the watermark backwards', async () => {
  const { db, queries } = fakeDb([]);
  const result = await markNoticesSeen(db, actor);
  assert.equal(result.seenThrough, '2026-10-09T10:00:00.000Z');
  assert.match(queries[0]!.sql, /GREATEST\(notification_reads\.seen_through, EXCLUDED\.seen_through\)/);
  assert.deepEqual(queries[0]!.params, [actor.tenantId, actor.projectId, actor.actorId]);
});
