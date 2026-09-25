import type { ProjectRole } from '@/modules/identity/domain/types';
import type { UUID } from '@/shared/types';
import { assertValidTransition } from '@/modules/workflow/domain/transitions';
import type { Ticket } from '../domain/types';

export interface TicketCapabilities {
  canEditRequesterFields: boolean;
  canSubmit: boolean;
  canRequesterCancel: boolean;
  canCreateFollowUp: boolean;
  canUploadRequestInstruction: boolean;
  canUploadFieldSupport: boolean;
}

const REQUESTER_EDITABLE = new Set(['DRAFT', 'RETURNED_FOR_CORRECTION']);
const FIELD_SUPPORT_ACTIVE = new Set([
  'APPROVED', 'ASSIGNED', 'IN_PROGRESS', 'PENDING_FIELD_VALIDATION', 'DELAYED',
]);

function transitionIsAllowed(ticket: Ticket, to: 'REQUESTER_CANCELED'): boolean {
  try {
    assertValidTransition(ticket.workflowVariant, ticket.status, to);
    return true;
  } catch {
    return false;
  }
}

export function getTicketCapabilities(
  ticket: Ticket,
  actor: { id: UUID; role: ProjectRole },
): TicketCapabilities {
  const ownsRequest = actor.role === 'REQUESTER' && ticket.requesterId === actor.id;
  const requesterEditable = ownsRequest && REQUESTER_EDITABLE.has(ticket.status);
  const fieldSupportActive = FIELD_SUPPORT_ACTIVE.has(ticket.status);
  const canUploadFieldSupport = fieldSupportActive && (
    actor.role === 'SURVEY_MANAGER' ||
    (actor.role === 'PARTY_CHIEF' && ticket.assignedPartyChiefId === actor.id) ||
    (actor.role === 'INSTRUMENT_MAN' && ticket.assignedInstrumentManId === actor.id)
  );

  return {
    canEditRequesterFields: requesterEditable,
    canSubmit: requesterEditable,
    canRequesterCancel: ownsRequest && transitionIsAllowed(ticket, 'REQUESTER_CANCELED'),
    canCreateFollowUp: ownsRequest && ticket.status === 'COMPLETED',
    canUploadRequestInstruction: requesterEditable,
    canUploadFieldSupport,
  };
}
