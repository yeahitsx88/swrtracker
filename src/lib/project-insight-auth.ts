import { ForbiddenError } from '@/shared/errors';
import { pool } from './db';
import { resolveProjectCapabilities } from './project-capabilities';

import type { AuthContext } from './auth';
import type { ProjectRole, TenantRole } from '@/modules/identity/domain/types';
import type { UUID } from '@/shared/types';

export type ProjectInsightRole = ProjectRole | TenantRole;

export async function resolveProjectInsightRole(auth: AuthContext, projectId: UUID, db: import('@/shared/types').DbClient=pool): Promise<ProjectInsightRole> {
  const caps = await resolveProjectCapabilities(db, auth, projectId);
  if (caps.operationalRole === 'SURVEY_MANAGER') return 'SURVEY_MANAGER';
  if (caps.centralIT) return 'TENANT_ADMIN';
  if (caps.canAdminister) return 'PROJECT_ADMIN';
  if (caps.operationalRole) return caps.operationalRole;
  throw new ForbiddenError('Current project access is required');
}

export function assertOperationsViewer(role: ProjectInsightRole): void {
  if (!['TENANT_ADMIN', 'PROJECT_ADMIN', 'SURVEY_MANAGER'].includes(role)) {
    throw new ForbiddenError('Only IT administrators or the Survey Lead may view project operations');
  }
}
