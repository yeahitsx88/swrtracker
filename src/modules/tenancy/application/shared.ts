import { ForbiddenError } from '@/shared/errors';
import type { TenantRole, ProjectRole } from '@/modules/identity/domain/types';

export function assertTenantAdmin(actorRole: TenantRole): void {
  if (actorRole !== 'TENANT_ADMIN') {
    throw new ForbiddenError('TENANT_ADMIN role required');
  }
}

export function assertProjectConfigAdmin(actorRole: TenantRole | ProjectRole): void {
  if (actorRole !== 'TENANT_ADMIN' && actorRole !== 'PROJECT_ADMIN') {
    throw new ForbiddenError('Project configuration administrator role required');
  }
}
