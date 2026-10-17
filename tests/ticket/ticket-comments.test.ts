import test from 'node:test';
import assert from 'node:assert/strict';
import { addTicketComment, canCommentOn, normalizeCommentBody } from '@/modules/ticket/application/ticket-comments';
import type { DbClient, UUID } from '@/shared/types';

const u = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}` as UUID;
const requester = u(14), chief = u(12), im = u(13), lead = u(11), viewer = u(30);
const ticket = { id: u(101), status: 'IN_PROGRESS' as const, requesterId: requester, assignedPartyChiefId: chief, assignedInstrumentManId: im, surveyLeadId: lead, ticketNumber: 'FSS-N-00001' };

function fakeDb() {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    async query(sql: string, params: unknown[] = []) {
      queries.push({ sql, params });
      if (/INSERT INTO ticket_comments/.test(sql)) return { rows: [{ id: u(500), created_at: new Date('2026-10-09T10:00:00Z'), author_name: 'Survey Lead' }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
  } as unknown as DbClient;
  return { db, queries };
}
const base = { tenantId: u(1), projectId: u(2), projectStatus: 'ACTIVE' as const, ticket, body: 'Control points flagged at the north fence.' };

test('comment text is trimmed, required and bounded', () => {
  assert.equal(normalizeCommentBody('  hello \r\n there  '), 'hello \n there');
  for (const bad of ['', '   ', null, 'x'.repeat(4001)]) assert.throws(() => normalizeCommentBody(bad), { type: 'ValidationError' });
});

test('the requester and survey/CAD staff may post; read-only roles and drafts may not', () => {
  assert.equal(canCommentOn(ticket, requester, 'REQUESTER'), true);
  for (const role of ['SURVEY_MANAGER', 'SURVEY_SUPERINTENDENT', 'PARTY_CHIEF', 'INSTRUMENT_MAN', 'CAD_LEAD', 'CAD_TECHNICIAN'] as const) assert.equal(canCommentOn(ticket, viewer, role), true, role);
  for (const role of ['VIEWER', 'AREA_VIEWER', 'DEPARTMENT_MANAGER', 'SUBCONTRACTS_COORDINATOR', 'PROJECT_ADMIN'] as const) assert.equal(canCommentOn(ticket, viewer, role), false, role);
  assert.equal(canCommentOn(ticket, viewer, 'REQUESTER'), false, 'a company-authority requester can read but not post on another requester\'s request');
  assert.equal(canCommentOn({ ...ticket, status: 'DRAFT' }, requester, 'REQUESTER'), false);
});

test('posting writes the comment, an audit event and notices for everyone on the request except the author', async () => {
  const { db, queries } = fakeDb();
  const comment = await addTicketComment(db, { ...base, actorId: lead, actorRole: 'SURVEY_MANAGER' });
  assert.equal(comment.authorName, 'Survey Lead');
  assert.ok(queries.some(q => /INSERT INTO ticket_events/.test(q.sql) && JSON.stringify(q.params).includes('ticket.comment_added')));
  const notices = queries.filter(q => /INSERT INTO notification_outbox/.test(q.sql)).map(q => q.params[2]);
  assert.deepEqual(new Set(notices), new Set([requester, chief, im]));
  assert.ok(!notices.includes(lead));
});

test('archived projects, drafts and unauthorized roles are refused before any write', async () => {
  for (const [params, type] of [
    [{ ...base, projectStatus: 'ARCHIVED' as const, actorId: lead, actorRole: 'SURVEY_MANAGER' as const }, 'ConflictError'],
    [{ ...base, ticket: { ...ticket, status: 'DRAFT' as const }, actorId: requester, actorRole: 'REQUESTER' as const }, 'ConflictError'],
    [{ ...base, actorId: viewer, actorRole: 'VIEWER' as const }, 'ForbiddenError'],
  ] as const) {
    const { db, queries } = fakeDb();
    await assert.rejects(addTicketComment(db, params), { type });
    assert.equal(queries.length, 0);
  }
});
