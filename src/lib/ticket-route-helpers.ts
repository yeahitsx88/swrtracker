/**
 * Shared helpers for ticket transition route handlers.
 */
import { type NextRequest } from 'next/server';
import { NotFoundError } from '@/shared/errors';
import { requireAuth } from './auth';
import { withTransaction } from './with-transaction';
import { pool } from './db';
import { getProjectRole } from './get-project-role';
import { resolveVisibility } from './resolve-visibility';
import type { UUID } from '@/shared/types';
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
): Promise<TicketRouteContext> {
  const auth = requireAuth(req);

  const { rows } = await pool.query<{ project_id: string }>(
    `SELECT project_id FROM tickets WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
    [ticketId, auth.tenantId],
  );
  if (!rows[0]) throw new NotFoundError(`Ticket ${ticketId} not found`);
  const projectId = rows[0].project_id as UUID;

  const actorRole = await getProjectRole(
    pool, auth.tenantId, projectId, auth.userId,
  );

  const visibility = await resolveVisibility(
    pool, auth.tenantId, projectId, auth.userId, actorRole,
  );

  return {
    tenantId:  auth.tenantId,
    ticketId:  ticketId as UUID,
    actorId:   auth.userId,
    actorRole,
    projectId,
    visibility,
  };
}

export { withTransaction };