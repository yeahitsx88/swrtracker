/**
 * Priority whitelist management — TENANT_ADMIN only.
 * See CLAUDE.md §4 Priority Flag — Path A (Whitelist).
 *
 * Changes are audit-logged by the caller (route handler) after the use case succeeds.
 */
import { randomUUID } from 'crypto';
import { ForbiddenError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { PriorityWhitelistEntry } from '../domain/types';
import type { ITenancyRepository } from './ports';

type ActorRole = ProjectRole | 'TENANT_ADMIN';

function assertTenantAdmin(actorRole: ActorRole): void {
  if (actorRole !== 'TENANT_ADMIN') {
    throw new ForbiddenError('Only TENANT_ADMIN can manage the priority whitelist');
  }
}

export async function addToWhitelist(
  repo: ITenancyRepository,
  db: DbClient,
  params: {
    tenantId:  UUID;
    projectId: UUID;
    email:     string;
    addedBy:   UUID;
    actorRole: ActorRole;
  },
): Promise<PriorityWhitelistEntry> {
  assertTenantAdmin(params.actorRole);

  const entry: PriorityWhitelistEntry = {
    id:        randomUUID() as UUID,
    tenantId:  params.tenantId,
    projectId: params.projectId,
    email:     params.email.toLowerCase(),
    addedBy:   params.addedBy,
    createdAt: new Date(),
  };
  await repo.saveWhitelistEntry(db, entry);
  return entry;
}

export async function removeFromWhitelist(
  repo: ITenancyRepository,
  db: DbClient,
  params: {
    tenantId:  UUID;
    projectId: UUID;
    email:     string;
    actorRole: ActorRole;
  },
): Promise<void> {
  assertTenantAdmin(params.actorRole);
  await repo.deleteWhitelistEntry(db, params.tenantId, params.projectId, params.email.toLowerCase());
}
