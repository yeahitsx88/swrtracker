/**
 * Ticket application layer — public surface.
 * Exports domain types and all use cases.
 */
export type { Ticket, TicketStatus, WorkflowVariant } from '../domain/types';
export type { ITicketRepository, TicketStatusPatch, ListTicketsOptions } from './ports';

export { createTicket } from './create-ticket';
export { saveDraft, deleteDraft, recoverDraft,
  listRequesterDrafts, listRecoverableDrafts } from './drafts';
export { submitTicket } from './submit-ticket';
export { approveTicket } from './approve-ticket';
export { rejectTicket } from './reject-ticket';
export { assignTicket } from './assign-ticket';
export { startTicket } from './start-ticket';
export { completeTicket } from './complete-ticket';
export { submitFieldStatus, resolveFieldStatus, restartDelayed } from './field-status';
export { initiateSurveyCancel, approveSurveyCancel } from './survey-cancel';
export { requestCancel } from './request-cancel';
export { elevateToPrority } from './elevate-priority';
export { lowerPriority } from './lower-priority';
export { overrideRejection } from './override-rejection';
export { getOperationalReport, reportDimensions } from './operational-report';
export type { OperationalReportPort, OperationalReportQuery, OperationalGroup, ReportDimension } from './operational-report';
