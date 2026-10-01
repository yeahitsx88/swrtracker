import type { DbClient, UUID } from '@/shared/types';

export async function readDeletedDrafts(db: DbClient, scope: { tenantId: UUID; projectId: UUID; limit: number; offset: number }) {
  const { rows } = await db.query<{ result: unknown }>(
    `WITH drafts AS (
       SELECT t.id, t.description, t.requester_id AS "requesterId", u.name AS "requesterName",
         t.draft_deleted_at AS "deletedAt", t.draft_last_saved_at AS "lastSavedAt", t.row_version AS "rowVersion",
         t.draft_deleted_at >= NOW() - INTERVAL '30 days' AS recoverable
       FROM tickets t JOIN users u ON u.id = t.requester_id AND u.tenant_id = t.tenant_id
       WHERE t.tenant_id = $1 AND t.project_id = $2 AND t.status = 'DRAFT' AND t.draft_deleted_at IS NOT NULL
     ), page AS (SELECT * FROM drafts ORDER BY "deletedAt" DESC, id LIMIT $3 OFFSET $4)
     SELECT jsonb_build_object('data', COALESCE((SELECT jsonb_agg(page ORDER BY "deletedAt" DESC, id) FROM page), '[]'::jsonb),
       'total', (SELECT COUNT(*) FROM drafts), 'limit', $3::int, 'offset', $4::int) AS result`,
    [scope.tenantId, scope.projectId, scope.limit, scope.offset]);
  if (!rows[0]) throw new Error('Deleted draft query returned no result');
  return rows[0].result;
}
