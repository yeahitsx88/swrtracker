/**
 * Audit domain types — Section 9 of CLAUDE.md.
 * No I/O. No imports from infrastructure or application layers.
 *
 * ticket_events is append-only. No updates, no deletes, ever.
 */
import type { UUID } from '@/shared/types';

export type AuditEventType =
  | 'cad.status_changed'
  | 'cad.qa_signed_off'
  | 'ticket.created'
  | 'ticket.draft_saved'
  | 'ticket.draft_deleted'
  | 'ticket.draft_expired'
  | 'ticket.draft_recovered'
  | 'ticket.draft_hard_deleted'
  | 'ticket.assignment_orphaned'
  | 'ticket.pc_approval_stuck'
  | 'approver.timeout_warning_sent'
  | 'approver.timeout_unlocked'
  | 'help_flag.raised'
  | 'help_flag.escalated'
  | 'help_flag.cleared'
  | 'help_flag.ticket_claimed'
  | 'ticket.submitted'
  | 'ticket.approved'
  | 'ticket.rejected'
  | 'ticket.rejection_overridden'
  | 'ticket.priority_set_by_whitelist'
  | 'ticket.priority_set_by_title'
  | 'ticket.priority_elevated'
  | 'ticket.priority_downgrade_confirmed'
  | 'ticket.priority_lowered'
  | 'ticket.assigned'
  | 'ticket.unassigned'
  | 'ticket.im_reassigned'
  | 'ticket.superintendent_reassigned'
  | 'ticket.in_progress'
  | 'ticket.pending_pc_approval'
  | 'ticket.pc_approval_given'
  | 'ticket.pc_approval_rejected'
  | 'ticket.pc_approval_overridden'
  | 'ticket.completed'
  | 'ticket.delayed'
  | 'ticket.delay_restarted'
  | 'ticket.field_cancel_requested'
  | 'ticket.field_canceled'
  | 'ticket.survey_cancel_requested'
  | 'ticket.im_stop_work_notified'
  | 'ticket.closed'
  | 'ticket.cancel_requested'
  | 'ticket.cancel_approved'
  | 'ticket.cancel_rejected'
  | 'ticket.requester_canceled'
  | 'ticket.survey_canceled'
  | 'attachment.uploaded'
  | 'attachment.downloaded'
  | 'user.role_changed'
  | 'whitelist.entry_added'
  | 'whitelist.entry_removed';

export interface TicketEvent {
  id: UUID;
  ticketId: UUID | null;
  tenantId: UUID;
  actorId: UUID | null;
  eventType: AuditEventType;
  payload: Record<string, unknown>;
  createdAt: Date;
}
