import type { TicketStatus } from './types';

const labels: Record<TicketStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Pending Review',
  APPROVED: 'Approved — Awaiting Assignment',
  REJECTED: 'Not Approved',
  CREATED: 'Awaiting Assignment',
  ASSIGNED: 'Scheduled',
  IN_PROGRESS: 'In Progress',
  PENDING_PC_APPROVAL: 'Under Review by Survey Lead',
  DELAYED: 'Delayed',
  COMPLETED: 'Completed',
  REQUESTER_CANCELED: 'Canceled by You',
  FIELD_CANCELED: 'Canceled — Field Conditions',
  SURVEY_CANCELED: 'Canceled by Survey Team',
};

export function statusLabel(status: TicketStatus): string {
  return labels[status];
}
