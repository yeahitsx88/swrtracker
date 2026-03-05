import { ForbiddenError, NotFoundError } from '@/shared/errors';
import { appendAuditEvent } from '@/modules/audit/application';
import type { AuditEventType } from '@/modules/audit/domain/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import { logError, logInfo } from '@/lib/observability';
import { assertValidTransition, type TicketStatus, type WorkflowVariant } from '../domain/transitions';
import type { DbClient, UUID } from '@/shared/types';

export interface WorkflowKernelTicket {
  id: UUID;
  tenantId: UUID;
  workflowVariant: WorkflowVariant;
  status: TicketStatus;
}

export interface WorkflowKernelTransitionPatch {
  status: TicketStatus;
  [key: string]: unknown;
}

export interface WorkflowKernelCommand<TTicket extends WorkflowKernelTicket> {
  tenantId: UUID;
  ticketId: UUID;
  actorId: UUID;
  actorRole: ProjectRole;
  permittedRoles: readonly ProjectRole[];
  to: TicketStatus;
  patch: Omit<WorkflowKernelTransitionPatch, 'status'>;
  eventType: AuditEventType;
  eventPayload?: Record<string, unknown>;
  readTicket: () => Promise<TTicket | null>;
  patchTicket: (patch: WorkflowKernelTransitionPatch) => Promise<void>;
  buildResult: (ticket: TTicket) => TTicket;
}

export function assertWorkflowActorHasRole(
  actorRole: ProjectRole,
  permittedRoles: readonly ProjectRole[],
): void {
  if (!permittedRoles.includes(actorRole)) {
    throw new ForbiddenError(`This action requires one of: ${permittedRoles.join(', ')}`);
  }
}

export async function executeWorkflowTransition<TTicket extends WorkflowKernelTicket>(
  db: DbClient,
  command: WorkflowKernelCommand<TTicket>,
): Promise<TTicket> {
  try {
    const ticket = await command.readTicket();
    if (!ticket) {
      throw new NotFoundError(`Ticket ${command.ticketId} not found`);
    }

    assertWorkflowActorHasRole(command.actorRole, command.permittedRoles);
    assertValidTransition(ticket.workflowVariant, ticket.status, command.to);

    await command.patchTicket({ ...command.patch, status: command.to });
    await appendAuditEvent(db, {
      ticketId: command.ticketId,
      tenantId: command.tenantId,
      actorId: command.actorId,
      eventType: command.eventType,
      payload: command.eventPayload ?? {},
    });

    logInfo('Workflow transition committed', {
      eventType: command.eventType,
      tenantId: command.tenantId,
      ticketId: command.ticketId,
      actorId: command.actorId,
      from_status: ticket.status,
      to_status: command.to,
      workflow_variant: ticket.workflowVariant,
    });
    return command.buildResult(ticket);
  } catch (err) {
    logError(
      'Workflow transition failed',
      {
        eventType: 'workflow.transition_failed',
        tenantId: command.tenantId,
        ticketId: command.ticketId,
        actorId: command.actorId,
        to_status: command.to,
      },
      err,
    );
    throw err;
  }
}
