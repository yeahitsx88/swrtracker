/**
 * Ticket application layer — public surface.
 * Exports domain types and all use cases.
 */
export type { Ticket, TicketStatus, WorkflowVariant } from '../domain/types';
export type { ITicketRepository, TicketStatusPatch, ListTicketsOptions } from './ports';

export { createTicket } from './create-ticket';
export { submitTicket } from './submit-ticket';
export { approveTicket } from './approve-ticket';
export { rejectTicket } from './reject-ticket';
export { assignTicket } from './assign-ticket';
export { startTicket } from './start-ticket';
export { completeTicket } from './complete-ticket';
export { closeTicket } from './close-ticket';
export { requestCancel } from './request-cancel';
export { approveCancel } from './approve-cancel';
export { rejectCancel } from './reject-cancel';
export { elevateToPrority } from './elevate-priority';
export { overrideRejection } from './override-rejection';
