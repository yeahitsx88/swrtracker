/**
 * Shared helpers for ticket use cases.
 * performTransition delegates to the workflow kernel so transition rules,
 * role gating, and audit emission remain centralized.
 */
import {
  executeWorkflowTransition,
  assertWorkflowActorHasRole,
} from '@/modules/workflow/application';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { AuditEventType } from '@/modules/audit/domain/types';
import type { Ticket, TicketStatus } from '../domain/types';
import type { ITicketRepository, TicketStatusPatch, VisibilityScope } from './ports';

export function assertActorHasRole(
  actorRole: ProjectRole,
  permittedRoles: readonly ProjectRole[],
): void {
  assertWorkflowActorHasRole(actorRole, permittedRoles);
}

export async function performTransition(
  db: DbClient,
  repo: ITicketRepository,
  options: {
    tenantId:       UUID;
    ticketId:       UUID;
    actorId:        UUID;
    actorRole:      ProjectRole;
    permittedRoles: readonly ProjectRole[];
    to:             TicketStatus;
    patch:          Omit<TicketStatusPatch, 'status'>;
    eventType:      AuditEventType;
    eventPayload?:  Record<string, unknown>;
    visibility?:    VisibilityScope;
  },
): Promise<Ticket> {
  const { tenantId, ticketId, actorId, actorRole, permittedRoles, to, patch, eventType } = options;
  return executeWorkflowTransition(db, {
    tenantId,
    ticketId,
    actorId,
    actorRole,
    permittedRoles,
    to,
    patch,
    eventType,
    eventPayload: options.eventPayload,
    readTicket: () => (
      options.visibility
        ? repo.findById(db, tenantId, ticketId, options.visibility)
        : repo.findByIdInternal(db, tenantId, ticketId)
    ),
    patchTicket: (nextPatch, expected) =>
      repo.patchTicket(
        db,
        tenantId,
        ticketId,
        nextPatch as TicketStatusPatch,
        {
          expectedStatus: expected.status,
          expectedRowVersion: expected.rowVersion,
        },
      ),
    buildResult: (ticket) => ({
      ...ticket,
      ...patch,
      status: to,
      rowVersion: (ticket.rowVersion ?? 0) + 1,
      updatedAt: new Date(),
    }),
  });
}
