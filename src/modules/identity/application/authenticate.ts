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
import { RateLimitError, UnauthorizedError } from '@/shared/errors';
import { signToken } from '@/lib/auth';
import type { DbClient, UUID } from '@/shared/types';
import type { User } from '../domain/types';
import type { LoginRateLimiter, LoginRateLimitScope } from './login-rate-limit';
import type { EmailAccount, IEmailAccountLookup, IUserRepository } from './ports';

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

/**
 * Bounds bcrypt work per email-only attempt. An email with more accounts than
 * this can still sign in to a specific organization with an explicit tenantId.
 */
export const MAX_EMAIL_SIGN_IN_ACCOUNTS = 10;

export interface EmailSignInParams {
  email:    string;
  password: string;
}

export interface OrganizationChoice {
  tenantId: UUID;
  name:     string;
}

export type EmailSignInResult =
  | ({ kind: 'signed-in' } & AuthenticateResult)
  | { kind: 'choose-organization'; organizations: OrganizationChoice[] };

/**
 * Email-only sign-in (Decision 58). The organization is resolved after the
 * password check: only accounts whose password matched are ever named back to
 * the caller. A wrong email and a wrong password give the same error, and
 * failures count against every candidate account's existing lockout.
 */
export async function signInByEmail(
  lookup: IEmailAccountLookup,
  rateLimiter: LoginRateLimiter,
  db: DbClient,
  params: EmailSignInParams,
): Promise<EmailSignInResult> {
  const accounts = (await lookup.findLocalAccountsByEmail(db, params.email, MAX_EMAIL_SIGN_IN_ACCOUNTS))
    .filter((account) => account.passwordHash);

  if (accounts.length === 0) {
    // Unknown email: same work and message as a wrong password, and no lockout
    // bookkeeping for anonymous input (matching the per-tenant limiter).
    await bcrypt.compare(params.password, DUMMY_HASH);
    throw new UnauthorizedError(INVALID_CREDENTIALS);
  }

  const scopes: LoginRateLimitScope[] = accounts.map((account) => ({
    tenantId: account.tenantId,
    email: params.email,
  }));
  for (const scope of scopes) {
    await rateLimiter.assertCanAttempt(db, scope);
  }

  // Compared together so several same-email accounts cost about one comparison.
  const results = await Promise.all(
    accounts.map((account) => bcrypt.compare(params.password, account.passwordHash as string)),
  );
  const matched = accounts.filter((_, index) => results[index]);
  const active = matched.filter((account) => !account.deactivatedAt);

  if (active.length === 0) {
    await recordFailures(rateLimiter, db, scopes);
    throw matched.length === 0
      ? new UnauthorizedError(INVALID_CREDENTIALS)
      : new UnauthorizedError('Account is deactivated', 'AUTH_USER_DEACTIVATED');
  }

  if (active.length > 1) {
    return {
      kind: 'choose-organization',
      organizations: active.map((account) => ({ tenantId: account.tenantId, name: account.tenantName })),
    };
  }

  const account = active[0] as EmailAccount;
  await rateLimiter.clearFailures(db, { tenantId: account.tenantId, email: params.email });
  const token = signToken(account.id, account.tenantId, account.sessionVersion ?? 1);
  const { passwordHash: _hash, tenantName: _tenantName, ...user } = account;
  return { kind: 'signed-in', user, token };
}

/** Records the failure on every candidate, then reports a lockout if any began. */
async function recordFailures(
  rateLimiter: LoginRateLimiter,
  db: DbClient,
  scopes: readonly LoginRateLimitScope[],
): Promise<void> {
  let limited: RateLimitError | null = null;
  for (const scope of scopes) {
    try {
      await rateLimiter.recordFailure(db, scope);
    } catch (err) {
      if (!(err instanceof RateLimitError)) throw err;
      limited = err;
    }
  }
  if (limited) throw limited;
}
