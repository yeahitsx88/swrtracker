/**
 * Conversation on a request. Anyone who can see the request can read it; the
 * requester and survey/CAD staff on the project can post. Callers establish
 * visibility (getTicketRouteContext) before these run; posting runs in the held
 * ticket mutation transaction.
 */
import { ConflictError, ForbiddenError, ValidationError } from '@/shared/errors';
import { appendAuditEvent } from '@/modules/audit/application';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { ProjectStatus } from '@/modules/tenancy/domain/types';
import type { DbClient, UUID } from '@/shared/types';
import type { Ticket } from '../domain/types';
import { enqueueNotification } from './amelia-notifications';

export const COMMENT_MAX_LENGTH = 4000;
/** Roles that take part in the conversation in addition to the request's own requester. */
const STAFF_COMMENTERS = new Set<ProjectRole>([
  'SURVEY_MANAGER', 'SURVEY_SUPERINTENDENT', 'PARTY_CHIEF', 'INSTRUMENT_MAN', 'CAD_LEAD', 'CAD_TECHNICIAN',
]);

export interface TicketComment { id: string; authorId: string; authorName: string; body: string; createdAt: string }

export function normalizeCommentBody(raw: unknown): string {
  if (typeof raw !== 'string') throw new ValidationError('Write a comment first.');
  const body = raw.replace(/\r\n/g, '\n').trim();
  if (!body) throw new ValidationError('Write a comment first.');
  if (body.length > COMMENT_MAX_LENGTH) throw new ValidationError(`Keep comments to ${COMMENT_MAX_LENGTH} characters or fewer.`);
  return body;
}

/** True when this actor may post on this request (read access is established separately). */
export function canCommentOn(ticket: Pick<Ticket, 'status' | 'requesterId'>, actorId: UUID, actorRole: ProjectRole): boolean {
  if (ticket.status === 'DRAFT') return false;
  return ticket.requesterId === actorId || STAFF_COMMENTERS.has(actorRole);
}

export async function listTicketComments(db: DbClient, tenantId: UUID, ticketId: UUID): Promise<TicketComment[]> {
  const { rows } = await db.query<TicketComment>(
    `SELECT c.id, c.author_id AS "authorId", u.name AS "authorName", c.body, c.created_at AS "createdAt"
     FROM ticket_comments c JOIN users u ON u.id = c.author_id AND u.tenant_id = c.tenant_id
     WHERE c.tenant_id = $1 AND c.ticket_id = $2
     ORDER BY c.created_at, c.id
     LIMIT 500`,
    [tenantId, ticketId],
  );
  return rows.map(row => ({ ...row, createdAt: new Date(row.createdAt).toISOString() }));
}

export async function addTicketComment(db: DbClient, params: {
  tenantId: UUID; projectId: UUID; actorId: UUID; actorRole: ProjectRole; projectStatus: ProjectStatus;
  ticket: Pick<Ticket, 'id' | 'status' | 'requesterId' | 'assignedPartyChiefId' | 'assignedInstrumentManId' | 'surveyLeadId' | 'ticketNumber'>;
  body: string;
}): Promise<TicketComment> {
  if (params.projectStatus === 'ARCHIVED') throw new ConflictError('Archived projects are read-only');
  if (params.ticket.status === 'DRAFT') throw new ConflictError('Submit the request before starting a conversation.');
  if (!canCommentOn(params.ticket, params.actorId, params.actorRole)) {
    throw new ForbiddenError('Only the requester and survey staff working on this request can comment.');
  }
  const { rows } = await db.query<{ id: string; created_at: Date; author_name: string }>(
    `INSERT INTO ticket_comments (tenant_id, project_id, ticket_id, author_id, body)
     SELECT $1, $2, $3, u.id, $5 FROM users u WHERE u.tenant_id = $1 AND u.id = $4
     RETURNING id, created_at, (SELECT name FROM users WHERE tenant_id = $1 AND id = $4) AS author_name`,
    [params.tenantId, params.projectId, params.ticket.id, params.actorId, params.body],
  );
  const row = rows[0];
  if (!row) throw new ForbiddenError('Your account is not available for commenting.');
  await appendAuditEvent(db, {
    ticketId: params.ticket.id, tenantId: params.tenantId, actorId: params.actorId,
    eventType: 'ticket.comment_added', payload: { commentId: row.id, length: params.body.length },
  });
  const excerpt = params.body.length > 160 ? `${params.body.slice(0, 157)}…` : params.body;
  const recipients = new Set([params.ticket.requesterId, params.ticket.assignedPartyChiefId, params.ticket.assignedInstrumentManId, params.ticket.surveyLeadId]
    .filter((id): id is UUID => !!id && id !== params.actorId));
  for (const recipientUserId of recipients) {
    await enqueueNotification(db, {
      tenantId: params.tenantId, ticketId: params.ticket.id, recipientUserId, eventType: 'COMMENT_ADDED',
      payload: { commentId: row.id, authorName: row.author_name, excerpt, ticketNumber: params.ticket.ticketNumber },
      idempotencyKey: `${row.id}:comment:${recipientUserId}`,
    });
  }
  return { id: row.id, authorId: params.actorId, authorName: row.author_name, body: params.body, createdAt: row.created_at.toISOString() };
}
