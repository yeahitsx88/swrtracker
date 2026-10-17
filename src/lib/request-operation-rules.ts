/**
 * Who is offered which request operation, shared by the dedicated work screens and Request Details.
 * These rules only decide what to offer; every operation is the existing endpoint with its own
 * server authorization.
 */
import type { TicketRecord } from '@/lib/contracts';

/** The crew personally assigned to the request: the Party Chief arranges it, the Instrument Man works it. */
export function crewPart(ticket: TicketRecord, role: string | null | undefined, actorId: string | undefined): 'chief' | 'instrument' | null {
  if (!actorId) return null;
  if (role === 'PARTY_CHIEF' && ticket.assignedPartyChiefId === actorId) return 'chief';
  if (role === 'INSTRUMENT_MAN' && ticket.assignedInstrumentManId === actorId) return 'instrument';
  return null;
}

/**
 * Field report review: inability reports go to the recorded reviewer; legacy reports to the assigned
 * Party Chief or survey leadership. `reserved` means the report exists but this person may not decide it.
 */
export function fieldReportPart(ticket: TicketRecord, role: string | null | undefined, actorId: string | undefined): 'validation' | 'legacy' | 'validation-reserved' | 'legacy-reserved' | null {
  if (ticket.status === 'PENDING_FIELD_VALIDATION') {
    return actorId === ticket.fieldValidationReviewerId && ['SURVEY_MANAGER', 'SURVEY_SUPERINTENDENT', 'PARTY_CHIEF'].includes(role ?? '') ? 'validation' : 'validation-reserved';
  }
  if (ticket.status !== 'PENDING_PC_APPROVAL') return null;
  return ['SURVEY_MANAGER', 'SURVEY_SUPERINTENDENT'].includes(role ?? '') || role === 'PARTY_CHIEF' && ticket.assignedPartyChiefId === actorId ? 'legacy' : 'legacy-reserved';
}

/** The Need Assignment queue: approved with no Instrument Man yet. */
export const needsAssignment = (ticket: TicketRecord) => ticket.status === 'APPROVED' && !ticket.assignedInstrumentManId;

/** Statuses the Survey Manager's Open Requests view covers (oversight applies while work is open). */
export const OPEN_STATUSES: readonly string[] = ['SUBMITTED', 'APPROVED', 'ASSIGNED', 'IN_PROGRESS', 'DELAYED', 'PENDING_FIELD_VALIDATION', 'PENDING_PC_APPROVAL', 'RETURNED_FOR_CORRECTION'];
