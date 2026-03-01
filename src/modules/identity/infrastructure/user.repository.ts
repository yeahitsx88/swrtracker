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

interface DbRow {
  id: string;
  tenant_id: string;
  company_id: string;
  email: string;
  password_hash: string | null;
  auth_method: string;
  name: string;
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
    createdAt:  row.created_at,
  };
}

export class UserRepository implements IUserRepository {
  async findByEmail(db: DbClient, tenantId: UUID, email: string): Promise<UserWithCredentials | null> {
    const { rows } = await db.query<DbRow>(
      `SELECT id, tenant_id, company_id, email, password_hash, auth_method, name, created_at
       FROM users
       WHERE tenant_id = $1 AND email = $2
       LIMIT 1`,
      [tenantId, email],
    );
    return rows[0] ? rowToUserWithCreds(rows[0]) : null;
  }

  async findById(db: DbClient, tenantId: UUID, userId: UUID): Promise<User | null> {
    const { rows } = await db.query<DbRow>(
      `SELECT id, tenant_id, company_id, email, password_hash, auth_method, name, created_at
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
}
