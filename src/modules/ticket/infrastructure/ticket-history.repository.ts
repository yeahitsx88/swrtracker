import type { DbClient, UUID } from '@/shared/types';
import type { TicketHistoryItem, TicketHistorySource } from '@/lib/contracts';

interface HistoryRow {
  id: string;
  source: TicketHistorySource;
  type: string;
  occurred_at: Date | string;
  actor_id: string | null;
  actor_name: string | null;
  details: Record<string, unknown> | string | null;
}

const PRIVATE_DETAIL_KEYS = new Set([
  'storagekey',
  'storage_key',
  'recipient',
  'recipientid',
  'recipient_id',
  'recipientuserid',
  'recipient_user_id',
  'recipientemail',
  'recipient_email',
  'email',
  'idempotencykey',
  'idempotency_key',
]);

export function sanitizeHistoryDetails(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeHistoryDetails);
  if (!value || typeof value !== 'object') return value;
  const sanitized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (PRIVATE_DETAIL_KEYS.has(key.toLowerCase())) continue;
    sanitized[key] = sanitizeHistoryDetails(child);
  }
  return sanitized;
}

function parseDetails(value: HistoryRow['details']): Record<string, unknown> {
  const parsed = typeof value === 'string' ? JSON.parse(value) as unknown : value;
  const sanitized = sanitizeHistoryDetails(parsed);
  return sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized)
    ? sanitized as Record<string, unknown>
    : {};
}

/**
 * Reads the ticket's traceability records after the caller has established
 * ticket visibility. Every source is tenant and ticket scoped.
 */
export async function listTicketHistory(
  db: DbClient,
  tenantId: UUID,
  ticketId: UUID,
): Promise<TicketHistoryItem[]> {
  const { rows } = await db.query<HistoryRow>(
    `SELECT * FROM (
       SELECT te.id::text AS id, 'TICKET_EVENT'::text AS source,
              te.event_type AS type, te.created_at AS occurred_at,
              te.actor_id, u.name AS actor_name, te.payload AS details
       FROM ticket_events te
       LEFT JOIN users u ON u.tenant_id = te.tenant_id AND u.id = te.actor_id
       WHERE te.tenant_id = $1 AND te.ticket_id = $2
         AND te.event_type NOT IN (
           'ticket.returned_for_correction', 'ticket.assigned',
           'ticket.party_chief_assigned', 'ticket.need_by_revised',
           'attachment.uploaded'
         )

       UNION ALL

       SELECT rc.id::text, 'RETURN_CYCLE', 'ticket.returned_for_correction',
              rc.returned_at, rc.returned_by, u.name,
              jsonb_build_object(
                'cycleNumber', rc.cycle_number, 'origin', rc.origin,
                'reason', rc.reason, 'resubmittedAt', rc.resubmitted_at
              )
       FROM ticket_return_cycles rc
       LEFT JOIN users u ON u.tenant_id = rc.tenant_id AND u.id = rc.returned_by
       WHERE rc.tenant_id = $1 AND rc.ticket_id = $2

       UNION ALL

       SELECT ah.id::text, 'ASSIGNMENT', 'ticket.assignment_recorded',
              ah.assigned_at, ah.assigned_by, actor.name,
              jsonb_build_object(
                'partyChiefId', ah.party_chief_id, 'partyChiefName', pc.name,
                'instrumentManId', ah.instrument_man_id, 'instrumentManName', im.name,
                'endedAt', ah.ended_at, 'endReason', ah.end_reason
              )
       FROM ticket_assignment_history ah
       LEFT JOIN users actor ON actor.tenant_id = ah.tenant_id AND actor.id = ah.assigned_by
       LEFT JOIN users pc ON pc.tenant_id = ah.tenant_id AND pc.id = ah.party_chief_id
       LEFT JOIN users im ON im.tenant_id = ah.tenant_id AND im.id = ah.instrument_man_id
       WHERE ah.tenant_id = $1 AND ah.ticket_id = $2

       UNION ALL

       SELECT nr.id::text, 'NEED_BY_REVISION', 'ticket.need_by_revised',
              nr.revised_at, nr.revised_by, u.name,
              jsonb_build_object('oldDate', nr.old_date, 'newDate', nr.new_date, 'reason', nr.reason)
       FROM ticket_need_by_revisions nr
       LEFT JOIN users u ON u.tenant_id = nr.tenant_id AND u.id = nr.revised_by
       WHERE nr.tenant_id = $1 AND nr.ticket_id = $2

       UNION ALL

       SELECT a.id::text, 'ATTACHMENT', 'attachment.uploaded',
              a.created_at, a.uploaded_by, u.name,
              jsonb_build_object(
                'attachmentId', a.id, 'filename', a.filename, 'mimeType', a.mime_type,
                'sizeBytes', a.size_bytes, 'purpose', a.purpose, 'returnCycle', a.return_cycle
              )
       FROM attachments a
       LEFT JOIN users u ON u.tenant_id = a.tenant_id AND u.id = a.uploaded_by
       WHERE a.tenant_id = $1 AND a.ticket_id = $2

       UNION ALL

       SELECT n.id::text, 'NOTIFICATION', n.event_type,
              n.created_at, NULL::uuid, NULL::text,
              jsonb_build_object(
                'deliveryState', n.delivery_state, 'attemptCount', n.attempt_count,
                'deliveredAt', n.delivered_at
              )
       FROM notification_outbox n
       WHERE n.tenant_id = $1 AND n.ticket_id = $2
     ) timeline
     ORDER BY occurred_at DESC, id DESC`,
    [tenantId, ticketId],
  );

  return rows.map((row) => ({
    id: row.id,
    source: row.source,
    type: row.type,
    occurredAt: new Date(row.occurred_at).toISOString(),
    actor: row.actor_id ? { id: row.actor_id, name: row.actor_name ?? 'Unknown user' } : null,
    details: parseDetails(row.details),
  }));
}
