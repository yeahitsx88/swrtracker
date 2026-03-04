import { ForbiddenError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { TenantRole } from '@/modules/identity/domain/types';
import type { ITenancyRepository, ProjectTemplateListItem } from './ports';

export async function listProjectTemplates(
  repo: ITenancyRepository,
  db: DbClient,
  params: {
    tenantId: UUID;
    actorRole: TenantRole | null;
  },
): Promise<ProjectTemplateListItem[]> {
  if (params.actorRole !== 'TENANT_ADMIN') {
    throw new ForbiddenError('Only TENANT_ADMIN can view project templates');
  }

  return repo.listProjectTemplates(db, params.tenantId);
}
