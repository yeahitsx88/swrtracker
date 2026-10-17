/**
 * CreateUser use case.
 *
 * Creates a new user within a tenant. The caller must already hold a valid tenantId
 * and companyId — this use case does not validate that those records exist.
 * Tenant/company existence is enforced by the DB foreign key constraint.
 *
 * Password hashing is done here, in the application layer, not in infrastructure.
 * bcrypt cost factor 12 — suitable for interactive logins on modern hardware.
 */
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { ConflictError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { User, UserWithCredentials } from '../domain/types';
import type { IUserRepository } from './ports';

const BCRYPT_ROUNDS = 12;

export interface CreateUserParams {
  tenantId:  UUID;
  companyId: UUID;
  email:     string;
  password:  string;
  name:      string;
}

export async function createUser(
  repo: IUserRepository,
  db: DbClient,
  params: CreateUserParams,
): Promise<User> {
  const normalizedEmail = params.email.trim().toLowerCase();
  const normalizedName = params.name.trim();

  if (!normalizedEmail) {
    throw new ValidationError('email is required');
  }
  if (!normalizedName) {
    throw new ValidationError('name is required');
  }

  const existing = await repo.findByEmail(db, params.tenantId, normalizedEmail);
  if (existing) {
    throw new ConflictError(`Email ${normalizedEmail} is already registered in this tenant`);
  }

  const passwordHash = await bcrypt.hash(params.password, BCRYPT_ROUNDS);

  const userWithCreds: UserWithCredentials = {
    id:           randomUUID() as UUID,
    tenantId:     params.tenantId,
    companyId:    params.companyId,
    email:        normalizedEmail,
    name:         normalizedName,
    authMethod:   'LOCAL',
    passwordHash,
    createdAt:    new Date(),
  };

  await repo.save(db, userWithCreds);

  const { passwordHash: _, ...user } = userWithCreds;
  return user;
}
