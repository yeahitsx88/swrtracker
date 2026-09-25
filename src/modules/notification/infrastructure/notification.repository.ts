import type { Pool } from 'pg';
import { ForbiddenError, NotFoundError } from '@/shared/errors';
import type { UUID } from '@/shared/types';
import { canReadTicket } from '@/lib/ticket-route-helpers';
import { appendAuditEvent } from '@/modules/audit/application/index';
import type { NotificationRepository, PendingDelivery } from '../application/index';

const EVENT_TYPES = [
  'ticket.assigned', 'ticket.im_reassigned', 'ticket.requester_canceled', 'ticket.field_cancel_requested',
  'ticket.field_canceled', 'ticket.survey_cancel_requested',
  'ticket.survey_canceled', 'ticket.assignment_orphaned',
  'ticket.pending_pc_approval', 'ticket.pc_approval_rejected',
  'ticket.pc_approval_overridden', 'ticket.approved', 'ticket.rejected',
  'ticket.rejection_overridden',
  'ticket.completed', 'ticket.delayed', 'help_flag.ticket_claimed',
  'approver.timeout_warning_sent', 'approver.timeout_unlocked',
  'ticket.pc_approval_stuck',
] as const;

type EventRow = {
  id: UUID;
  tenant_id: UUID;
  ticket_id: UUID;
  event_type: string;
  payload: Record<string, unknown>;
};

type DeliveryRow = EventRow & {
  delivery_id: UUID;
  recipient_user_id: UUID;
  email: string;
  attempts: number;
  ticket_number: string;
  requester_id: UUID;
  assigned_instrument_man_id: UUID | null;
};

/** All fan-out and claim queries bind the event tenant to tickets and users. */
export class PgNotificationRepository implements NotificationRepository {
  constructor(private readonly pool: Pool) {}

  async ingestEvents(limit: number): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const events = await client.query<EventRow>(
        `SELECT e.id, e.tenant_id, e.ticket_id, e.event_type, e.payload
         FROM ticket_events e
         LEFT JOIN notification_event_receipts r ON r.event_id = e.id
         WHERE e.event_type = ANY($1::text[]) AND r.event_id IS NULL
         ORDER BY e.created_at, e.id
         LIMIT $2
         FOR UPDATE OF e SKIP LOCKED`,
        [EVENT_TYPES, limit],
      );
      for (const event of events.rows) {
        const recipients = await client.query<{ id: UUID }>(
          `SELECT DISTINCT u.id
           FROM tickets t
           CROSS JOIN LATERAL (
             SELECT t.requester_id::text AS user_id
               WHERE $3 IN ('ticket.assigned', 'ticket.im_reassigned', 'ticket.field_canceled',
                 'ticket.survey_canceled', 'ticket.approved', 'ticket.rejected',
                 'ticket.rejection_overridden',
                 'ticket.completed', 'ticket.delayed')
             UNION SELECT t.assigned_party_chief_id::text
               WHERE $3 = 'ticket.requester_canceled'
                 OR $3 IN ('ticket.field_cancel_requested', 'ticket.pending_pc_approval')
             UNION SELECT t.assigned_instrument_man_id::text
               WHERE $3 = 'ticket.requester_canceled'
                  OR ($3 = 'ticket.survey_canceled' AND $5 = 'IN_PROGRESS')
                  OR $3 = 'ticket.pc_approval_rejected'
             UNION SELECT t.survey_superintendent_id::text
               WHERE $3 IN ('ticket.requester_canceled', 'ticket.assignment_orphaned')
                  OR $3 IN ('ticket.field_cancel_requested', 'ticket.pending_pc_approval')
                  OR ($3 = 'ticket.survey_cancel_requested' AND $6 = 'PARTY_CHIEF')
             UNION SELECT t.assigned_party_chief_id::text
               WHERE $3 = 'ticket.pc_approval_overridden'
                  OR $3 = 'ticket.pc_approval_stuck'
             UNION SELECT t.survey_superintendent_id::text
               WHERE $3 = 'ticket.pc_approval_stuck'
             UNION SELECT pm.user_id::text
               FROM project_memberships pm
               WHERE pm.project_id = t.project_id
                 AND pm.role = 'SURVEY_MANAGER'
                 AND $3 IN ('ticket.requester_canceled', 'ticket.assignment_orphaned',
                   'ticket.field_cancel_requested', 'ticket.pending_pc_approval',
                   'ticket.survey_cancel_requested', 'help_flag.ticket_claimed',
                   'approver.timeout_warning_sent', 'approver.timeout_unlocked',
                   'ticket.pc_approval_stuck')
             UNION SELECT ag.user_id::text
               FROM acting_grants ag
               WHERE ag.project_id = t.project_id AND ag.tenant_id = t.tenant_id
                 AND ag.role = 'SURVEY_MANAGER' AND ag.revoked_at IS NULL
                 AND $3 IN ('ticket.assignment_orphaned', 'help_flag.ticket_claimed',
                   'approver.timeout_warning_sent', 'approver.timeout_unlocked',
                   'ticket.pc_approval_stuck')
             UNION SELECT $4::jsonb->>'assignedPartyChiefId'
               WHERE $3 = 'ticket.assigned'
             UNION SELECT $4::jsonb->>'assignedInstrumentManId'
               WHERE $3 = 'ticket.assigned'
           ) ids
           JOIN users u ON u.id::text = ids.user_id AND u.tenant_id = $2
             AND u.deactivated_at IS NULL
           WHERE t.id = $1 AND t.tenant_id = $2`,
          [event.ticket_id, event.tenant_id, event.event_type,
            JSON.stringify(event.payload), event.payload.priorStatus ?? null,
            event.payload.initiatorRole ?? null],
        );
        for (const recipient of recipients.rows) {
          await client.query(
            `INSERT INTO notification_deliveries
               (event_id, tenant_id, recipient_user_id)
             VALUES ($1, $2, $3)
             ON CONFLICT (event_id, recipient_user_id) DO NOTHING`,
            [event.id, event.tenant_id, recipient.id],
          );
        }
        await client.query(
          `INSERT INTO notification_event_receipts (event_id, tenant_id)
           VALUES ($1, $2) ON CONFLICT (event_id) DO NOTHING`,
          [event.id, event.tenant_id],
        );
      }
      await client.query('COMMIT');
      return events.rows.length;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async claimDeliveries(limit: number): Promise<PendingDelivery[]> {
    await this.pool.query(
      `UPDATE notification_deliveries d SET status = 'SKIPPED', claimed_until = NULL
       FROM users u WHERE d.recipient_user_id = u.id AND d.tenant_id = u.tenant_id
         AND u.deactivated_at IS NOT NULL AND d.status IN ('PENDING', 'SENDING')`,
    );
    const result = await this.pool.query<DeliveryRow>(
      `WITH ready AS (
         SELECT id FROM notification_deliveries
         WHERE (status = 'PENDING' AND next_attempt_at <= NOW())
            OR (status = 'SENDING' AND claimed_until <= NOW())
         ORDER BY next_attempt_at, created_at, id
         LIMIT $1 FOR UPDATE SKIP LOCKED
       ), claimed AS (
         UPDATE notification_deliveries d
         SET status = 'SENDING', attempts = d.attempts + 1,
             claimed_until = NOW() + INTERVAL '5 minutes'
         FROM ready WHERE d.id = ready.id
         RETURNING d.*
       )
       SELECT d.id AS delivery_id, d.tenant_id, d.recipient_user_id,
              d.attempts, u.email, e.id, e.ticket_id, e.event_type, e.payload,
              t.ticket_number, t.requester_id, t.assigned_instrument_man_id
       FROM claimed d
       JOIN ticket_events e ON e.id = d.event_id AND e.tenant_id = d.tenant_id
       JOIN tickets t ON t.id = e.ticket_id AND t.tenant_id = d.tenant_id
       JOIN users u ON u.id = d.recipient_user_id AND u.tenant_id = d.tenant_id
         AND u.deactivated_at IS NULL`,
      [limit],
    );
    const authorized: DeliveryRow[] = [];
    for (const row of result.rows) {
      let visible = false;
      try {
        visible = await canReadTicket(this.pool, row.tenant_id,
          row.ticket_id, row.recipient_user_id);
      } catch (error) {
        if (!(error instanceof ForbiddenError || error instanceof NotFoundError)) {
          throw error;
        }
      }
      if (!visible) {
        await this.pool.query(
          `UPDATE notification_deliveries SET status = 'SKIPPED', claimed_until = NULL
           WHERE id = $1 AND status = 'SENDING'`, [row.delivery_id]);
        continue;
      }
      authorized.push(row);
    }
    return authorized.map((row) => ({
      id: row.delivery_id,
      recipientUserId: row.recipient_user_id,
      recipientEmail: row.email,
      attempts: row.attempts,
      event: {
        id: row.id,
        tenantId: row.tenant_id,
        ticketId: row.ticket_id,
        eventType: row.event_type,
        payload: row.payload,
        ticketNumber: row.ticket_number,
        requesterId: row.requester_id,
        assignedInstrumentManId: row.assigned_instrument_man_id,
      },
    }));
  }

