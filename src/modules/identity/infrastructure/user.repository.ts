/**
 * UserRepository — pg implementation of IUserRepository.
 *
 * Accepts DbClient on every method — consistent with all other repositories.
 * This allows callers to pass a pool client inside a pg transaction when needed.
 * All queries are scoped by tenant_id. Never expose password_hash outside this file.
 */
import type { DbClient, UUID } from '@/shared/types';
import type { AuthMethod, User, UserWithCredentials } from '../domain/types';
import type { IUserRepository } from '../application/ports';
import type { PasswordResetToken } from '../application/password-reset';

interface DbRow {
  id: string;
  tenant_id: string;
  company_id: string;
  email: string;
  password_hash: string | null;
  auth_method: string;
  name: string;
  session_version: number;
  deactivated_at: Date | null;
  created_at: Date;
}

interface PasswordResetTokenRow {
  id: string;
  tenant_id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
}

function rowToUserWithCreds(row: DbRow): UserWithCredentials {
  return {
    id:           row.id as UUID,
    tenantId:     row.tenant_id as UUID,
    companyId:    row.company_id as UUID,
    email:        row.email,
    name:         row.name,
    authMethod:   row.auth_method as AuthMethod,
    sessionVersion: row.session_version,
    deactivatedAt: row.deactivated_at,
    passwordHash: row.password_hash,
    createdAt:    row.created_at,
  };
}

function rowToUser(row: DbRow): User {
  return {
    id:         row.id as UUID,
    tenantId:   row.tenant_id as UUID,
    companyId:  row.company_id as UUID,
    email:      row.email,
    name:       row.name,
    authMethod: row.auth_method as AuthMethod,
    sessionVersion: row.session_version,
    deactivatedAt: row.deactivated_at,
    createdAt:  row.created_at,
  };
}

export class UserRepository implements IUserRepository {
  async findByEmail(db: DbClient, tenantId: UUID, email: string): Promise<UserWithCredentials | null> {
    const { rows } = await db.query<DbRow>(
      `SELECT id, tenant_id, company_id, email, password_hash, auth_method, name, session_version, deactivated_at, created_at
       FROM users
       WHERE tenant_id = $1 AND LOWER(email) = LOWER($2)
       LIMIT 1`,
      [tenantId, email],
    );
    return rows[0] ? rowToUserWithCreds(rows[0]) : null;
  }

  async findById(db: DbClient, tenantId: UUID, userId: UUID): Promise<User | null> {
    const { rows } = await db.query<DbRow>(
      `SELECT id, tenant_id, company_id, email, password_hash, auth_method, name, session_version, deactivated_at, created_at
       FROM users
       WHERE tenant_id = $1 AND id = $2
       LIMIT 1`,
      [tenantId, userId],
    );
    return rows[0] ? rowToUser(rows[0]) : null;
  }

