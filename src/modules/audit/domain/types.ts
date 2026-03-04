/**
 * Audit domain types — Section 9 of CLAUDE.md.
 * No I/O. No imports from infrastructure or application layers.
 *
 * ticket_events is append-only. No updates, no deletes, ever.
 */
import type { UUID } from '@/shared/types';

export type AuditEventType =
  | 'ticket.created'
  | 'ticket.submitted'
  | 'ticket.approved'
  | 'ticket.rejected'
  | 'ticket.rejection_overridden'
  | 'ticket.priority_set_by_whitelist'
  | 'ticket.priority_elevated'
  | 'ticket.assigned'
  | 'ticket.unassigned'
  | 'ticket.in_progress'
  | 'ticket.pending_pc_approval'
  | 'ticket.pc_approval_given'
  | 'ticket.pc_approval_rejected'
  | 'ticket.pc_approval_overridden'
  | 'ticket.completed'
  | 'ticket.delayed'
  | 'ticket.delay_restarted'
  | 'ticket.requester_canceled'
  | 'ticket.field_cancel_requested'
  | 'ticket.field_canceled'
  | 'ticket.survey_cancel_requested'
  | 'ticket.survey_canceled'
  | 'ticket.im_stop_work_notified'
  | 'approver.timeout_warning_sent'
  | 'approver.timeout_unlocked'
  | 'attachment.uploaded'
  | 'attachment.downloaded'
  | 'user.role_changed'
  | 'whitelist.entry_added'
  | 'whitelist.entry_removed';

export interface TicketEvent {
  id: UUID;
  ticketId: UUID;
  tenantId: UUID;
  actorId: UUID;
  eventType: AuditEventType;
  payload: Record<string, unknown>;
  createdAt: Date;
}
