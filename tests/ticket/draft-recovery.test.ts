import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteDraft } from '@/modules/ticket/application/delete-draft';
import { recoverDraft } from '@/modules/ticket/application/recover-draft';
import { lockDraftActor } from '@/modules/ticket/application/draft-access';
import { parseRequesterIntake, parseNeedBy } from '@/lib/requester-intake-input';
import { buildVisibilityClause } from '@/lib/ticket-visibility-clause';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
const scope = { tenantId: 'tenant' as UUID, projectId: 'project' as UUID, ticketId: 'ticket' as UUID,
  actorId: 'owner' as UUID, expectedVersion: 2, sessionVersion: 1, reason: 'Recovered at requester request' };
function harness(overrides: Record<string, unknown> = {}, activeOwner = true) {
  const calls: { sql: string; values?: unknown[] }[] = [];
  const draft = { requester_id: scope.actorId, status: 'DRAFT', row_version: 2,
    draft_deleted_at: null, recoverable: true, ...overrides };
  const db = { query: async (sql: string, values?: unknown[]) => {
    calls.push({ sql, values });
    return { rows: sql.startsWith('SELECT requester_id') ? [draft] :
      sql.startsWith('SELECT u.id') ? activeOwner ? [{ id: scope.actorId }] : [] : [] };
  } } as DbClient;
  return { db, calls };
}
test('delete is an owner-only version-fenced soft change with append-only audit', async () => {
  const h = harness(); await deleteDraft(h.db, scope);
  assert.match(h.calls[0]!.sql, /tenant_id = \$1 AND project_id = \$2 AND id = \$3 FOR UPDATE/);
  assert.match(h.calls[1]!.sql, /draft_deleted_reason = 'REQUESTER_DELETED'/);
  assert.equal(h.calls[2]!.values?.[4], 'ticket.draft_deleted');
  assert.ok(h.calls.every(c => !/\bDELETE\b/.test(c.sql)));
});
test('invalid state, foreign owner, missing/deleted and stale draft deletion cause no write', async () => {
  for (const [override, error] of [[{ status: 'SUBMITTED' }, ConflictError], [{ requester_id: 'other' }, ForbiddenError],
    [{ draft_deleted_at: new Date() }, NotFoundError], [{ row_version: 3 }, ConflictError]] as const) {
    const h = harness(override); await assert.rejects(() => deleteDraft(h.db, scope), error);
    assert.equal(h.calls.length, 1);
  }
});
test('restore keeps identity/files and requires current requester, reason, window and version', async () => {
  const h = harness({ draft_deleted_at: new Date() }); await recoverDraft(h.db, scope);
  assert.equal(h.calls.at(-1)!.values?.[4], 'ticket.draft_recovered');
  assert.ok(h.calls.every(c => !/DELETE|attachments|ticket_number\s*=/.test(c.sql)));
  for (const [override, active, error] of [[{ recoverable: false }, true, ConflictError], [{ row_version: 3 }, true, ConflictError],
    [{ status: 'SUBMITTED' }, true, NotFoundError], [{}, false, ConflictError]] as const) {
    const denied = harness({ draft_deleted_at: new Date(), ...override }, active);
    await assert.rejects(() => recoverDraft(denied.db, scope), error);
    assert.ok(denied.calls.every(c => !c.sql.startsWith('UPDATE')));
  }
  await assert.rejects(() => recoverDraft(h.db, { ...scope, reason: 'short' }), ValidationError);
});
test('draft authority locks current project membership and never derives recovery from tenant role', async () => {
  const h = harness(); await assert.rejects(() => lockDraftActor(h.db, scope, 'PROJECT_ADMIN'), ForbiddenError);
  assert.match(h.calls[0]!.sql, /pm.role = \$4/); assert.match(h.calls[0]!.sql, /u.session_version = \$5/);
  assert.match(h.calls[0]!.sql, /FOR SHARE OF pm, p, u, c/); assert.equal(h.calls[0]!.values?.[3], 'PROJECT_ADMIN');
});
test('partial intake accepts omissions/nulls but rejects malformed supplied values and rollover dates', () => {
  assert.deepEqual(parseRequesterIntake({}).changes, {});
  assert.deepEqual(parseRequesterIntake({ aorNodeId: null, ticketType: null, requestedDate: null, description: '' }).changes,
    { aorNodeId: null, ticketType: null, requestedDate: null, description: '' });
  assert.equal(parseNeedBy('2028-02-29')?.toISOString(), '2028-02-29T00:00:00.000Z');
  for (const body of [null, [], { aorNodeId: {} }, { aorNodeId: 'bad' }, { ticketType: 'unknown' },
    { description: 2 }, { requestedDate: '2026-02-30' }, { expectedVersion: -1 }]) {
    assert.throws(() => parseRequesterIntake(body), ValidationError);
  }
});
test('normal visibility predicates hide deleted drafts for every operational role and company viewers cannot read coworker drafts', () => {
  for (const role of ['SURVEY_MANAGER','VIEWER','REQUESTER','PROJECT_ADMIN','PARTY_CHIEF','INSTRUMENT_MAN','SURVEY_SUPERINTENDENT'] as const) {
    assert.match(buildVisibilityClause({ actorId: scope.actorId, actorRole: role, companyId: 'company' as UUID }, 1).sql, /draft_deleted_at IS NULL/);
  }
  const company = buildVisibilityClause({ actorId: scope.actorId, actorRole: 'REQUESTER', projectId: scope.projectId,
    companyId: 'company' as UUID, companyType: 'SUBCONTRACTOR' }, 1);
  assert.match(company.sql, /t.status <> 'DRAFT'/);
});