  /**
   * Returns true if the domain part of `email` matches a row in allowed_domains
   * for this tenant. Case-insensitive match against the stored domain.
   */
  async isDomainAllowed(db: DbClient, tenantId: UUID, email: string): Promise<boolean> {
    const domain = email.split('@')[1]?.toLowerCase() ?? '';
    if (!domain) return false;

    const { rows } = await db.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM allowed_domains
         WHERE tenant_id = $1 AND LOWER(domain) = $2
       ) AS exists`,
      [tenantId, domain],
    );
    return rows[0]?.exists === true;
  }

  async isCompanyInTenant(db: DbClient, tenantId: UUID, companyId: UUID): Promise<boolean> {
    const { rows } = await db.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM companies
         WHERE tenant_id = $1
           AND id = $2
       ) AS exists`,
      [tenantId, companyId],
    );
    return rows[0]?.exists === true;
  }

  async listRegisterableProjectIds(db: DbClient, tenantId: UUID): Promise<UUID[]> {
    const { rows } = await db.query<{ id: string }>(
      `SELECT id
       FROM projects
       WHERE tenant_id = $1
         AND status <> 'ARCHIVED'
       ORDER BY created_at ASC`,
      [tenantId],
    );
    return rows.map((row) => row.id as UUID);
  }

  async saveProjectMembership(
    db: DbClient,
    membership: { id: UUID; projectId: UUID; userId: UUID; role: string; createdAt: Date },
  ): Promise<void> {
    await db.query(
      `INSERT INTO project_memberships (id, project_id, user_id, role, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (project_id, user_id) DO UPDATE
       SET role = EXCLUDED.role`,
      [
        membership.id,
        membership.projectId,
        membership.userId,
        membership.role,
        membership.createdAt,
      ],
    );
  }

  async findActiveInviteByToken(
    db: DbClient,
    token: string,
  ): Promise<{ tenantId: UUID; projectId: UUID; email: string; role: string } | null> {
    const { rows } = await db.query<{
      tenant_id: string;
      project_id: string;
      email: string;
      role: string;
    }>(
      `SELECT tenant_id, project_id, email, role
       FROM invites
       WHERE token = $1
         AND accepted_at IS NULL
         AND canceled_at IS NULL
         AND expires_at > NOW()
       LIMIT 1`,
      [token],
    );

    if (!rows[0]) return null;
    return {
      tenantId: rows[0].tenant_id as UUID,
      projectId: rows[0].project_id as UUID,
      email: rows[0].email,
      role: rows[0].role,
    };
  }

  async markInviteAccepted(db: DbClient, token: string, acceptedAt: Date): Promise<void> {
    await db.query(
      `UPDATE invites
       SET accepted_at = $2
       WHERE token = $1
         AND accepted_at IS NULL`,
      [token, acceptedAt],
    );
  }

  async save(db: DbClient, user: UserWithCredentials): Promise<void> {
    await db.query(
      `INSERT INTO users (id, tenant_id, company_id, email, password_hash, auth_method, name, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        user.id,
        user.tenantId,
        user.companyId,
        user.email,
        user.passwordHash,
        user.authMethod,
        user.name,
        user.createdAt,
      ],
    );
  }

  async savePasswordResetToken(db: DbClient, token: PasswordResetToken): Promise<void> {
    await db.query(
      `INSERT INTO password_reset_tokens (
         id, tenant_id, user_id, token_hash, expires_at, used_at, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        token.id,
        token.tenantId,
        token.userId,
        token.tokenHash,
        token.expiresAt,
        token.usedAt,
        token.createdAt,
      ],
    );
  }

  async findActivePasswordResetTokenByHash(
    db: DbClient,
    tokenHash: string,
    now: Date,
  ): Promise<PasswordResetToken | null> {
    const { rows } = await db.query<PasswordResetTokenRow>(
      `SELECT id, tenant_id, user_id, token_hash, expires_at, used_at, created_at
       FROM password_reset_tokens
       WHERE token_hash = $1
         AND used_at IS NULL
         AND expires_at > $2
       LIMIT 1`,
      [tokenHash, now],
    );

    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      id: row.id as UUID,
      tenantId: row.tenant_id as UUID,
      userId: row.user_id as UUID,
      tokenHash: row.token_hash,
      expiresAt: row.expires_at,
      usedAt: row.used_at,
      createdAt: row.created_at,
    };
  }

  async markPasswordResetTokenUsed(db: DbClient, tokenId: UUID, usedAt: Date): Promise<void> {
    await db.query(
      `UPDATE password_reset_tokens
       SET used_at = $2
       WHERE id = $1
         AND used_at IS NULL`,
      [tokenId, usedAt],
    );
  }

  async markActivePasswordResetTokensUsedForUser(
    db: DbClient,
    tenantId: UUID,
    userId: UUID,
    usedAt: Date,
  ): Promise<void> {
    await db.query(
      `UPDATE password_reset_tokens
       SET used_at = $3
       WHERE tenant_id = $1
         AND user_id = $2
         AND used_at IS NULL`,
      [tenantId, userId, usedAt],
    );
  }

  async updatePasswordHash(
    db: DbClient,
    tenantId: UUID,
    userId: UUID,
    passwordHash: string,
  ): Promise<void> {
    await db.query(
      `UPDATE users
       SET password_hash = $3
       WHERE tenant_id = $1
         AND id = $2`,
      [tenantId, userId, passwordHash],
    );
  }

  async bumpSessionVersion(db: DbClient, tenantId: UUID, userId: UUID): Promise<void> {
    await db.query(
      `UPDATE users
       SET session_version = COALESCE(session_version, 1) + 1
       WHERE tenant_id = $1
         AND id = $2`,
      [tenantId, userId],
    );
  }
}
