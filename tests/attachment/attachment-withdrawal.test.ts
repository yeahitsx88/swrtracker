import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWithdrawalReason, withdrawAttachment } from '@/modules/attachment/application/withdraw-attachment';
import type { DbClient, UUID } from '@/shared/types';

const ids = {
  tenant: '10000000-0000-4000-8000-000000000001' as UUID, ticket: '10000000-0000-4000-8000-000000000101' as UUID,
  file: '10000000-0000-4000-8000-000000000201' as UUID, requester: '10000000-0000-4000-8000-000000000014' as UUID,
  other: '10000000-0000-4000-8000-000000000015' as UUID, im: '10000000-0000-4000-8000-000000000013' as UUID,
};

function fakeDb(row: Record<string, unknown> | null, updated = true) {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    async query(sql: string, params: unknown[] = []) {
      queries.push({ sql, params });
      if (/FROM attachments WHERE/.test(sql) && /FOR UPDATE/.test(sql)) return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      if (/UPDATE attachments SET withdrawn_at/.test(sql)) return { rows: updated ? [{ withdrawn_at: new Date('2026-10-09T12:00:00Z') }] : [], rowCount: updated ? 1 : 0 };
      return { rows: [], rowCount: 1 };
    },
  } as unknown as DbClient;
  return { db, queries };
}

const instruction = { uploaded_by: ids.requester, purpose: 'REQUEST_INSTRUCTION', filename: 'plan.pdf', content_sha256: 'a'.repeat(64), withdrawn_at: null };
const base = {
  tenantId: ids.tenant, ticketId: ids.ticket, attachmentId: ids.file, actorId: ids.requester, actorRole: 'REQUESTER' as const,
  reason: 'Wrong revision attached', projectStatus: 'ACTIVE' as const,
  ticket: { status: 'RETURNED_FOR_CORRECTION' as const, requesterId: ids.requester, assignedPartyChiefId: null, assignedInstrumentManId: null },
};

test('withdrawal reasons are trimmed and bounded', () => {
  assert.equal(normalizeWithdrawalReason('  wrong   file '), 'wrong file');
  for (const bad of ['', 'no', 7, 'x'.repeat(501)]) assert.throws(() => normalizeWithdrawalReason(bad), { type: 'ValidationError' });
});

test('the uploader withdraws a request file while it is still editable; update and audit are written', async () => {
  const { db, queries } = fakeDb(instruction);
  const result = await withdrawAttachment(db, base);
  assert.equal(result.attachmentId, ids.file);
  assert.ok(queries.some(q => /UPDATE attachments SET withdrawn_at/.test(q.sql) && q.params[3] === ids.requester));
  const audit = queries.find(q => /INSERT INTO ticket_events/.test(q.sql));
  assert.ok(audit, 'audit event written');
  assert.ok(JSON.stringify(audit.params).includes('attachment.withdrawn'));
});

test('someone other than the uploader is refused before any write', async () => {
  const { db, queries } = fakeDb(instruction);
  await assert.rejects(withdrawAttachment(db, { ...base, actorId: ids.other }), { type: 'ForbiddenError' });
  assert.ok(!queries.some(q => /UPDATE attachments/.test(q.sql)));
});

test('a second withdrawal is a conflict', async () => {
  const { db } = fakeDb({ ...instruction, withdrawn_at: new Date() });
  await assert.rejects(withdrawAttachment(db, base), { code: 'ATTACHMENT_ALREADY_WITHDRAWN' });
});

test('request files cannot be withdrawn once the request is back in review', async () => {
  const { db, queries } = fakeDb(instruction);
  await assert.rejects(withdrawAttachment(db, { ...base, ticket: { ...base.ticket, status: 'SUBMITTED' } }), { type: 'ConflictError' });
  assert.ok(!queries.some(q => /UPDATE attachments/.test(q.sql)));
});

test('field files follow field-support rules; archived projects are read-only; missing file is not found', async () => {
  const field = { ...instruction, uploaded_by: ids.im, purpose: 'FIELD_SUPPORT' };
  const active = { ...base, actorId: ids.im, actorRole: 'INSTRUMENT_MAN' as const,
    ticket: { status: 'IN_PROGRESS' as const, requesterId: ids.requester, assignedPartyChiefId: null, assignedInstrumentManId: ids.im } };
  await withdrawAttachment(fakeDb(field).db, active);
  await assert.rejects(withdrawAttachment(fakeDb(field).db, { ...active, ticket: { ...active.ticket, status: 'COMPLETED' } }), { type: 'ConflictError' });
  await assert.rejects(withdrawAttachment(fakeDb(field).db, { ...active, projectStatus: 'ARCHIVED' }), { type: 'ConflictError' });
  await assert.rejects(withdrawAttachment(fakeDb(null).db, base), { type: 'NotFoundError' });
});

test('a concurrent withdrawal that wins first surfaces as a stale-state conflict', async () => {
  const { db, queries } = fakeDb(instruction, false);
  await assert.rejects(withdrawAttachment(db, base), { code: 'WORKFLOW_STALE_STATE' });
  assert.ok(!queries.some(q => /INSERT INTO ticket_events/.test(q.sql)));
});
