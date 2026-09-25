import assert from 'node:assert/strict';
import test from 'node:test';
import { getReviewActions } from '@/modules/ticket/application/review-actions';
import type { ITicketRepository, VisibilityScope } from '@/modules/ticket/application/ports';
import type { Ticket } from '@/modules/ticket/domain/types';
import type { DbClient, UUID } from '@/shared/types';

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}` as UUID;
const ticket = { tenantId: id(1), projectId: id(2), requesterId: id(3), companyId: id(4),
  status: 'SUBMITTED', workflowVariant: 'STANDARD_APPROVAL', draftDeletedAt: null,
  surveyLeadId: null, surveyManagerId: null } as Ticket;
const actor: VisibilityScope = { actorId: id(5), actorRole: 'SURVEY_MANAGER', companyId: id(4), companyType: 'GC' };
const db: DbClient = { async query() { throw new Error('No direct SQL'); } };
const repo = { findActiveProjectCrewBuild: async () => 'FULL' } as unknown as ITicketRepository;

test('review capability requires active standard submitted ticket and independent survey manager', async () => {
  assert.deepEqual(await getReviewActions(repo, db, ticket, actor), { canReview: true, canOverride: false });
  for (const role of ['REQUESTER', 'PROJECT_ADMIN', 'TENANT_ADMIN', 'PARTY_CHIEF', 'SURVEY_SUPERINTENDENT', 'BILLING_VIEWER'] as const) {
    assert.deepEqual(await getReviewActions(repo, db, ticket, { ...actor, actorRole: role }), { canReview: false, canOverride: false });
  }
  for (const field of ['requesterId', 'surveyLeadId', 'surveyManagerId'] as const) {
    assert.deepEqual(await getReviewActions(repo, db, { ...ticket, [field]: actor.actorId }, actor), { canReview: false, canOverride: false });
  }
  for (const status of ['DRAFT', 'APPROVED', 'CREATED', 'ASSIGNED', 'IN_PROGRESS', 'DELAYED',
    'PENDING_PC_APPROVAL', 'COMPLETED', 'REQUESTER_CANCELED', 'FIELD_CANCELED', 'SURVEY_CANCELED'] as const) {
    assert.deepEqual(await getReviewActions(repo, db, { ...ticket, status }, actor), { canReview: false, canOverride: false });
  }
  assert.deepEqual(await getReviewActions(repo, db, { ...ticket, workflowVariant: 'DIRECT_ASSIGNMENT' }, actor), { canReview: false, canOverride: false });
  assert.deepEqual(await getReviewActions(repo, db, ticket, { ...actor, companyType: 'SUBCONTRACTOR', companyId: id(9) }), { canReview: false, canOverride: false });
  assert.deepEqual(await getReviewActions({ ...repo, findActiveProjectCrewBuild: async () => null }, db, ticket, actor), { canReview: false, canOverride: false });
  await assert.rejects(getReviewActions({ ...repo, findActiveProjectCrewBuild: async () => { throw new Error('offline'); } }, db, ticket, actor), /offline/);
});

test('override capability requires an independent manager and an active rejected standard ticket', async () => {
  const rejected = { ...ticket, status: 'REJECTED' as const };
  const denied = { canReview: false, canOverride: false };
  assert.deepEqual(await getReviewActions(repo, db, rejected, actor), { canReview: false, canOverride: true });
  for (const field of ['requesterId', 'surveyLeadId', 'surveyManagerId'] as const) {
    assert.deepEqual(await getReviewActions(repo, db, { ...rejected, [field]: actor.actorId }, actor), denied);
  }
  for (const actorRole of ['REQUESTER', 'PARTY_CHIEF', 'SURVEY_SUPERINTENDENT', 'TENANT_ADMIN', 'PROJECT_ADMIN'] as const) {
    assert.deepEqual(await getReviewActions(repo, db, rejected, { ...actor, actorRole }), denied);
  }
  assert.deepEqual(await getReviewActions(repo, db, rejected, { ...actor, companyType: 'SUBCONTRACTOR', companyId: id(9) }), denied);
  assert.deepEqual(await getReviewActions(repo, db, { ...rejected, workflowVariant: 'DIRECT_ASSIGNMENT' }, actor), denied);
  assert.deepEqual(await getReviewActions(repo, db, { ...rejected, draftDeletedAt: new Date() }, actor), denied);
  assert.deepEqual(await getReviewActions({ ...repo, findActiveProjectCrewBuild: async () => null }, db, rejected, actor), denied);
  await assert.rejects(getReviewActions({ ...repo, findActiveProjectCrewBuild: async () => { throw new Error('offline'); } }, db, rejected, actor), /offline/);
});
