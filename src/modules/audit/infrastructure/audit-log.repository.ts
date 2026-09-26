import type { DbClient } from '@/shared/types';
import type { AuditLogEntry, AuditLogPort, AuditLogQuery } from '../application/audit-log';

export class AuditLogRepository implements AuditLogPort {
  async list(db: DbClient, query: AuditLogQuery): Promise<AuditLogEntry[]> {
    const { rows } = await db.query<AuditLogEntry>(
      `WITH events AS (
        SELECT e.id,'ticket' AS source,e.event_type,e.ticket_id,t.ticket_number,
          COALESCE(t.project_id::text,d.project_id::text,e.payload->>'projectId') AS project_ref,
          e.actor_id,e.payload,e.created_at,e.tenant_id
        FROM ticket_events e LEFT JOIN tickets t
          ON t.id=e.ticket_id AND t.tenant_id=e.tenant_id
        LEFT JOIN ticket_draft_tombstones d
          ON d.ticket_id=e.ticket_id AND d.tenant_id=e.tenant_id
        WHERE e.tenant_id=$1
        UNION ALL
        SELECT e.id,'tenant' AS source,e.event_type,NULL::uuid,NULL::text,
          e.payload->>'projectId',e.actor_id,e.payload,e.created_at,e.tenant_id
        FROM tenant_events e WHERE e.tenant_id=$1
      )
      SELECT e.id,e.source,e.event_type AS "eventType",e.ticket_id AS "ticketId",
        e.ticket_number AS "ticketNumber",p.id AS "projectId",p.name AS "projectName",
        e.actor_id AS "actorId",u.name AS "actorName",e.payload,e.created_at AS "createdAt"
      FROM events e
      LEFT JOIN projects p ON p.id::text=e.project_ref AND p.tenant_id=e.tenant_id
      LEFT JOIN users u ON u.id=e.actor_id AND u.tenant_id=e.tenant_id
      WHERE ($3::uuid IS NULL OR p.id=$3)
        AND ($4::uuid IS NULL OR e.actor_id=$4)
        AND ($5::text IS NULL OR e.event_type=$5)
        AND ($6::timestamptz IS NULL OR e.created_at >= $6)
        AND ($7::timestamptz IS NULL OR e.created_at < $7)
        AND EXISTS (
          SELECT 1 FROM tenant_memberships tm JOIN users viewer
            ON viewer.id=tm.user_id AND viewer.tenant_id=tm.tenant_id
          WHERE tm.tenant_id=$1 AND tm.user_id=$2 AND tm.role='TENANT_ADMIN'
            AND viewer.deactivated_at IS NULL
        )
      ORDER BY e.created_at DESC,e.id DESC,e.source DESC LIMIT $8 OFFSET $9`,
      [query.tenantId,query.userId,query.projectId ?? null,query.actorId ?? null,
        query.eventType ?? null,query.from ?? null,query.until ?? null,query.limit,query.offset]);
    return rows;
  }
}
