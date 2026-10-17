import { ForbiddenError, NotFoundError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import { assertActiveSession, type AuthContext } from './auth';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { ProjectCapabilities } from './contracts/account-offboarding';

interface CapabilityRow {
  project_exists: boolean;
  role: ProjectRole | null;
  access_disabled_at: Date | null;
  company_type: string | null;
  central_it: boolean;
  project_admin: boolean;
}

/** Resolve independent administrative and actual operational authority. */
export async function resolveProjectCapabilities(
  db: DbClient, auth: AuthContext, projectId: UUID,
): Promise<ProjectCapabilities> {
  await assertActiveSession(db,auth);
  const { rows } = await db.query<CapabilityRow>(
    `SELECT p.id IS NOT NULL AS project_exists,pm.role,pm.access_disabled_at,
      c.type AS company_type,
      EXISTS (SELECT 1 FROM tenant_memberships tm
        WHERE tm.tenant_id=$1 AND tm.user_id=$3 AND tm.role='TENANT_ADMIN') AS central_it,
      EXISTS (SELECT 1 FROM project_admin_grants g
        WHERE g.tenant_id=$1 AND g.project_id=$2 AND g.user_id=$3
          AND g.revoked_at IS NULL) AS project_admin
    FROM users u
    JOIN companies c ON c.id=u.company_id AND c.tenant_id=u.tenant_id
    LEFT JOIN projects p ON p.id=$2 AND p.tenant_id=$1
    LEFT JOIN project_memberships pm ON pm.project_id=p.id AND pm.user_id=u.id
    WHERE u.tenant_id=$1 AND u.id=$3`,
    [auth.tenantId,projectId,auth.userId],
  );
  const row=rows[0];
  if (!row?.project_exists) throw new NotFoundError('Project not found');
  const accessDisabled=row.access_disabled_at!=null;
  const eligibleAdministrator=row.company_type==='GC'||row.company_type==='OWNER_REP';
  const centralIT=eligibleAdministrator&&row.central_it;
  const localAdmin=eligibleAdministrator&&!!row.role&&!accessDisabled&&row.project_admin;
  let operationalRole=accessDisabled?null:row.role;
  if (row.company_type==='SUBCONTRACTOR'&&operationalRole!=='REQUESTER') operationalRole=null;
  // Backfilled legacy grants are authoritative. Revoking one must not leave
  // the retained scalar PROJECT_ADMIN value as an independent permission.
  if (operationalRole==='PROJECT_ADMIN'&&!localAdmin) operationalRole=null;
  return {operationalRole,canAdminister:centralIT||localAdmin,centralIT,accessDisabled};
}

export async function assertProjectAdministrator(
  db: DbClient, auth: AuthContext, projectId: UUID,
): Promise<ProjectCapabilities> {
  const capabilities=await resolveProjectCapabilities(db,auth,projectId);
  if (!capabilities.canAdminister) throw new ForbiddenError('Project administration requires central or project IT');
  return capabilities;
}
