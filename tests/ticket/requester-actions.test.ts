import assert from 'node:assert/strict';
import test from 'node:test';
import { getRequesterActions } from '@/modules/ticket/application/requester-actions';
import type { ITicketRepository, VisibilityScope } from '@/modules/ticket/application/ports';
import type { Ticket, TicketStatus } from '@/modules/ticket/domain/types';
import type { DbClient, UUID } from '@/shared/types';

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}` as UUID;
const ticket = { tenantId: id(1), projectId: id(2), requesterId: id(3), companyId: id(4),
  status: 'SUBMITTED', workflowVariant: 'STANDARD_APPROVAL', draftDeletedAt: null } as Ticket;
const actor: VisibilityScope = { actorId: id(3), actorRole: 'REQUESTER', companyId: id(4), companyType: 'GC' };
const db: DbClient = { async query() { throw new Error('No direct SQL in application'); } };
const repo = {
  findActiveProjectCrewBuild: async () => 'MEDIUM', isDraftOwnerAllowed: async () => true,
} as unknown as ITicketRepository;

test('requester actions follow both workflow variants and terminal restrictions', async () => {
  for (const variant of ['STANDARD_APPROVAL', 'DIRECT_ASSIGNMENT'] as const) {
    const active: TicketStatus[] = variant === 'STANDARD_APPROVAL'
      ? ['SUBMITTED', 'APPROVED', 'REJECTED', 'ASSIGNED', 'IN_PROGRESS', 'PENDING_PC_APPROVAL', 'DELAYED']
      : ['CREATED', 'ASSIGNED', 'IN_PROGRESS', 'PENDING_PC_APPROVAL', 'DELAYED'];
    for (const status of active) {
      const actions = await getRequesterActions(repo, db, { ...ticket, workflowVariant: variant, status }, actor);
      assert.equal(actions.canCancel, true, `${variant}/${status}`);
      assert.equal(actions.canResubmit, status === 'REJECTED');
    }
    for (const status of ['DRAFT', 'COMPLETED', 'REQUESTER_CANCELED', 'FIELD_CANCELED', 'SURVEY_CANCELED'] as const) {
      assert.deepEqual(await getRequesterActions(repo, db, { ...ticket, workflowVariant: variant, status }, actor),
        { canCancel: false, canResubmit: false });
    }
  }
});

test('requester actions exclude peers, tenant administrators, archived projects and isolated companies', async () => {
  const rejected = { ...ticket, status: 'REJECTED' as const };
  for (const scope of [
    { ...actor, actorId: id(9) },
    { ...actor, actorRole: 'TENANT_ADMIN' as const },
    { ...actor, actorRole: 'BILLING_VIEWER' as const },
    { ...actor, companyType: 'SUBCONTRACTOR' as const, companyId: id(9) },
  ]) assert.deepEqual(await getRequesterActions(repo, db, rejected, scope), { canCancel: false, canResubmit: false });
  assert.deepEqual(await getRequesterActions({ ...repo, findActiveProjectCrewBuild: async () => null }, db, rejected, actor),
    { canCancel: false, canResubmit: false });
  assert.deepEqual(await getRequesterActions({ ...repo, isDraftOwnerAllowed: async () => false }, db, rejected,
    { ...actor, actorRole: 'SURVEY_MANAGER' }), { canCancel: true, canResubmit: false });
  await assert.rejects(getRequesterActions({ ...repo, findActiveProjectCrewBuild: async () => { throw new Error('database unavailable'); } },
    db, rejected, actor), /database unavailable/);
});
