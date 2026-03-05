import { randomUUID } from 'crypto';
import { ForbiddenError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { TenantMembership } from '../domain/types';
import type { ITenancyRepository } from './ports';

type TenantMembershipRole = TenantMembership['role'];

function assertTenantAdmin(actorRole: TenantMembershipRole | null): void {
  if (actorRole !== 'TENANT_ADMIN') {
    throw new ForbiddenError('Only TENANT_ADMIN can manage tenant memberships');
  }
}

export async function upsertTenantMembership(
  repo: ITenancyRepository,
  db: DbClient,
  params: {
    tenantId: UUID;
    userId: UUID;
    role: TenantMembershipRole;
    actorRole: TenantMembershipRole | null;
  },
): Promise<TenantMembership> {
  assertTenantAdmin(params.actorRole);

  const membership: TenantMembership = {
    id: randomUUID() as UUID,
    tenantId: params.tenantId,
    userId: params.userId,
    role: params.role,
    createdAt: new Date(),
  };
  await repo.saveTenantMembership(db, membership);
  await repo.bumpUserSessionVersion?.(db, params.tenantId, params.userId);
  return membership;
}

export async function removeTenantMembership(
  repo: ITenancyRepository,
  db: DbClient,
  params: {
    tenantId: UUID;
    userId: UUID;
    actorRole: TenantMembershipRole | null;
  },
): Promise<void> {
  assertTenantAdmin(params.actorRole);
  await repo.deleteTenantMembership(db, params.tenantId, params.userId);
  await repo.bumpUserSessionVersion?.(db, params.tenantId, params.userId);
}
