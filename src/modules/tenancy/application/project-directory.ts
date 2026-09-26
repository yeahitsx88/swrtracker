import { ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import { getTenantRole } from '@/lib/get-tenant-role';

const ticketVisibleRoles = new Set([
  'REQUESTER', 'SURVEY_MANAGER', 'SURVEY_SUPERINTENDENT', 'PARTY_CHIEF',
  'INSTRUMENT_MAN', 'CAD_TECHNICIAN', 'CAD_LEAD', 'VIEWER', 'AREA_VIEWER',
  'DEPARTMENT_MANAGER', 'DEPARTMENT_LEAD', 'SUBCONTRACTS_COORDINATOR',
]);

export interface DirectoryProject {
  id: UUID;
  name: string;
  status: 'SETUP' | 'ACTIVE' | 'ARCHIVED';
  roles: string[];
}

export interface ProjectDirectoryPort {
  list(db: DbClient, params: {
    tenantId: UUID; userId: UUID; limit: number; offset: number;
  }): Promise<DirectoryProject[]>;
}

export async function listAccessibleProjects(repo: ProjectDirectoryPort, db: DbClient,
  params: { tenantId: UUID; userId: UUID; limit: number; offset: number }) {
  if (!Number.isSafeInteger(params.limit) || params.limit < 1 || params.limit > 100 ||
      !Number.isSafeInteger(params.offset) || params.offset < 0 || params.offset > 100000) {
    throw new ValidationError('Invalid pagination');
  }
  const rows = await repo.list(db, { ...params, limit: params.limit + 1 });
  const canViewAudit = await getTenantRole(db, params.tenantId, params.userId) === 'TENANT_ADMIN';
  return { canViewAudit, canViewTenantHealth: canViewAudit, projects: rows.slice(0, params.limit).map(project => ({ ...project,
    canRequest: project.status === 'ACTIVE' && project.roles.includes('REQUESTER'),
    canViewDeletedDrafts: project.roles.includes('PROJECT_ADMIN'),
    canViewRequests: project.status !== 'SETUP' &&
      (canViewAudit || project.roles.some(role => ticketVisibleRoles.has(role))),
  })), hasMore: rows.length > params.limit };
}
