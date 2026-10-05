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
import {resolveRejectionProposal} from './rejection-proposal';

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
    assertTicket?: (ticket: Ticket) => void;
    authorizeTicket?: (ticket: Ticket) => Promise<Record<string, unknown>>;
  },
): Promise<Ticket> {
  const { tenantId, ticketId, actorId, actorRole, permittedRoles, to, patch, eventType } = options;
  const eventPayload = { ...options.eventPayload };
  const result=await executeWorkflowTransition(db, {
    tenantId,
    ticketId,
    actorId,
    actorRole,
    permittedRoles,
    to,
    patch,
    eventType,
    eventPayload,
    readTicket: async () => {
      const ticket = await (options.visibility
        ? repo.findById(db, tenantId, ticketId, options.visibility)
        : repo.findByIdInternal(db, tenantId, ticketId)
      );
      if (ticket && options.assertTicket) options.assertTicket(ticket);
      if (ticket && options.authorizeTicket) {
        eventPayload.reviewAuthority = await options.authorizeTicket(ticket);
      }
      return ticket;
    },
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
  if(to==='RETURNED_FOR_CORRECTION'||to==='REQUESTER_CANCELED'||to==='SURVEY_CANCELED'){
    await resolveRejectionProposal(db,{tenantId,ticketId,actorId,actorRole},'SUPERSEDED');
    await db.query('UPDATE survey_work_delegations SET ended_at=now(),end_reason=$3 WHERE tenant_id=$1 AND ticket_id=$2 AND ended_at IS NULL',[tenantId,ticketId,to]);
  }
  return result;
}
