import { ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';

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
  return { projects: rows.slice(0, params.limit).map(project => ({ ...project,
    canRequest: project.status === 'ACTIVE' && project.roles.includes('REQUESTER'),
    canViewRequests: project.status !== 'SETUP',
  })), hasMore: rows.length > params.limit };
}
