import assert from 'node:assert/strict';
import test from 'node:test';
import type { DbClient, UUID } from '@/shared/types';
import type { Ticket } from '@/modules/ticket/domain/types';
import { NotFoundError } from '@/shared/errors';
import type { ITicketRepository } from '@/modules/ticket/application/ports';
import { saveDraft, deleteDraft, recoverDraft, listRecoverableDrafts } from '@/modules/ticket/application/drafts';
import { expireStaleDrafts } from '@/modules/ticket/application/draft-maintenance';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}` as UUID;
const tenantId = id(1), projectId = id(2), requesterId = id(3), companyId = id(4), ticketId = id(5);

test('explicit partial save allocates no ticket number and emits draft event after persistence', async () => {
  const writes: string[] = [];
  let saved: Ticket | undefined;
  const db: DbClient = { async query(sql) { writes.push(sql); return { rows: [] }; } };
  const repo = {
    isDraftOwnerAllowed: async () => true,
    save: async (_db: DbClient, ticket: Ticket) => { saved = ticket; writes.push('save'); },
    saveCadWork: async () => { writes.push('cad'); },
    nextSequence: async () => { throw new Error('sequence must wait until submit'); },
  } as unknown as ITicketRepository;
  const draft = await saveDraft(repo, db, { tenantId, projectId, requesterId, companyId,
    fields: { craft: 'Pipe' } });
  assert.equal(draft.ticketNumber, null);
  assert.equal(draft.ticketType, null);
  assert.equal(draft.requestedDate, null);
  assert.equal(saved?.status, 'DRAFT');
  assert.deepEqual(writes.slice(0, 2), ['save', 'cad']);
  assert.equal(writes.filter(sql => /INSERT INTO ticket_events/.test(sql)).length, 2);
});

test('draft save and recovery reject wrong tenant, actor, or window before writes', async () => {
  const writes: string[] = [];
  const db: DbClient = { async query(sql) { writes.push(sql); return { rows: [] }; } };
  const base = { id: ticketId, tenantId, projectId, requesterId, companyId,
    status: 'DRAFT', draftDeletedAt: new Date(), draftDeletedReason: 'REQUESTER_DELETED' } as Ticket;
  const repo = {
    isDraftOwnerAllowed: async () => false,
    findByIdInternal: async (_db: DbClient, tenant: UUID) => tenant === tenantId ? base : null,
    patchTicket: async () => { writes.push('patch'); },
  } as unknown as ITicketRepository;
  await assert.rejects(saveDraft(repo, db, { tenantId, projectId, requesterId,
    companyId, fields: {} }));
  await assert.rejects(deleteDraft(repo, db, { tenantId: id(9), ticketId, requesterId }));
  await assert.rejects(recoverDraft(repo, db, { tenantId, projectId, ticketId,
    actorId: requesterId, actorRole: 'REQUESTER', reason: 'Long enough reason' }));
  assert.deepEqual(writes, []);
});

test('stale draft expiry writes the soft delete before the audit event', async () => {
  const writes: string[] = [];
  const db: DbClient = { async query(sql) { writes.push(sql); return { rows: [] }; } };
  const draft = { id: ticketId, requesterId, createdAt: new Date('2026-01-01'),
    draftLastSavedAt: new Date('2026-01-02') } as Ticket;
  const repo = {
    findStaleDraftsForExpiry: async () => [draft],
    patchTicket: async () => { writes.push('patch'); },
  } as unknown as ITicketRepository;
  assert.equal(await expireStaleDrafts(repo, db, tenantId), 1);
  assert.equal(writes[0], 'patch');
  assert.match(writes[1] ?? '', /INSERT INTO ticket_events/);
});

test('subcontractor Project Admin cannot recover another company draft', async () => {
  const writes: string[] = [];
  const adminId = id(6), otherCompanyId = id(7);
  const draft = { id: ticketId, tenantId, projectId, requesterId,
    companyId: otherCompanyId, status: 'DRAFT',
    draftDeletedAt: new Date(), draftDeletedReason: 'REQUESTER_DELETED' } as Ticket;
  const db: DbClient = { async query(sql) { writes.push(sql); return { rows: [] }; } };
  const repo = {
    findUserCompanyInfo: async () => ({ companyId, companyType: 'SUBCONTRACTOR' }),
    findByIdInternal: async () => draft,
    patchTicket: async () => { writes.push('patch'); },
  } as unknown as ITicketRepository;
  const context = { tenantId, projectId, ticketId, actorId: adminId,
    actorRole: 'PROJECT_ADMIN' as const, reason: 'Requester needs this draft' };
  await assert.rejects(recoverDraft(repo, db, context), NotFoundError);
  assert.deepEqual(writes, []);
  repo.findUserCompanyInfo = async () => ({ companyId: otherCompanyId,
    companyType: 'SUBCONTRACTOR' });
  await recoverDraft(repo, db, context);
  assert.equal(writes[0], 'patch');
  assert.match(writes[1] ?? '', /INSERT INTO ticket_events/);
});

test('deleted draft listing binds the actor company in both page queries', async () => {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const adminId = id(6);
  const db: DbClient = { async query<T extends object = Record<string, unknown>>(sql: string,
    params?: unknown[]): Promise<{ rows: T[] }> {
    queries.push({ sql, params: params ?? [] });
    return { rows: (queries.length === 1 ? [{ total: '0' }] : []) as T[] };
  } };
  await listRecoverableDrafts(new TicketRepository(), db, {
    tenantId, projectId, actorId: adminId,
    actorRole: 'PROJECT_ADMIN', limit: 20, offset: 0 });
  assert.equal(queries.length, 2);
  for (const query of queries) {
    assert.match(query.sql, /c\.type<>'SUBCONTRACTOR' OR t\.company_id=u\.company_id/);
    assert.deepEqual(query.params.slice(0, 3), [tenantId, projectId, adminId]);
  }
});
