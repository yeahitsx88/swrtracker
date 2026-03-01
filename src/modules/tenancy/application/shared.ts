import { ForbiddenError } from '@/shared/errors';
import type { TenantRole } from '@/modules/identity/domain/types';

export function assertTenantAdmin(actorRole: TenantRole | null): void {
  if (actorRole !== 'TENANT_ADMIN') {
    throw new ForbiddenError('Only TENANT_ADMIN can perform this action');
  }
}
