/**
 * Authenticate use case.
 *
 * Validates email + password within a tenant scope and returns a signed JWT.
 * Always uses the same error message for missing user and wrong password
 * to avoid leaking which emails are registered.
 *
 * SSO users (passwordHash = null) cannot authenticate via this path.
 */
import bcrypt from 'bcrypt';
import { UnauthorizedError } from '@/shared/errors';
import { signToken } from '@/lib/auth';
import type { DbClient, UUID } from '@/shared/types';
import type { User } from '../domain/types';
import type { IUserRepository } from './ports';

const INVALID_CREDENTIALS = 'Invalid email or password';
// bcrypt dummy hash used for constant-time comparison when user not found or SSO user
const DUMMY_HASH = '$2b$12$invalidhashpadding000000000000000000000000000000000000000';

export interface AuthenticateParams {
  tenantId: UUID;
  email:    string;
  password: string;
}

export interface AuthenticateResult {
  user:  User;
  token: string;
}

export async function authenticateUser(
  repo: IUserRepository,
  db: DbClient,
  params: AuthenticateParams,
): Promise<AuthenticateResult> {
  const userWithCreds = await repo.findByEmail(db, params.tenantId, params.email);

  // Run bcrypt even on miss / SSO user to maintain constant time — prevents timing attacks
  const hashToCompare = userWithCreds?.passwordHash ?? DUMMY_HASH;
  const passwordMatch = await bcrypt.compare(params.password, hashToCompare);

  // Reject: user not found, wrong password, or SSO user (passwordHash is null)
  if (!userWithCreds || !userWithCreds.passwordHash || !passwordMatch) {
    throw new UnauthorizedError(INVALID_CREDENTIALS);
  }
  if (userWithCreds.deactivatedAt) {
    throw new UnauthorizedError('Account is deactivated', 'AUTH_USER_DEACTIVATED');
  }

  const token = signToken(
    userWithCreds.id,
    userWithCreds.tenantId,
    userWithCreds.sessionVersion ?? 1,
  );
  const { passwordHash: _, ...user } = userWithCreds;

  return { user, token };
}
