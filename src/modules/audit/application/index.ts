/**
 * Audit application layer — public surface.
 * appendAuditEvent is called by ticket use cases within the same pg transaction.
 */
export type { AuditEventType, TicketEvent } from '../domain/types';
export { appendAuditEvent, appendSystemAuditEvent } from '../infrastructure/audit.repository';
export { appendRegistrationAuditEvent } from '../infrastructure/audit.repository';
