/**
 * One in-app inbox per person per project: request notices addressed to them
 * (notification_outbox) plus survey notices (survey_notifications). A notice
 * links to its request only while the reader can still see that request.
 */
import { ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import { resolveVisibility } from '@/lib/resolve-visibility';
import { buildVisibilityClause } from '@/lib/ticket-visibility-clause';
import { describeEvent } from './local-preview';

export interface InboxActor { tenantId: UUID; projectId: UUID; actorId: UUID; actorRole: ProjectRole }
export interface InboxNotice { id: string; source: 'REQUEST' | 'SURVEY'; title: string; message: string; createdAt: string; ticketId: string | null; unread: boolean }
export interface ProjectInbox { notices: InboxNotice[]; hasMore: boolean; unread: number }

const PAGE = 25;

interface Row {
  id: string; source: 'REQUEST' | 'SURVEY'; event_type: string | null; payload: Record<string, unknown> | string | null;
  title: string | null; message: string | null; ticket_number: string | null; created_at: Date; ticket_id: string | null; unread: boolean;
}

function visibleTicketSql(clauseSql: string, alias: string): string {
  return `CASE WHEN EXISTS (SELECT t.id FROM tickets t WHERE t.tenant_id = $1 AND t.project_id = $2 AND t.id = ${alias}.ticket_id ${clauseSql})
    THEN ${alias}.ticket_id ELSE NULL END`;
}

export async function readProjectInbox(db: DbClient, actor: InboxActor, offset: number): Promise<ProjectInbox> {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100_000) throw new ValidationError('Choose a valid notifications page.');
  const visibility = await resolveVisibility(db, actor.tenantId, actor.projectId, actor.actorId, actor.actorRole);
  const clause = buildVisibilityClause(visibility, 5);
  const params = [actor.tenantId, actor.projectId, actor.actorId, offset, ...clause.params];
  const notices = `
    WITH seen AS (
      SELECT seen_through FROM notification_reads WHERE tenant_id = $1 AND project_id = $2 AND user_id = $3
    ), merged AS (
      SELECT o.id::text AS id, 'REQUEST'::text AS source, o.event_type, o.payload, NULL::text AS title, NULL::text AS message,
             t.ticket_number, o.created_at, ${visibleTicketSql(clause.sql, 'o')} AS ticket_id
      FROM notification_outbox o JOIN tickets t ON t.tenant_id = o.tenant_id AND t.id = o.ticket_id
      WHERE o.tenant_id = $1 AND t.project_id = $2 AND o.recipient_user_id = $3
      UNION ALL
      SELECT n.id::text, 'SURVEY', NULL, NULL, n.title, n.message, NULL, n.created_at, ${visibleTicketSql(clause.sql, 'n')}
      FROM survey_notifications n
      WHERE n.tenant_id = $1 AND n.project_id = $2 AND n.recipient_id = $3
    )`;
  const { rows } = await db.query<Row>(
    `${notices}
     SELECT m.*, (m.created_at > COALESCE((SELECT seen_through FROM seen), '-infinity'::timestamptz)) AS unread
     FROM merged m ORDER BY m.created_at DESC, m.id DESC LIMIT ${PAGE + 1} OFFSET $4`,
    params,
  );
  const { rows: count } = await db.query<{ unread: number }>(
    `${notices}
     SELECT COUNT(*)::int AS unread FROM merged m
     WHERE m.created_at > COALESCE((SELECT seen_through FROM seen), '-infinity'::timestamptz) AND $4::int >= 0`,
    params,
  );
  return {
    notices: rows.slice(0, PAGE).map(row => {
      const text = row.source === 'SURVEY'
        ? { subject: row.title ?? 'Survey notice', body: row.message ?? '' }
        : describeEvent(row.event_type ?? '', typeof row.payload === 'string' ? JSON.parse(row.payload) as Record<string, unknown> : row.payload ?? {}, row.ticket_number ?? 'Request');
      return { id: row.id, source: row.source, title: text.subject, message: text.body, createdAt: new Date(row.created_at).toISOString(), ticketId: row.ticket_id, unread: row.unread };
    }),
    hasMore: rows.length > PAGE,
    unread: count[0]?.unread ?? 0,
  };
}

export async function countUnreadNotices(db: DbClient, actor: InboxActor): Promise<number> {
  const { rows } = await db.query<{ unread: number }>(
    `WITH seen AS (SELECT seen_through FROM notification_reads WHERE tenant_id = $1 AND project_id = $2 AND user_id = $3)
     SELECT (
       (SELECT COUNT(*) FROM notification_outbox o JOIN tickets t ON t.tenant_id = o.tenant_id AND t.id = o.ticket_id
        WHERE o.tenant_id = $1 AND t.project_id = $2 AND o.recipient_user_id = $3
          AND o.created_at > COALESCE((SELECT seen_through FROM seen), '-infinity'::timestamptz))
     + (SELECT COUNT(*) FROM survey_notifications n
        WHERE n.tenant_id = $1 AND n.project_id = $2 AND n.recipient_id = $3
          AND n.created_at > COALESCE((SELECT seen_through FROM seen), '-infinity'::timestamptz))
     )::int AS unread`,
    [actor.tenantId, actor.projectId, actor.actorId],
  );
  return rows[0]?.unread ?? 0;
}

/** Marks everything up to now as seen for this person in this project. Never moves backwards. */
export async function markNoticesSeen(db: DbClient, actor: InboxActor): Promise<{ seenThrough: string }> {
  const { rows } = await db.query<{ seen_through: Date }>(
    `INSERT INTO notification_reads (tenant_id, project_id, user_id, seen_through)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (tenant_id, project_id, user_id)
     DO UPDATE SET seen_through = GREATEST(notification_reads.seen_through, EXCLUDED.seen_through), updated_at = NOW()
     RETURNING seen_through`,
    [actor.tenantId, actor.projectId, actor.actorId],
  );
  const row = rows[0];
  if (!row) throw new Error('Notification watermark upsert returned no row');
  return { seenThrough: new Date(row.seen_through).toISOString() };
}
