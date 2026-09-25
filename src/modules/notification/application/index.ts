/** Durable email fan-out from committed ticket audit events. */
import type { UUID } from '@/shared/types';

export interface NotificationEvent {
  id: UUID;
  tenantId: UUID;
  ticketId: UUID;
  eventType: string;
  payload: Record<string, unknown>;
  ticketNumber: string;
  requesterId: UUID;
  assignedInstrumentManId: UUID | null;
}

export interface PendingDelivery {
  id: UUID;
  event: NotificationEvent;
  recipientUserId: UUID;
  recipientEmail: string;
  attempts: number;
}

export interface NotificationRepository {
  ingestEvents(limit: number): Promise<number>;
  claimDeliveries(limit: number): Promise<PendingDelivery[]>;
  markSent(id: UUID): Promise<void>;
  markFailed(id: UUID, error: string): Promise<void>;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  deliveryId: UUID;
}

export interface EmailTransport {
  send(message: EmailMessage): Promise<void>;
}

export function composeEmail(delivery: PendingDelivery): EmailMessage {
  const { event, recipientUserId } = delivery;
  const number = event.ticketNumber;
  const base = `Survey ticket ${number}`;
  let subject: string;
  let text: string;
  switch (event.eventType) {
    case 'ticket.assigned':
      subject = `${base} assignment updated`;
      text = `The assignment for ${base} has been updated. Open the ticket for current crew details.`;
      break;
    case 'ticket.im_reassigned':
      subject = `${base} crew updated`;
      text = `The Instrument Man assigned to ${base} has changed. Open the ticket for current crew details.`;
      break;
    case 'ticket.requester_canceled':
      subject = `${base} canceled by requester`;
      text = `The requester canceled ${base}. Do not continue work on this ticket.`;
      break;
    case 'ticket.field_cancel_requested':
      subject = `${base} field cancellation needs approval`;
      text = `A field cancellation for ${base} is waiting for approval. Open the ticket to review it.`;
      break;
    case 'ticket.field_canceled':
      subject = `${base} field work canceled`;
      text = `Field work for ${base} was canceled after approval. Open the ticket for details.`;
      break;
    case 'ticket.survey_cancel_requested':
      subject = `${base} survey cancellation needs approval`;
      text = `A survey cancellation for ${base} is waiting for approval. Open the ticket to review it.`;
      break;
    case 'ticket.survey_canceled':
      subject = `${base} canceled by survey team`;
      text = event.payload.priorStatus === 'IN_PROGRESS' &&
        recipientUserId === event.assignedInstrumentManId
        ? `Stop work on ${base}. The survey team canceled this ticket. Open the ticket for details.`
        : `The survey team canceled ${base}. Open the ticket for details.`;
      break;
    case 'ticket.assignment_orphaned':
      subject = `${base} needs crew reassignment`;
      text = `${base} has an orphaned crew assignment. Open the ticket and assign an active crew.`;
      break;
    case 'help_flag.ticket_claimed':
      subject = `${base} claimed by another crew`;
      text = `A Party Chief claimed ${base} from an active help flag. Open the ticket for the current crew assignment.`;
      break;
    case 'approver.timeout_warning_sent':
      subject = `${base} awaiting approval for 18 hours`;
      text = `${base} has awaited Survey Manager approval for 18 hours. Open the ticket to review it.`;
      break;
    case 'approver.timeout_unlocked':
      subject = `${base} awaiting approval for 24 hours`;
      text = `${base} has awaited Survey Manager approval for 24 hours. Open the ticket to review it urgently.`;
      break;
    case 'ticket.pc_approval_stuck':
      subject = `${base} field approval needs attention`;
      text = `Field approval for ${base} has been pending for more than four hours. Open the ticket to resolve it.`;
      break;
    case 'ticket.pc_approval_overridden':
      subject = `${base} field approval resolved`;
      text = `A survey supervisor resolved the field approval for ${base}. Open the ticket for the decision.`;
      break;
    case 'ticket.pending_pc_approval':
      subject = `${base} field status needs approval`;
      text = `A field status for ${base} is waiting for approval. Open the ticket to review it.`;
      break;
    case 'ticket.pc_approval_rejected':
      subject = `${base} field status rejected`;
      text = `The field status for ${base} was rejected. Open the ticket before continuing work.`;
      break;
    case 'ticket.approved':
    case 'ticket.rejection_overridden':
      subject = `${base} approved`;
      text = `${base} was approved. Open the ticket for details.`;
      break;
    case 'ticket.rejected':
      subject = `${base} rejected`;
      text = `${base} was rejected. Open the ticket for the written reason.`;
      break;
    case 'ticket.completed':
      subject = `${base} completed`;
      text = `${base} is complete. Open the ticket for details.`;
      break;
    case 'ticket.delayed':
      subject = `${base} delayed`;
      text = `${base} was delayed. Open the ticket for the reason and next steps.`;
      break;
    default:
      throw new Error(`Unsupported notification event: ${event.eventType}`);
  }
  return { to: delivery.recipientEmail, subject, text, deliveryId: delivery.id };
}

/** One bounded pass. Delivery failures are persisted and retried by later passes. */
export async function runNotificationCycle(
  repository: NotificationRepository,
  transport: EmailTransport,
  limit = 50,
): Promise<{ ingested: number; sent: number; failed: number }> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error('Notification cycle limit must be an integer from 1 to 500');
  }
  const ingested = await repository.ingestEvents(limit);
  const deliveries = await repository.claimDeliveries(limit);
  let sent = 0;
  let failed = 0;
  for (const delivery of deliveries) {
    try {
      await transport.send(composeEmail(delivery));
      await repository.markSent(delivery.id);
      sent += 1;
    } catch (error) {
      await repository.markFailed(
        delivery.id,
        error instanceof Error ? error.message.slice(0, 500) : 'Email transport failed',
      );
      failed += 1;
    }
  }
  return { ingested, sent, failed };
}
