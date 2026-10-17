import test from 'node:test';
import assert from 'node:assert/strict';
import { ConflictError, ForbiddenError } from '@/shared/errors';
import { executeWorkflowTransition } from '@/modules/workflow/application';
import type { DbClient, UUID } from '@/shared/types';

type KernelTicket = {
  id: UUID;
  tenantId: UUID;
  workflowVariant: 'STANDARD_APPROVAL';
  status: 'SUBMITTED' | 'APPROVED';
};

const db: DbClient = {
  query: async () => ({ rows: [] }),
};

const tenantId = 'tenant-1' as UUID;
const ticketId = 'ticket-1' as UUID;
const actorId = 'actor-1' as UUID;

test('executeWorkflowTransition applies happy-path transition and audit write', async () => {
  let patchedStatus: string | null = null;
  let auditInsertCount = 0;
  const auditDb: DbClient = {
    query: async (queryText: string) => {
      if (queryText.includes('INSERT INTO ticket_events')) {
        auditInsertCount += 1;
      }
      return { rows: [] };
    },
  };

  const result = await executeWorkflowTransition<KernelTicket>(auditDb, {
    tenantId,
    ticketId,
    actorId,
    actorRole: 'SURVEY_MANAGER',
    permittedRoles: ['SURVEY_MANAGER'],
    to: 'APPROVED',
    patch: { approvedAt: new Date('2026-03-04T12:00:00Z') },
    eventType: 'ticket.approved',
    readTicket: async () => ({
      id: ticketId,
      tenantId,
      workflowVariant: 'STANDARD_APPROVAL',
      status: 'SUBMITTED',
    }),
    patchTicket: async (patch) => {
      patchedStatus = patch.status;
    },
    buildResult: (ticket) => ({ ...ticket, status: 'APPROVED' }),
  });

  assert.equal(patchedStatus, 'APPROVED');
  assert.equal(result.status, 'APPROVED');
  assert.equal(auditInsertCount, 1);
});

test('executeWorkflowTransition rejects unauthorized actors', async () => {
  await assert.rejects(
    () =>
      executeWorkflowTransition<KernelTicket>(db, {
        tenantId,
        ticketId,
        actorId,
        actorRole: 'REQUESTER',
        permittedRoles: ['SURVEY_MANAGER'],
        to: 'APPROVED',
        patch: {},
        eventType: 'ticket.approved',
        readTicket: async () => ({
          id: ticketId,
          tenantId,
          workflowVariant: 'STANDARD_APPROVAL',
          status: 'SUBMITTED',
        }),
        patchTicket: async () => undefined,
        buildResult: (ticket) => ticket,
      }),
    ForbiddenError,
  );
});

test('executeWorkflowTransition rejects invalid state changes', async () => {
  await assert.rejects(
    () =>
      executeWorkflowTransition<KernelTicket>(db, {
        tenantId,
        ticketId,
        actorId,
        actorRole: 'SURVEY_MANAGER',
        permittedRoles: ['SURVEY_MANAGER'],
        to: 'APPROVED',
        patch: {},
        eventType: 'ticket.approved',
        readTicket: async () => ({
          id: ticketId,
          tenantId,
          workflowVariant: 'STANDARD_APPROVAL',
          status: 'APPROVED',
        }),
        patchTicket: async () => undefined,
        buildResult: (ticket) => ticket,
      }),
    ConflictError,
  );
});

test('executeWorkflowTransition returns deterministic stale-state conflicts', async () => {
  await assert.rejects(
    () =>
      executeWorkflowTransition<KernelTicket>(db, {
        tenantId,
        ticketId,
        actorId,
        actorRole: 'SURVEY_MANAGER',
        permittedRoles: ['SURVEY_MANAGER'],
        to: 'APPROVED',
        patch: {},
        eventType: 'ticket.approved',
        readTicket: async () => ({
          id: ticketId,
          tenantId,
          workflowVariant: 'STANDARD_APPROVAL',
          status: 'SUBMITTED',
          rowVersion: 4,
        }),
        patchTicket: async () => {
          throw new ConflictError(
            'Ticket changed since it was loaded. Refresh and retry your action.',
            'WORKFLOW_STALE_STATE',
          );
        },
        buildResult: (ticket) => ticket,
      }),
    (err: unknown) =>
      err instanceof ConflictError &&
      err.code === 'WORKFLOW_STALE_STATE',
  );
});

test('executeWorkflowTransition does not append audit event when stale-state conflict occurs', async () => {
  let auditInsertCount = 0;
  const auditDb: DbClient = {
    query: async (queryText: string) => {
      if (queryText.includes('INSERT INTO ticket_events')) {
        auditInsertCount += 1;
      }
      return { rows: [] };
    },
  };

  await assert.rejects(
    () =>
      executeWorkflowTransition<KernelTicket>(auditDb, {
        tenantId,
        ticketId,
        actorId,
        actorRole: 'SURVEY_MANAGER',
        permittedRoles: ['SURVEY_MANAGER'],
        to: 'APPROVED',
        patch: {},
        eventType: 'ticket.approved',
        readTicket: async () => ({
          id: ticketId,
          tenantId,
          workflowVariant: 'STANDARD_APPROVAL',
          status: 'SUBMITTED',
          rowVersion: 1,
        }),
        patchTicket: async () => {
          throw new ConflictError(
            'Ticket changed since it was loaded. Refresh and retry your action.',
            'WORKFLOW_STALE_STATE',
          );
        },
        buildResult: (ticket) => ticket,
      }),
    ConflictError,
  );

  assert.equal(auditInsertCount, 0);
});
