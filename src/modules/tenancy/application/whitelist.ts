/**
 * Priority whitelist management — TENANT_ADMIN only.
 * See CLAUDE.md §4 Priority Flag — Path A (Whitelist).
 *
 * Changes and tenant audit events are written in the caller's transaction.
 */
import { randomUUID } from 'crypto';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole, TenantRole } from '@/modules/identity/domain/types';
import type { PriorityWhitelistEntry } from '../domain/types';
import type { ITenancyRepository } from './ports';

type ActorRole = ProjectRole | TenantRole;

function assertWhitelistAdmin(actorRole: ActorRole, projectStatus: string): void {
  if (actorRole !== 'TENANT_ADMIN' &&
      !(actorRole === 'PROJECT_ADMIN' && projectStatus === 'SETUP')) {
    throw new ForbiddenError('Only TENANT_ADMIN or SETUP PROJECT_ADMIN can manage the priority whitelist');
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
  const project = await repo.findProjectById(db, params.tenantId, params.projectId);
  if (!project) throw new NotFoundError('Project not found');
  if (project.status === 'ARCHIVED') throw new ConflictError('Project is archived');
  assertWhitelistAdmin(params.actorRole, project.status);
  const email = params.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new ValidationError('A valid email address is required');
  }

  const entry: PriorityWhitelistEntry = {
    id:        randomUUID() as UUID,
    tenantId:  params.tenantId,
    projectId: params.projectId,
    email,
    addedBy:   params.addedBy,
    createdAt: new Date(),
  };
  if (!(await repo.saveWhitelistEntry(db, entry))) {
    throw new ConflictError('Email is already whitelisted');
  }
  await repo.appendTenantEvent(db, params.tenantId, params.addedBy,
    'whitelist.entry_added', { projectId: params.projectId, email });
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
    actorId:   UUID;
  },
): Promise<void> {
  const project = await repo.findProjectById(db, params.tenantId, params.projectId);
  if (!project) throw new NotFoundError('Project not found');
  if (project.status === 'ARCHIVED') throw new ConflictError('Project is archived');
  assertWhitelistAdmin(params.actorRole, project.status);
  const email = params.email.trim().toLowerCase();
  if (!(await repo.deleteWhitelistEntry(db, params.tenantId, params.projectId, email))) {
    throw new NotFoundError('Whitelist entry not found');
  }
  await repo.appendTenantEvent(db, params.tenantId, params.actorId,
    'whitelist.entry_removed', { projectId: params.projectId, email });
}
