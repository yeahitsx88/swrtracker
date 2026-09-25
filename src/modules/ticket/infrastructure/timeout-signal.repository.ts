import type { DbClient, UUID } from '@/shared/types';

export async function recordApproverTimeoutSignals(db: DbClient, tenantId: UUID,
  ticketIds: UUID[]): Promise<number> {
  if (!ticketIds.length) return 0;
  let inserted = 0;
  for (const [eventType, hours] of [
    ['approver.timeout_warning_sent', 18],
    ['approver.timeout_unlocked', 24],
  ] as const) {
    const { rows } = await db.query<{ id: UUID }>(
      `INSERT INTO ticket_events(id,ticket_id,tenant_id,actor_id,
         event_type,payload,created_at)
       SELECT gen_random_uuid(),t.id,t.tenant_id,NULL,$3,
         jsonb_build_object('ticketId',t.id,'hoursElapsed',
           ROUND((EXTRACT(EPOCH FROM (NOW()-t.submitted_at))/3600)::numeric,1)),
         NOW()
       FROM tickets t JOIN projects p ON p.id=t.project_id
         AND p.tenant_id=t.tenant_id AND p.status='ACTIVE'
       WHERE t.tenant_id=$1 AND t.id=ANY($2::uuid[])
         AND t.status='SUBMITTED' AND t.submitted_at IS NOT NULL
         AND t.submitted_at <= NOW()-($4::int * INTERVAL '1 hour')
       ON CONFLICT DO NOTHING RETURNING id`,
      [tenantId, ticketIds, eventType, hours]);
    inserted += rows.length;
  }
  return inserted;
}

export async function findStuckPcApprovals(db: DbClient, limit: number): Promise<
  Array<{ id: UUID; tenantId: UUID; updatedAt: Date }>> {
  const { rows } = await db.query<{
    id: UUID; tenant_id: UUID; updated_at: Date;
  }>(
    `SELECT t.id,t.tenant_id,t.updated_at FROM tickets t
     JOIN projects p ON p.id=t.project_id AND p.tenant_id=t.tenant_id
       AND p.status='ACTIVE'
     WHERE t.status='PENDING_PC_APPROVAL'
       AND t.updated_at <= NOW()-INTERVAL '4 hours'
       AND NOT EXISTS (SELECT 1 FROM ticket_events e
         WHERE e.ticket_id=t.id AND e.tenant_id=t.tenant_id
           AND e.event_type='ticket.pc_approval_stuck'
           AND e.created_at > NOW()-INTERVAL '30 minutes')
     ORDER BY t.updated_at,t.id LIMIT $1 FOR UPDATE OF t SKIP LOCKED`, [limit]);
  return rows.map(row => ({ id: row.id, tenantId: row.tenant_id,
    updatedAt: row.updated_at }));
}
