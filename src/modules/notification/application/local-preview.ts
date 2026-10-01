import { ForbiddenError, ValidationError } from '@/shared/errors';
import type { ProjectInsightRole } from '@/lib/project-insight-auth';
import type { DbClient, UUID } from '@/shared/types';

export type NotificationDeliveryState = 'QUEUED' | 'CAPTURED' | 'SENT' | 'FAILED';

export interface LocalNotificationPreview {
  id: UUID;
  ticketId: UUID | null;
  ticketNumber: string | null;
  recipientUserId: UUID;
  recipientName: string | null;
  recipientEmail: string;
  eventType: string;
  deliveryState: NotificationDeliveryState;
  attemptCount: number;
  subject: string;
  body: string;
  createdAt: Date;
  deliveredAt: Date | null;
  lastError: string | null;
}

interface PreviewRow {
  id: UUID;
  ticket_id: UUID | null;
  ticket_number: string | null;
  recipient_user_id: UUID;
  recipient_name: string | null;
  recipient_email: string;
  event_type: string;
  payload: Record<string, unknown> | string;
  delivery_state: NotificationDeliveryState;
  attempt_count: number;
  created_at: Date;
  delivered_at: Date | null;
  last_error: string | null;
}

const FULL_PREVIEW_ROLES: ProjectInsightRole[] = ['TENANT_ADMIN', 'PROJECT_ADMIN', 'SURVEY_MANAGER'];

function describeEvent(eventType: string, payload: Record<string, unknown>, ticket: string): { subject: string; body: string } {
  const reason = typeof payload.reason === 'string' ? ` Reason: ${payload.reason}` : '';
  const urgent = typeof payload.urgentReason === 'string' && payload.urgentReason
    ? ` Urgent reason: ${payload.urgentReason}`
    : '';
  const descriptions: Record<string, [string, string]> = {
    SUBMITTED: [`${ticket} submitted`, `${ticket} was submitted for Survey review.${urgent}`],
    RESUBMITTED: [`${ticket} resubmitted`, `${ticket} was corrected and resubmitted for fresh Survey review.${urgent}`],
    RETURNED_FOR_CORRECTION: [`${ticket} returned for correction`, `${ticket} needs requester correction.${reason}`],
    APPROVED: [`${ticket} approved`, `${ticket} was approved and is awaiting field assignment.`],
    NEED_BY_REVISED: [`${ticket} Need-By revised`, `${ticket} has a revised Need-By date.${reason}`],
    ASSIGNED: [`${ticket} assigned`, `${ticket} was assigned to the field team.`],
    COMPLETED: [`${ticket} completed`, `${ticket} field work was completed.`],
    REQUESTER_CANCELED: [`${ticket} canceled`, `${ticket} was canceled by its requester.`],
    SURVEY_CANCELED: [`${ticket} canceled by Survey`, `${ticket} was canceled by Survey.${reason}`],
    STOP_WORK_RETURNED: [`Stop work on ${ticket}`, `${ticket} was returned for correction. Stop work until fresh approval and assignment.${reason}`],
    STOP_WORK_CANCELED: [`Stop work on ${ticket}`, `${ticket} was canceled. Stop work.${reason}`],
  };
  const [subject, body] = descriptions[eventType] ?? [`${ticket} status update`, `${ticket} recorded ${eventType}.`];
  return { subject, body };
}

