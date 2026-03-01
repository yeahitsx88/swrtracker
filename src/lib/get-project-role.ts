/**
 * Fetches the authenticated user's role in a project.
 * Throws ForbiddenError if the user has no membership in the project (within tenant scope).
 */
import { ForbiddenError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';

interface MembershipRow {
  role: string;
}

export async function getProjectRole(
  db: DbClient,
  tenantId: UUID,
  projectId: UUID,
  userId: UUID,
): Promise<ProjectRole> {
  const { rows } = await db.query<MembershipRow>(
    `SELECT role
     FROM project_memberships pm
     JOIN projects p ON p.id = pm.project_id
     WHERE pm.project_id = $1
       AND pm.user_id    = $2
       AND p.tenant_id   = $3
     LIMIT 1`,
    [projectId, userId, tenantId],
  );

  if (!rows[0]) {
    throw new ForbiddenError('You are not a member of this project');
  }

  return rows[0].role as ProjectRole;
}
