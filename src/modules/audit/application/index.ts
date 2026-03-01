/**
 * Audit application layer — public surface.
 * appendAuditEvent is called by ticket use cases within the same pg transaction.
 */
export type { AuditEventType, TicketEvent } from '../domain/types';
export { appendAuditEvent } from '../infrastructure/audit.repository';
