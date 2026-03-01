/**
 * Repository port for the Identity module.
 * Implemented by infrastructure/user.repository.ts.
 * Must not be imported by domain code.
 *
 * All methods accept DbClient so they can participate in pg transactions
 * (consistent with every other repository in the codebase).
 */
import type { User, UserWithCredentials } from '../domain/types';
import type { DbClient, UUID } from '@/shared/types';

export interface IUserRepository {
  findByEmail(db: DbClient, tenantId: UUID, email: string): Promise<UserWithCredentials | null>;
  findById(db: DbClient, tenantId: UUID, userId: UUID): Promise<User | null>;
  /** Checks whether an email's domain is in the allowed_domains table for this tenant. */
  isDomainAllowed(db: DbClient, tenantId: UUID, email: string): Promise<boolean>;
  save(db: DbClient, user: UserWithCredentials): Promise<void>;
}
