import { ForbiddenError, NotFoundError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import { assertActiveSession, type AuthContext } from './auth';

/** Central IT maps to TENANT_ADMIN; project IT maps to PROJECT_ADMIN. */
export async function assertAccessAdministrator(
  db: DbClient,
  auth: AuthContext,
  projectId: UUID,
): Promise<void> {
  await assertActiveSession(db, auth);
  const { rows } = await db.query<{
    project_exists: boolean;
    central_admin: boolean;
    project_admin: boolean;
  }>(
    `SELECT
       EXISTS (SELECT 1 FROM projects p WHERE p.id = $2 AND p.tenant_id = $1) AS project_exists,
       EXISTS (
         SELECT 1 FROM tenant_memberships tm
         WHERE tm.tenant_id = $1 AND tm.user_id = $3 AND tm.role = 'TENANT_ADMIN'
       ) AS central_admin,
       EXISTS (
         SELECT 1 FROM project_memberships pm
         JOIN projects p ON p.id = pm.project_id AND p.tenant_id = $1
         WHERE pm.project_id = $2 AND pm.user_id = $3 AND pm.role = 'PROJECT_ADMIN'
       ) AS project_admin`,
    [auth.tenantId, projectId, auth.userId],
  );
  const access = rows[0];
  if (!access?.project_exists) throw new NotFoundError('Project not found');
  if (!access.central_admin && !access.project_admin) {
    throw new ForbiddenError('Access administration requires central or project IT');
  }
}
