import type { DbClient, UUID } from '@/shared/types';
import type { Invite } from '../domain/invite';

export type ProjectState = 'SETUP' | 'ACTIVE' | 'ARCHIVED';

export interface InviteRepositoryPort {
  projectState(db: DbClient, tenantId: UUID, projectId: UUID): Promise<ProjectState | null>;
  canManage(db: DbClient, tenantId: UUID, projectId: UUID, actorId: UUID,
    state: ProjectState): Promise<boolean>;
  companyBelongsToTenant(db: DbClient, tenantId: UUID, companyId: UUID): Promise<boolean>;
  lockEmail(db: DbClient, tenantId: UUID, projectId: UUID, email: string): Promise<void>;
  activeForEmail(db: DbClient, tenantId: UUID, projectId: UUID, email: string): Promise<boolean>;
  save(db: DbClient, invite: Invite): Promise<void>;
  list(db: DbClient, tenantId: UUID, projectId: UUID, limit: number, offset: number): Promise<Invite[]>;
  count(db: DbClient, tenantId: UUID, projectId: UUID): Promise<number>;
  findByIdForUpdate(db: DbClient, tenantId: UUID, projectId: UUID, id: UUID): Promise<Invite | null>;
  findByTokenForUpdate(db: DbClient, token: UUID): Promise<Invite | null>;
  markCanceled(db: DbClient, invite: Invite, actorId: UUID): Promise<void>;
  markAccepted(db: DbClient, invite: Invite): Promise<void>;
  addMembership(db: DbClient, invite: Invite, userId: UUID): Promise<void>;
  appendEvent(db: DbClient, tenantId: UUID, actorId: UUID, eventType: string,
    payload: Record<string, unknown>): Promise<void>;
  hasExpirationEvent(db: DbClient, invite: Invite): Promise<boolean>;
}
