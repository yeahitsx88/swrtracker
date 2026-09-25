import { randomUUID } from 'node:crypto';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '../domain/types';
import { inviteStatus, publicInvite, type Invite } from '../domain/invite';
import type { InviteRepositoryPort } from './invite-ports';
import type { IUserRepository } from './ports';
import { createUser } from './create-user';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function requireManager(repo: InviteRepositoryPort, db: DbClient,
  tenantId: UUID, projectId: UUID, actorId: UUID) {
  const state = await repo.projectState(db, tenantId, projectId);
  if (!state) throw new NotFoundError('Project not found');
  if (!(await repo.canManage(db, tenantId, projectId, actorId, state))) {
    throw new ForbiddenError('Invite management requires TENANT_ADMIN or setup PROJECT_ADMIN');
  }
  return state;
}

export async function createInvite(repo: InviteRepositoryPort, db: DbClient, params: {
  tenantId: UUID; projectId: UUID; companyId: UUID; actorId: UUID;
  email: string; role: ProjectRole;
}): Promise<Invite> {
  const state = await requireManager(repo, db, params.tenantId, params.projectId, params.actorId);
  if (state === 'ARCHIVED') throw new ConflictError('Archived projects cannot receive invites');
  if (!(await repo.companyBelongsToTenant(db, params.tenantId, params.companyId))) {
    throw new ValidationError('Company does not belong to this tenant');
  }
  await repo.lockEmail(db, params.tenantId, params.projectId, params.email);
  if (await repo.activeForEmail(db, params.tenantId, params.projectId, params.email)) {
    throw new ConflictError('A pending invite already exists for this email and project');
  }
  const now = new Date();
  const invite: Invite = {
    id: randomUUID() as UUID, tenantId: params.tenantId, projectId: params.projectId,
    companyId: params.companyId, email: params.email, role: params.role,
    token: randomUUID() as UUID, invitedBy: params.actorId,
    acceptedAt: null, expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
    canceledAt: null, canceledBy: null, createdAt: now,
  };
  await repo.save(db, invite);
  await repo.appendEvent(db, params.tenantId, params.actorId, 'invite.sent', {
    inviteId: invite.id, projectId: invite.projectId, companyId: invite.companyId,
    email: invite.email, role: invite.role,
  });
  return invite;
}

export async function listInvites(repo: InviteRepositoryPort, db: DbClient, params: {
  tenantId: UUID; projectId: UUID; actorId: UUID; limit: number; offset: number;
}) {
  await requireManager(repo, db, params.tenantId, params.projectId, params.actorId);
  const now = new Date();
  const [invites, total] = await Promise.all([
    repo.list(db, params.tenantId, params.projectId, params.limit, params.offset),
    repo.count(db, params.tenantId, params.projectId),
  ]);
  return { data: invites.map(invite => publicInvite(invite, now)),
    total, limit: params.limit, offset: params.offset };
}

export async function cancelInvite(repo: InviteRepositoryPort, db: DbClient, params: {
  tenantId: UUID; projectId: UUID; inviteId: UUID; actorId: UUID;
}): Promise<void> {
  await requireManager(repo, db, params.tenantId, params.projectId, params.actorId);
  const invite = await repo.findByIdForUpdate(db, params.tenantId, params.projectId, params.inviteId);
  if (!invite) throw new NotFoundError('Invite not found');
  if (invite.acceptedAt || invite.canceledAt || invite.expiresAt <= new Date()) {
    throw new ConflictError('Invite is no longer pending');
  }
  await repo.markCanceled(db, invite, params.actorId);
  await repo.appendEvent(db, params.tenantId, params.actorId, 'invite.canceled', {
    inviteId: invite.id, projectId: invite.projectId, originalRole: invite.role,
    originalEmail: invite.email, canceledBy: params.actorId,
  });
}

async function expireIfNeeded(repo: InviteRepositoryPort, db: DbClient, invite: Invite,
  now: Date): Promise<void> {
  if (inviteStatus(invite, now) === 'EXPIRED' && !(await repo.hasExpirationEvent(db, invite))) {
    await repo.appendEvent(db, invite.tenantId, invite.invitedBy, 'invite.expired', {
      inviteId: invite.id, projectId: invite.projectId, email: invite.email,
    });
  }
}

export async function inspectInvite(repo: InviteRepositoryPort, db: DbClient, token: UUID) {
  const invite = await repo.findByTokenForUpdate(db, token);
  if (!invite) throw new NotFoundError('Invite not found');
  const now = new Date();
  await expireIfNeeded(repo, db, invite, now);
  return publicInvite(invite, now);
}

export async function acceptInvite(repo: InviteRepositoryPort, userRepo: IUserRepository,
  db: DbClient, params: {
    token: UUID; authenticatedUserId?: UUID; name?: string; password?: string;
  }): Promise<{ status: 'ACCEPTED'; userId: UUID } | { status: 'EXPIRED' }> {
  const invite = await repo.findByTokenForUpdate(db, params.token);
  if (!invite) throw new NotFoundError('Invite not found');
  const now = new Date();
  const status = inviteStatus(invite, now);
  if (status === 'EXPIRED') {
    await expireIfNeeded(repo, db, invite, now);
    return { status: 'EXPIRED' };
  }
  if (status !== 'PENDING' || !invite.companyId) {
    throw new ConflictError('Invite is no longer valid; request a new one');
  }
  const project = await repo.projectState(db, invite.tenantId, invite.projectId);
  if (!project || project === 'ARCHIVED') {
    throw new ConflictError('Project is not available for invitation acceptance');
  }
  let userId: UUID;
  if (params.authenticatedUserId) {
    const user = await userRepo.findById(db, invite.tenantId, params.authenticatedUserId);
    if (!user || user.email.toLowerCase() !== invite.email || user.companyId !== invite.companyId) {
      throw new ForbiddenError('Signed-in user does not match invitation email and company');
    }
    userId = user.id;
  } else {
    if (!params.name || !params.password) throw new ValidationError('name and password are required');
    const user = await createUser(userRepo, db, {
      tenantId: invite.tenantId, companyId: invite.companyId,
      email: invite.email, name: params.name, password: params.password,
    });
    userId = user.id;
  }
  await repo.addMembership(db, invite, userId);
  await repo.markAccepted(db, invite);
  await repo.appendEvent(db, invite.tenantId, userId, 'invite.accepted', {
    inviteId: invite.id, projectId: invite.projectId, companyId: invite.companyId,
    email: invite.email, role: invite.role,
  });
  return { status: 'ACCEPTED', userId };
}