  async markSent(id: UUID): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{
        event_id: UUID; tenant_id: UUID; recipient_user_id: UUID;
      }>(
        `UPDATE notification_deliveries
         SET status = 'SENT', sent_at = NOW(), claimed_until = NULL, last_error = NULL
         WHERE id = $1 AND status = 'SENDING'
         RETURNING event_id, tenant_id, recipient_user_id`,
        [id],
      );
      const delivered = result.rows[0];
      if (!delivered) throw new Error('Notification delivery claim expired');
      const event = await client.query<{
        ticket_id: UUID; actor_id: UUID; event_type: string;
        payload: Record<string, unknown>; assigned_instrument_man_id: UUID | null;
      }>(
        `SELECT e.ticket_id, e.actor_id, e.event_type, e.payload,
                t.assigned_instrument_man_id
         FROM ticket_events e
         JOIN tickets t ON t.id = e.ticket_id AND t.tenant_id = e.tenant_id
         WHERE e.id = $1 AND e.tenant_id = $2`,
        [delivered.event_id, delivered.tenant_id],
      );
      const source = event.rows[0];
      if (!source) throw new Error('Notification source event is missing');
      if (source.event_type === 'ticket.survey_canceled' &&
          source.payload.priorStatus === 'IN_PROGRESS' &&
          delivered.recipient_user_id === source.assigned_instrument_man_id) {
        await appendAuditEvent(client, {
          ticketId: source.ticket_id,
          tenantId: delivered.tenant_id,
          actorId: source.actor_id,
          eventType: 'ticket.im_stop_work_notified',
          payload: {
            recipientUserId: delivered.recipient_user_id,
            priorStatus: 'IN_PROGRESS',
            notificationDeliveryId: id,
          },
        });
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async markFailed(id: UUID, error: string): Promise<void> {
    const result = await this.pool.query(
      `UPDATE notification_deliveries
       SET status = 'PENDING', claimed_until = NULL, last_error = $2,
           next_attempt_at = NOW() + LEAST(3600, 30 * POWER(2, LEAST(attempts - 1, 7))) * INTERVAL '1 second'
       WHERE id = $1 AND status = 'SENDING'`,
      [id, error],
    );
    if (result.rowCount !== 1) throw new Error('Notification delivery claim expired');
  }
}
