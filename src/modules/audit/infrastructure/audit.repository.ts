/**
 * Audit infrastructure — append-only event log.
 *
 * ticket_events is append-only. This file never issues UPDATE or DELETE
 * against that table. Enforced by convention and code review.
 *
 * appendAuditEvent is called from within the same pg transaction as the
 * ticket state change, ensuring event and state update are atomic.
 */
import { randomUUID } from 'crypto';
import type { DbClient, UUID } from '@/shared/types';
import type { AuditEventType } from '../domain/types';

export async function appendAuditEvent(
  db: DbClient,
  event: {
    ticketId:  UUID;
    tenantId:  UUID;
    actorId:   UUID;
    eventType: AuditEventType;
    payload:   Record<string, unknown>;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO ticket_events (id, ticket_id, tenant_id, actor_id, event_type, payload, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [
      randomUUID() as UUID,
      event.ticketId,
      event.tenantId,
      event.actorId,
      event.eventType,
      JSON.stringify(event.payload),
    ],
  );
}
