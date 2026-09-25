/**
 * Shared helpers for ticket transition route handlers.
 */
import { type NextRequest } from 'next/server';
import { ConflictError, NotFoundError } from '@/shared/errors';
import { requireAuth } from './auth';
import { withTransaction } from './with-transaction';
import { pool } from './db';
import { getProjectWorkflowRole } from './get-project-workflow-role';
import { getTenantRole } from './get-tenant-role';
import { parseUuid } from './parse-uuid';
import { resolveVisibility } from './resolve-visibility';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { VisibilityScope } from '@/modules/ticket/application/ports';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';

export interface TicketRouteContext {
  tenantId:   UUID;
  ticketId:   UUID;
  actorId:    UUID;
  actorRole:  ProjectRole;
  projectId:  UUID;
  visibility: VisibilityScope;
}

export async function getTicketReadContext(
  req: NextRequest,
  ticketId: string,
): Promise<{ tenantId: UUID; ticketId: UUID; visibility: VisibilityScope }> {
  const auth = await requireAuth(req);
  const parsedTicketId = parseUuid(ticketId, 'ticketId');
  const visibility = await resolveTicketReadVisibility(
    pool, auth.tenantId, parsedTicketId, auth.userId,
  );
  return { tenantId: auth.tenantId, ticketId: parsedTicketId, visibility };
}

/** Resolve the same ticket read scope for HTTP requests and queued notifications. */
export async function resolveTicketReadVisibility(
  db: DbClient, tenantId: UUID, ticketId: UUID, userId: UUID,
): Promise<VisibilityScope> {
  const { rows } = await db.query<{ project_id: string }>(
    `SELECT project_id FROM tickets WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
    [ticketId, tenantId],
  );
  if (!rows[0]) throw new NotFoundError(`Ticket ${ticketId} not found`);
  const projectId = rows[0].project_id as UUID;
  const tenantRole = await getTenantRole(db, tenantId, userId);
  const actorRole = tenantRole === 'TENANT_ADMIN'
    ? tenantRole
    : await getProjectWorkflowRole(db, tenantId, projectId, userId);
  return resolveVisibility(db, tenantId, projectId, userId, actorRole);
}

export async function canReadTicket(
  db: DbClient, tenantId: UUID, ticketId: UUID, userId: UUID,
): Promise<boolean> {
  const visibility = await resolveTicketReadVisibility(db, tenantId, ticketId, userId);
  return Boolean(await new TicketRepository().findById(db, tenantId, ticketId, visibility));
}

/**
 * Authenticates the request, resolves the ticket's project, the actor's role,
 * and the full VisibilityScope -- the complete prelude for any ticket route.
 */
export async function getTicketRouteContext(
  req: NextRequest,
  ticketId: string,
): Promise<TicketRouteContext> {
  const auth = await requireAuth(req);
  const parsedTicketId = parseUuid(ticketId, 'ticketId');

  const { rows } = await pool.query<{ project_id: string; project_status: string }>(
    `SELECT t.project_id, p.status AS project_status
     FROM tickets t JOIN projects p ON p.id = t.project_id AND p.tenant_id = t.tenant_id
     WHERE t.id = $1 AND t.tenant_id = $2 LIMIT 1`,
    [parsedTicketId, auth.tenantId],
  );
  if (!rows[0]) throw new NotFoundError(`Ticket ${ticketId} not found`);
  if (rows[0].project_status !== 'ACTIVE') {
    throw new ConflictError('Ticket project is not active');
  }
  const projectId = rows[0].project_id as UUID;

  const actorRole = await getProjectWorkflowRole(
    pool, auth.tenantId, projectId, auth.userId,
  );

  const visibility = await resolveVisibility(
    pool, auth.tenantId, projectId, auth.userId, actorRole,
  );

  return {
    tenantId:  auth.tenantId,
    ticketId:  parsedTicketId,
    actorId:   auth.userId,
    actorRole,
    projectId,
    visibility,
  };
}

export { withTransaction };
