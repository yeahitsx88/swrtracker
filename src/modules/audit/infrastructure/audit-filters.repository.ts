import type { DbClient } from '@/shared/types';
import type { AuditFilterOption, AuditFilterPort, AuditFilterQuery } from '../application/audit-filters';

export class AuditFiltersRepository implements AuditFilterPort {
  async list(db: DbClient, query: AuditFilterQuery): Promise<AuditFilterOption[]> {
    const source = query.kind === 'projects'
      ? `SELECT id::text AS value,name AS label FROM projects WHERE tenant_id=$1`
      : query.kind === 'actors'
      ? `SELECT id::text AS value,name || ' — ' || email ||
          CASE WHEN deactivated_at IS NULL THEN '' ELSE ' (inactive)' END AS label
         FROM users WHERE tenant_id=$1`
      : `SELECT event_type AS value,event_type AS label FROM ticket_events WHERE tenant_id=$1
         UNION SELECT event_type,event_type FROM tenant_events WHERE tenant_id=$1`;
    return (await db.query<AuditFilterOption>(`WITH options AS (${source})
      SELECT value,label FROM options WHERE STRPOS(LOWER(label),LOWER($3))>0
        AND EXISTS (SELECT 1 FROM tenant_memberships tm JOIN users u
          ON u.id=tm.user_id AND u.tenant_id=tm.tenant_id
          WHERE tm.tenant_id=$1 AND tm.user_id=$2 AND tm.role='TENANT_ADMIN' AND u.deactivated_at IS NULL)
      ORDER BY label,value LIMIT $4 OFFSET $5`,
      [query.tenantId,query.userId,query.search,query.limit,query.offset])).rows;
  }
}
