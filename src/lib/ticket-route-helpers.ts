/**
 * Shared helpers for ticket transition route handlers.
 */
import { type NextRequest } from 'next/server';
import { ForbiddenError, NotFoundError } from '@/shared/errors';
import { requireActiveAuth as requireAuth } from './auth';
import { withTransaction } from './with-transaction';
import { pool } from './db';
import { getProjectRole } from './get-project-role';
import { resolveVisibility } from './resolve-visibility';
import { buildVisibilityClause } from './ticket-visibility-clause';
import { requireResourceUuid } from './resource-uuid';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { VisibilityScope } from '@/modules/ticket/application/ports';

export interface TicketRouteContext {
  tenantId:   UUID;
  ticketId:   UUID;
  actorId:    UUID;
  actorRole:  ProjectRole;
  projectId:  UUID;
  visibility: VisibilityScope;
}

/**
 * Authenticates the request, resolves the ticket's project, the actor's role,
 * and the full VisibilityScope -- the complete prelude for any ticket route.
 */
export async function getTicketRouteContext(
  req: NextRequest,
  ticketId: string,
  db: DbClient = pool,
): Promise<TicketRouteContext> {
  const auth = await requireAuth(req, db);
  requireResourceUuid(ticketId, 'ticketId');

  const { rows } = await db.query<{ project_id: string }>(
    `SELECT project_id FROM tickets WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
    [ticketId, auth.tenantId],
  );
  if (!rows[0]) throw new NotFoundError(`Ticket ${ticketId} not found`);
  const projectId = rows[0].project_id as UUID;

  let actorRole: ProjectRole;
  try {
    actorRole = await getProjectRole(
      db, auth.tenantId, projectId, auth.userId, auth.sessionVersion,
    );
  } catch (error) {
    // Missing membership must not reveal the existence of a ticket. Preserve
    // authentication/session errors and unexpected failures without masking them.
    if (error instanceof ForbiddenError) throw new NotFoundError(`Ticket ${ticketId} not found`);
    throw error;
  }

  const visibility = await resolveVisibility(
    db, auth.tenantId, projectId, auth.userId, actorRole,
  );

  // Hide inaccessible resources before any route performs role/state checks or
  // replays a mutation. The use case still rechecks visibility at its own read.
  const clause = buildVisibilityClause(visibility, 4);
  const visible = await db.query(
    `SELECT t.id FROM tickets t
     WHERE t.id = $1 AND t.tenant_id = $2 AND t.project_id = $3 ${clause.sql} LIMIT 1`,
    [ticketId, auth.tenantId, projectId, ...clause.params],
  );
  if (!visible.rows[0]) throw new NotFoundError(`Ticket ${ticketId} not found`);

  return {
    tenantId:  auth.tenantId,
    ticketId:  ticketId as UUID,
    actorId:   auth.userId,
    actorRole,
    projectId,
    visibility,
  };
}

/**
 * Fresh current session, operational role and visibility before any domain lock
 * or idempotency replay. Administrative capabilities do not grant workflow power.
 */
export async function withTicketMutation<T>(
  req: NextRequest,
  expected: TicketRouteContext,
  fn: (db: DbClient, current: TicketRouteContext) => Promise<T>,
): Promise<T> {
  const auth = await requireAuth(req);
  if (auth.tenantId !== expected.tenantId || auth.userId !== expected.actorId) {
    throw new NotFoundError('Ticket not found');
  }
  let current = expected;
  return withTransaction(db => fn(db, current), {
    req, auth, mode: 'SHARED',
    authorize: async db => {
      current = await getTicketRouteContext(req, expected.ticketId, db);
    },
  });
}

export { withTransaction };
