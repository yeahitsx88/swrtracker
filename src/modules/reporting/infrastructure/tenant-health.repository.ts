import type { DbClient, UUID } from '@/shared/types';
import type { ProjectHealth, TenantHealthPort, TenantHealthQuery } from '../application/tenant-health';

export class TenantHealthRepository implements TenantHealthPort {
  async list(db:DbClient,query:TenantHealthQuery,now:Date):Promise<ProjectHealth[]> {
    return (await db.query<ProjectHealth>(`WITH selected AS (
      SELECT p.* FROM projects p WHERE p.tenant_id=$1 AND EXISTS (
        SELECT 1 FROM tenant_memberships tm JOIN users u
          ON u.id=tm.user_id AND u.tenant_id=tm.tenant_id
        WHERE tm.tenant_id=$1 AND tm.user_id=$2 AND tm.role='TENANT_ADMIN' AND u.deactivated_at IS NULL)
      ORDER BY p.name,p.id LIMIT $3 OFFSET $4
    ) SELECT p.id,p.name,p.status,p.crew_build AS "crewBuild",
      p.created_at AS "createdAt",p.activated_at AS "activatedAt",
      CASE WHEN p.status='ACTIVE' THEN counts.tickets ELSE NULL END AS tickets,
      CASE WHEN p.status='ACTIVE' THEN counts.stale ELSE NULL END AS stale,
      CASE WHEN p.status='ACTIVE' THEN flags.count ELSE NULL END AS "activeHelpFlags"
    FROM selected p
    CROSS JOIN LATERAL (
      SELECT jsonb_build_object(
        'created',count(*) FILTER (WHERE t.status='CREATED'),
        'submitted',count(*) FILTER (WHERE t.status='SUBMITTED'),
        'approved',count(*) FILTER (WHERE t.status='APPROVED'),
        'assignedInProgress',count(*) FILTER (WHERE t.status IN ('ASSIGNED','IN_PROGRESS')),
        'pendingApproval',count(*) FILTER (WHERE t.status='PENDING_PC_APPROVAL'),
        'delayed',count(*) FILTER (WHERE t.status='DELAYED'),
        'canceled',count(*) FILTER (WHERE t.status IN ('REQUESTER_CANCELED','FIELD_CANCELED','SURVEY_CANCELED'))
      ) AS tickets,
      jsonb_build_object(
        'submitted',count(*) FILTER (WHERE t.status='SUBMITTED' AND t.submitted_at < $5::timestamptz - INTERVAL '24 hours'),
        'approved',count(*) FILTER (WHERE t.status='APPROVED' AND t.approved_at < $5::timestamptz - INTERVAL '48 hours'),
        'pendingApproval',count(*) FILTER (WHERE t.status='PENDING_PC_APPROVAL' AND t.updated_at < $5::timestamptz - INTERVAL '4 hours')
      ) AS stale
      FROM tickets t WHERE t.tenant_id=$1 AND t.project_id=p.id AND p.status='ACTIVE'
        AND t.draft_deleted_at IS NULL
    ) counts
    CROSS JOIN LATERAL (
      SELECT count(*)::int AS count FROM help_flags h WHERE h.tenant_id=$1 AND h.project_id=p.id
        AND p.status='ACTIVE' AND h.status='ACTIVE' AND h.level=2
    ) flags ORDER BY p.name,p.id`,[query.tenantId,query.userId,query.limit,query.offset,now])).rows;
  }
  async names(db:DbClient,tenantId:UUID,userIds:UUID[]) {
    return (await db.query<{id:UUID;name:string}>(
      'SELECT id,name FROM users WHERE tenant_id=$1 AND id=ANY($2::uuid[])',[tenantId,userIds])).rows;
  }
}
