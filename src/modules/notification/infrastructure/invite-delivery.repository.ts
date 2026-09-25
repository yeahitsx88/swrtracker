import type { Pool } from 'pg';
import type { UUID } from '@/shared/types';
import type { InviteDeliveryRepository,
  PendingInviteDelivery } from '../application/invite-delivery';

type EventRow = { id: UUID; tenant_id: UUID; actor_id: UUID;
  payload: Record<string, unknown> };
type DeliveryRow = { id: UUID; tenant_id: UUID; invite_id: UUID;
  email: string; token: UUID; project_name: string; expires_at: Date;
  attempts: number };

/** Invitation token stays in invites; outbox and audit payloads store IDs only. */
export class PgInviteDeliveryRepository implements InviteDeliveryRepository {
  constructor(private readonly pool: Pool) {}

  async ingestEvents(limit: number): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const events = await client.query<EventRow>(
        `SELECT e.id, e.tenant_id, e.actor_id, e.payload
         FROM tenant_events e
         LEFT JOIN invite_notification_receipts r ON r.tenant_event_id = e.id
         WHERE e.event_type = 'invite.sent' AND r.tenant_event_id IS NULL
         ORDER BY e.created_at, e.id
         LIMIT $1 FOR UPDATE OF e SKIP LOCKED`,
        [limit]);
      for (const event of events.rows) {
        const matched = await client.query<{ id: UUID }>(
          `SELECT i.id FROM invites i
           JOIN projects p ON p.id = i.project_id AND p.tenant_id = i.tenant_id
           JOIN companies c ON c.id = i.company_id AND c.tenant_id = i.tenant_id
           WHERE i.id::text = $2 AND i.tenant_id = $1
             AND i.invited_by = $3
             AND i.project_id::text = $4
             AND i.company_id::text = $5
             AND LOWER(i.email) = LOWER($6)
             AND i.role = $7`,
          [event.tenant_id, event.payload.inviteId, event.actor_id,
            event.payload.projectId, event.payload.companyId,
            event.payload.email, event.payload.role]);
        const invite = matched.rows[0];
        if (!invite) throw new Error(`Invite audit event ${event.id} does not bind to a company-scoped invite`);
        await client.query(
          `INSERT INTO invite_notification_deliveries
            (tenant_event_id, tenant_id, invite_id)
           VALUES ($1,$2,$3) ON CONFLICT (tenant_event_id) DO NOTHING`,
          [event.id, event.tenant_id, invite.id]);
        await client.query(
          `INSERT INTO invite_notification_receipts (tenant_event_id, tenant_id)
           VALUES ($1,$2) ON CONFLICT (tenant_event_id) DO NOTHING`,
          [event.id, event.tenant_id]);
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

  async claimDeliveries(limit: number): Promise<PendingInviteDelivery[]> {
    await this.pool.query(
      `UPDATE invite_notification_deliveries d
       SET status = 'SKIPPED', claimed_until = NULL
       FROM invites i, projects p
       WHERE i.id = d.invite_id AND i.tenant_id = d.tenant_id
         AND p.id = i.project_id AND p.tenant_id = d.tenant_id
         AND d.status IN ('PENDING','SENDING')
         AND (i.accepted_at IS NOT NULL OR i.canceled_at IS NOT NULL
           OR i.expires_at <= NOW() OR i.company_id IS NULL OR p.status = 'ARCHIVED')`,
    );
    const result = await this.pool.query<DeliveryRow>(
      `WITH ready AS (
         SELECT id FROM invite_notification_deliveries
         WHERE (status = 'PENDING' AND next_attempt_at <= NOW())
            OR (status = 'SENDING' AND claimed_until <= NOW())
         ORDER BY next_attempt_at, created_at, id
         LIMIT $1 FOR UPDATE SKIP LOCKED
       ), claimed AS (
         UPDATE invite_notification_deliveries d
         SET status = 'SENDING', attempts = d.attempts + 1,
             claimed_until = NOW() + INTERVAL '5 minutes'
         FROM ready WHERE d.id = ready.id RETURNING d.*
       )
       SELECT d.id, d.tenant_id, d.invite_id, d.attempts,
              i.email, i.token, i.expires_at, p.name AS project_name
       FROM claimed d
       JOIN invites i ON i.id = d.invite_id AND i.tenant_id = d.tenant_id
       JOIN projects p ON p.id = i.project_id AND p.tenant_id = d.tenant_id
       WHERE i.accepted_at IS NULL AND i.canceled_at IS NULL
         AND i.expires_at > NOW() AND i.company_id IS NOT NULL
         AND p.status <> 'ARCHIVED'`,
      [limit]);
    return result.rows.map(row => ({
      id: row.id, tenantId: row.tenant_id, inviteId: row.invite_id,
      recipientEmail: row.email, token: row.token,
      projectName: row.project_name, expiresAt: row.expires_at,
      attempts: row.attempts,
    }));
  }

  async markSent(id: UUID): Promise<void> {
    const result = await this.pool.query<{ id: UUID }>(
      `UPDATE invite_notification_deliveries
       SET status = 'SENT', sent_at = NOW(), claimed_until = NULL, last_error = NULL
       WHERE id = $1 AND status = 'SENDING' RETURNING id`, [id]);
    if (!result.rows[0]) throw new Error('Invite delivery claim expired');
  }

  async markFailed(id: UUID, error: string): Promise<void> {
    const result = await this.pool.query<{ id: UUID }>(
      `UPDATE invite_notification_deliveries
       SET status = 'PENDING', claimed_until = NULL, last_error = $2,
           next_attempt_at = NOW() + LEAST(3600, 30 * POWER(2, LEAST(attempts - 1, 7))) * INTERVAL '1 second'
       WHERE id = $1 AND status = 'SENDING' RETURNING id`, [id, error]);
    if (!result.rows[0]) throw new Error('Invite delivery claim expired');
  }
}
