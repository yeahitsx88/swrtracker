import { ForbiddenError } from '@/shared/errors';
import { pool } from './db';
import { getProjectRole } from './get-project-role';
import { getTenantRole } from './get-tenant-role';
import type { AuthContext } from './auth';
import type { ProjectRole, TenantRole } from '@/modules/identity/domain/types';
import type { UUID } from '@/shared/types';

export type ProjectInsightRole = ProjectRole | TenantRole;

export async function resolveProjectInsightRole(auth: AuthContext, projectId: UUID): Promise<ProjectInsightRole> {
  const tenantRole = await getTenantRole(pool, auth.tenantId, auth.userId, auth.sessionVersion);
  if (tenantRole === 'TENANT_ADMIN') return tenantRole;
  return getProjectRole(pool, auth.tenantId, projectId, auth.userId, auth.sessionVersion);
}

export function assertOperationsViewer(role: ProjectInsightRole): void {
  if (!['TENANT_ADMIN', 'PROJECT_ADMIN', 'SURVEY_MANAGER'].includes(role)) {
    throw new ForbiddenError('Only IT administrators or the Survey Lead may view project operations');
  }
}