export async function listLocalNotificationPreviews(
  db: DbClient,
  params: { tenantId: UUID; projectId: UUID; actorId: UUID; actorRole: ProjectInsightRole; limit?: number },
): Promise<LocalNotificationPreview[]> {
  const limit = params.limit ?? 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new ValidationError('limit must be between 1 and 200');
  const fullAccess = FULL_PREVIEW_ROLES.includes(params.actorRole);
  const deliveryOnly = params.actorRole === 'TENANT_ADMIN' || params.actorRole === 'PROJECT_ADMIN';
  const { rows } = await db.query<PreviewRow>(
    `SELECT o.id, CASE WHEN $6::boolean THEN NULL ELSE o.ticket_id END AS ticket_id,
            CASE WHEN $6::boolean THEN NULL ELSE t.ticket_number END AS ticket_number,
            o.recipient_user_id, u.name AS recipient_name, u.email AS recipient_email, o.event_type,
            CASE WHEN $6::boolean THEN '{}'::jsonb ELSE o.payload END AS payload,
            o.delivery_state, o.attempt_count, o.created_at, o.delivered_at,
            CASE WHEN $6::boolean AND o.last_error IS NOT NULL THEN 'Delivery failed; inspect protected transport logs.' ELSE o.last_error END AS last_error
     FROM notification_outbox o
     JOIN tickets t ON t.tenant_id = o.tenant_id AND t.id = o.ticket_id
     JOIN users u ON u.tenant_id = o.tenant_id AND u.id = o.recipient_user_id
     WHERE o.tenant_id = $1 AND t.project_id = $2
       AND ($3::boolean OR o.recipient_user_id = $4)
     ORDER BY o.created_at DESC, o.id DESC
     LIMIT $5`,
    [params.tenantId, params.projectId, fullAccess, params.actorId, limit, deliveryOnly],
  );
  return rows.map((row) => {
    const payload = deliveryOnly ? {} : typeof row.payload === 'string' ? JSON.parse(row.payload) as Record<string, unknown> : row.payload;
    const content = deliveryOnly
      ? { subject: `${row.event_type} delivery`, body: 'Delivery health only. Request content is restricted to operational recipients.' }
      : describeEvent(row.event_type, payload, row.ticket_number ?? row.ticket_id ?? 'Request');
    return {
      id: row.id, ticketId: deliveryOnly ? null : row.ticket_id, ticketNumber: deliveryOnly ? null : row.ticket_number,
      recipientUserId: row.recipient_user_id, recipientName: row.recipient_name,
      recipientEmail: row.recipient_email, eventType: row.event_type,
      deliveryState: row.delivery_state, attemptCount: row.attempt_count,
      subject: content.subject, body: content.body, createdAt: row.created_at,
      deliveredAt: row.delivered_at, lastError: deliveryOnly && row.last_error !== null ? 'Delivery failed; inspect protected transport logs.' : row.last_error,
    };
  });
}

function assertPreviewOperator(role: ProjectInsightRole): void {
  if (!FULL_PREVIEW_ROLES.includes(role)) throw new ForbiddenError('Only IT administrators or the Survey Lead may operate local message capture');
}

export async function captureQueuedNotifications(
  db: DbClient,
  params: { tenantId: UUID; projectId: UUID; actorRole: ProjectInsightRole },
): Promise<number> {
  assertPreviewOperator(params.actorRole);
  const { rows } = await db.query<{ id: UUID }>(
    `UPDATE notification_outbox o
     SET delivery_state = 'CAPTURED', attempt_count = attempt_count + 1,
         delivered_at = NOW(), last_error = NULL, next_attempt_at = NULL
     FROM tickets t
     WHERE t.tenant_id = o.tenant_id AND t.id = o.ticket_id
       AND o.tenant_id = $1 AND t.project_id = $2 AND o.delivery_state = 'QUEUED'
       AND (o.next_attempt_at IS NULL OR o.next_attempt_at <= NOW())
     RETURNING o.id`,
    [params.tenantId, params.projectId],
  );
  return rows.length;
}

export async function retryFailedNotifications(
  db: DbClient,
  params: { tenantId: UUID; projectId: UUID; actorRole: ProjectInsightRole },
): Promise<number> {
  assertPreviewOperator(params.actorRole);
  const { rows } = await db.query<{ id: UUID }>(
    `UPDATE notification_outbox o
     SET delivery_state = 'QUEUED', next_attempt_at = NOW(), last_error = NULL
     FROM tickets t
     WHERE t.tenant_id = o.tenant_id AND t.id = o.ticket_id
       AND o.tenant_id = $1 AND t.project_id = $2 AND o.delivery_state = 'FAILED'
     RETURNING o.id`,
    [params.tenantId, params.projectId],
  );
  return rows.length;
}
