/**
 * Shared helpers for ticket use cases.
 * performTransition is the single chokepoint for all state changes —
 * it calls assertValidTransition, patches the DB, and logs the audit event
 * atomically within the caller's transaction.
 */
import { ForbiddenError, NotFoundError } from '@/shared/errors';
import { assertValidTransition } from '@/modules/workflow/domain/transitions';
import { appendAuditEvent } from '@/modules/audit/application/index';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { AuditEventType } from '@/modules/audit/domain/types';
import type { Ticket, TicketStatus } from '../domain/types';
import type { ITicketRepository, TicketStatusPatch } from './ports';

export function assertActorHasRole(
  actorRole: ProjectRole,
  permittedRoles: readonly ProjectRole[],
): void {
  if (!permittedRoles.includes(actorRole)) {
    throw new ForbiddenError(
      `This action requires one of: ${permittedRoles.join(', ')}`,
    );
  }
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
  },
): Promise<Ticket> {
  const { tenantId, ticketId, actorId, actorRole, permittedRoles, to, patch, eventType } = options;

  const ticket = await repo.findByIdInternal(db, tenantId, ticketId);
  if (!ticket) throw new NotFoundError(`Ticket ${ticketId} not found`);

  assertActorHasRole(actorRole, permittedRoles);
  assertValidTransition(ticket.workflowVariant, ticket.status, to);

  await repo.patchTicket(db, tenantId, ticketId, { ...patch, status: to });
  await appendAuditEvent(db, {
    ticketId,
    tenantId,
    actorId,
    eventType,
    payload: options.eventPayload ?? {},
  });

  // Return ticket with updated status applied
  return { ...ticket, ...patch, status: to, updatedAt: new Date() };
}
