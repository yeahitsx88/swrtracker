import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse } from '@/lib/api-error';
import { assertActiveSession, requireAuth, requireActiveAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import type { AuthContext } from '@/lib/auth';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { DbClient } from '@/shared/types';

interface ProjectMembershipRow {
  id: string;
  name: string;
  status: 'ACTIVE' | 'ARCHIVED';
  role: ProjectRole;
  canAdminister?: boolean;
}

export interface ProjectListRouteDeps {
  requireAuth(req: NextRequest): AuthContext | Promise<AuthContext>;
  assertActiveSession(db: DbClient, auth: AuthContext): Promise<void>;
  db: DbClient;
}

const defaultDeps: ProjectListRouteDeps = {
  requireAuth: requireActiveAuth,
  assertActiveSession,
  db: pool,
};

export async function handleGetProjects(
  req: NextRequest,
  deps: ProjectListRouteDeps = defaultDeps,
) {
  try {
    const auth = await deps.requireAuth(req);
    await deps.assertActiveSession(deps.db, auth);

    const { rows } = await deps.db.query<ProjectMembershipRow>(
      `SELECT p.id, p.name, p.status, pm.role,
         EXISTS(SELECT 1 FROM project_admin_grants grant_row WHERE grant_row.tenant_id=p.tenant_id
           AND grant_row.project_id=p.id AND grant_row.user_id=pm.user_id AND grant_row.revoked_at IS NULL
           AND c.type IN ('GC','OWNER_REP')) AS "canAdminister"
       FROM project_memberships pm
       JOIN projects p
         ON p.id = pm.project_id
       JOIN users u
         ON u.id = pm.user_id
        AND u.tenant_id = p.tenant_id
       JOIN companies c
         ON c.id = u.company_id
        AND c.tenant_id = u.tenant_id
       WHERE p.tenant_id = $1
         AND pm.user_id = $2
         AND p.status IN ('ACTIVE', 'ARCHIVED')
         AND u.deactivated_at IS NULL AND pm.access_disabled_at IS NULL
         AND (pm.role <> 'PROJECT_ADMIN' OR EXISTS(
           SELECT 1 FROM project_admin_grants g WHERE g.tenant_id=p.tenant_id
             AND g.project_id=pm.project_id AND g.user_id=pm.user_id AND g.revoked_at IS NULL))
         AND (c.type <> 'SUBCONTRACTOR' OR pm.role = 'REQUESTER')
       ORDER BY p.name, p.id`,
      [auth.tenantId, auth.userId],
    );

    return NextResponse.json({
      projects: rows.map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        role: row.role,
        ...(row.canAdminister ? {canAdminister:true} : {}),
      })),
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    return errorResponse(err);
  }
}
