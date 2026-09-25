import { randomUUID } from 'node:crypto';
import { ConflictError, ForbiddenError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '../domain/types';
import type { Invite } from '../domain/invite';
import type { InviteRepositoryPort, ProjectState } from '../application/invite-ports';

type Row = {
  id: UUID; tenant_id: UUID; project_id: UUID; company_id: UUID | null;
  email: string; role: ProjectRole; token: UUID; invited_by: UUID;
  accepted_at: Date | null; expires_at: Date; canceled_at: Date | null;
  canceled_by: UUID | null; created_at: Date;
};

function map(row: Row): Invite {
  return {
    id: row.id, tenantId: row.tenant_id, projectId: row.project_id,
    companyId: row.company_id, email: row.email, role: row.role,
    token: row.token, invitedBy: row.invited_by, acceptedAt: row.accepted_at,
    expiresAt: row.expires_at, canceledAt: row.canceled_at,
    canceledBy: row.canceled_by, createdAt: row.created_at,
  };
}

const FIELDS = `id, tenant_id, project_id, company_id, email, role, token,
  invited_by, accepted_at, expires_at, canceled_at, canceled_by, created_at`;

export class InviteRepository implements InviteRepositoryPort {
  async projectState(db: DbClient, tenantId: UUID, projectId: UUID): Promise<ProjectState | null> {
    const { rows } = await db.query<{ status: ProjectState }>(
      `SELECT status FROM projects WHERE id = $1 AND tenant_id = $2 FOR SHARE`,
      [projectId, tenantId]);
    return rows[0]?.status ?? null;
  }

  async canManage(db: DbClient, tenantId: UUID, projectId: UUID, actorId: UUID,
    state: ProjectState): Promise<boolean> {
    const { rows } = await db.query<{ allowed: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM users u WHERE u.id = $3 AND u.tenant_id = $1
          AND u.deactivated_at IS NULL AND (
            EXISTS (SELECT 1 FROM tenant_memberships tm
              WHERE tm.tenant_id = $1 AND tm.user_id = u.id AND tm.role = 'TENANT_ADMIN')
            OR ($4 = 'SETUP' AND EXISTS (SELECT 1 FROM project_memberships pm
              JOIN projects p ON p.id = pm.project_id AND p.tenant_id = $1
              WHERE pm.project_id = $2 AND pm.user_id = u.id AND pm.role = 'PROJECT_ADMIN'))
          )
      ) AS allowed`,
      [tenantId, projectId, actorId, state]);
    return rows[0]?.allowed === true;
  }

  async companyBelongsToTenant(db: DbClient, tenantId: UUID, companyId: UUID): Promise<boolean> {
    const { rows } = await db.query<{ valid: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM companies WHERE id = $2 AND tenant_id = $1) AS valid`,
      [tenantId, companyId]);
    return rows[0]?.valid === true;
  }

  async lockEmail(db: DbClient, tenantId: UUID, projectId: UUID, email: string): Promise<void> {
    await db.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
      [`invite:${tenantId}:${projectId}:${email}`]);
  }

  async activeForEmail(db: DbClient, tenantId: UUID, projectId: UUID, email: string): Promise<boolean> {
    const { rows } = await db.query<{ active: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM invites
        WHERE tenant_id = $1 AND project_id = $2 AND LOWER(email) = $3
          AND accepted_at IS NULL AND canceled_at IS NULL AND expires_at > NOW()) AS active`,
      [tenantId, projectId, email]);
    return rows[0]?.active === true;
  }

  async save(db: DbClient, invite: Invite): Promise<void> {
    await db.query(
      `INSERT INTO invites (id, tenant_id, project_id, company_id, email, role,
        token, invited_by, expires_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [invite.id, invite.tenantId, invite.projectId, invite.companyId,
        invite.email, invite.role, invite.token, invite.invitedBy,
        invite.expiresAt, invite.createdAt]);
  }

  async list(db: DbClient, tenantId: UUID, projectId: UUID,
    limit: number, offset: number): Promise<Invite[]> {
    const { rows } = await db.query<Row>(
      `SELECT ${FIELDS} FROM invites WHERE tenant_id = $1 AND project_id = $2
       ORDER BY created_at DESC, id DESC LIMIT $3 OFFSET $4`,
      [tenantId, projectId, limit, offset]);
    return rows.map(map);
  }

  async count(db: DbClient, tenantId: UUID, projectId: UUID): Promise<number> {
    const { rows } = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM invites WHERE tenant_id = $1 AND project_id = $2`,
      [tenantId, projectId]);
    return Number(rows[0]?.count ?? 0);
  }

  async findByIdForUpdate(db: DbClient, tenantId: UUID, projectId: UUID,
    id: UUID): Promise<Invite | null> {
    const { rows } = await db.query<Row>(
      `SELECT ${FIELDS} FROM invites WHERE id = $1 AND tenant_id = $2 AND project_id = $3
       FOR UPDATE`, [id, tenantId, projectId]);
    return rows[0] ? map(rows[0]) : null;
  }

  async findByTokenForUpdate(db: DbClient, token: UUID): Promise<Invite | null> {
    const { rows } = await db.query<Row>(
      `SELECT ${FIELDS} FROM invites WHERE token = $1 FOR UPDATE`, [token]);
    return rows[0] ? map(rows[0]) : null;
  }

  async markCanceled(db: DbClient, invite: Invite, actorId: UUID): Promise<void> {
    const result = await db.query<{ id: UUID }>(
      `UPDATE invites SET canceled_at = NOW(), canceled_by = $3
       WHERE id = $1 AND tenant_id = $2 AND accepted_at IS NULL AND canceled_at IS NULL
       RETURNING id`,
      [invite.id, invite.tenantId, actorId]);
    if (!result.rows[0]) throw new ConflictError('Invite is no longer pending');
  }

  async markAccepted(db: DbClient, invite: Invite): Promise<void> {
    const result = await db.query<{ id: UUID }>(
      `UPDATE invites SET accepted_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND accepted_at IS NULL
         AND canceled_at IS NULL AND expires_at > NOW() AND company_id IS NOT NULL
       RETURNING id`,
      [invite.id, invite.tenantId]);
    if (!result.rows[0]) throw new ConflictError('Invite is no longer valid');
  }

  async addMembership(db: DbClient, invite: Invite, userId: UUID): Promise<void> {
    if (!invite.companyId) throw new ForbiddenError('Legacy invite has no company binding');
    await db.query(
      `INSERT INTO project_memberships (project_id, user_id, role)
       SELECT $1, u.id, $3 FROM users u
       JOIN projects p ON p.id = $1 AND p.tenant_id = $4
       WHERE u.id = $2 AND u.tenant_id = $4 AND u.company_id = $5
         AND u.deactivated_at IS NULL AND p.status <> 'ARCHIVED'
       ON CONFLICT (project_id, user_id) DO NOTHING`,
      [invite.projectId, userId, invite.role, invite.tenantId, invite.companyId]);
    const { rows } = await db.query<{ role: ProjectRole }>(
      `SELECT pm.role FROM project_memberships pm
       JOIN projects p ON p.id = pm.project_id AND p.tenant_id = $4
       JOIN users u ON u.id = pm.user_id AND u.tenant_id = $4
       WHERE pm.project_id = $1 AND pm.user_id = $2 AND u.company_id = $3`,
      [invite.projectId, userId, invite.companyId, invite.tenantId]);
    if (rows[0]?.role !== invite.role) {
      throw new ConflictError('User has a different project role or company');
    }
  }

  async appendEvent(db: DbClient, tenantId: UUID, actorId: UUID,
    eventType: string, payload: Record<string, unknown>): Promise<void> {
    await db.query(
      `INSERT INTO tenant_events (id, tenant_id, actor_id, event_type, payload)
       VALUES ($1,$2,$3,$4,$5::jsonb)`,
      [randomUUID(), tenantId, actorId, eventType, JSON.stringify(payload)]);
  }

  async hasExpirationEvent(db: DbClient, invite: Invite): Promise<boolean> {
    const { rows } = await db.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM tenant_events
       WHERE tenant_id = $1 AND event_type = 'invite.expired'
         AND payload->>'inviteId' = $2) AS exists`,
      [invite.tenantId, invite.id]);
    return rows[0]?.exists === true;
  }
}
