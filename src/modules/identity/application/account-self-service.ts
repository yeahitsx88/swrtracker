/**
 * Signed-in account self-service: correct your own display name and change your
 * own password. Both run inside the caller's transaction with the current
 * session re-verified under a row lock, and each records an administrative event.
 */
import bcrypt from 'bcrypt';
import { appendAdministrativeEvent } from '@/modules/audit/infrastructure/administrative-event.repository';
import { UnauthorizedError, ValidationError } from '@/shared/errors';
import type { AuthContext } from '@/lib/auth';
import type { DbClient } from '@/shared/types';
import type { LoginRateLimiter } from './login-rate-limit';

const BCRYPT_ROUNDS = 12;
export const NAME_MAX_LENGTH = 120;
export const PASSWORD_MIN_LENGTH = 8;
/** bcrypt uses only the first 72 bytes; refuse longer input rather than silently truncating it. */
export const PASSWORD_MAX_BYTES = 72;

interface LockedAccount {
  name: string;
  email: string;
  password_hash: string | null;
  auth_method: string;
  session_version: number;
}

async function lockCurrentAccount(db: DbClient, auth: AuthContext): Promise<LockedAccount> {
  const { rows } = await db.query<LockedAccount>(
    `SELECT name, email, password_hash, auth_method, COALESCE(session_version, 1) AS session_version
     FROM users
     WHERE tenant_id = $1 AND id = $2 AND deactivated_at IS NULL
     FOR UPDATE`,
    [auth.tenantId, auth.userId],
  );
  const account = rows[0];
  if (!account || account.session_version !== auth.sessionVersion) {
    throw new UnauthorizedError('Session is no longer valid', 'AUTH_SESSION_REVOKED');
  }
  return account;
}

export function normalizeDisplayName(raw: unknown): string {
  if (typeof raw !== 'string') throw new ValidationError('Enter your name.');
  const name = raw.replace(/\s+/g, ' ').trim();
  if (!name) throw new ValidationError('Enter your name.');
  if (name.length > NAME_MAX_LENGTH) throw new ValidationError(`Use ${NAME_MAX_LENGTH} characters or fewer for your name.`);
  return name;
}

export async function changeOwnName(db: DbClient, auth: AuthContext, rawName: unknown): Promise<{ name: string; changed: boolean }> {
  const name = normalizeDisplayName(rawName);
  const account = await lockCurrentAccount(db, auth);
  if (account.name === name) return { name, changed: false };
  await db.query(`UPDATE users SET name = $3 WHERE tenant_id = $1 AND id = $2`, [auth.tenantId, auth.userId, name]);
  await appendAdministrativeEvent(db, {
    auth, projectId: null, subjectUserId: auth.userId, eventType: 'account.profile_updated',
    authorityEvidence: { basis: 'SELF_SERVICE', sessionVersion: auth.sessionVersion },
    changes: { name: { from: account.name, to: name } },
  });
  return { name, changed: true };
}

export function validateNewPassword(next: unknown, current: string): string {
  if (typeof next !== 'string' || next.length < PASSWORD_MIN_LENGTH) {
    throw new ValidationError(`Use at least ${PASSWORD_MIN_LENGTH} characters for your new password.`);
  }
  if (Buffer.byteLength(next, 'utf8') > PASSWORD_MAX_BYTES) {
    throw new ValidationError(`Use a password of ${PASSWORD_MAX_BYTES} bytes or fewer.`);
  }
  if (next === current) throw new ValidationError('Choose a new password that differs from your current one.');
  return next;
}

/**
 * Step 1, outside any transaction (like sign-in): check the current password so
 * a failure is recorded against the sign-in rate limit and is not rolled back.
 * Returns the hash that was verified; step 2 refuses if it changed meanwhile.
 */
export async function verifyCurrentPassword(
  db: DbClient,
  auth: AuthContext,
  currentPassword: unknown,
  rateLimiter: LoginRateLimiter,
): Promise<{ verifiedHash: string; currentPassword: string }> {
  if (typeof currentPassword !== 'string' || !currentPassword) throw new ValidationError('Enter your current password.');
  const { rows } = await db.query<LockedAccount>(
    `SELECT name, email, password_hash, auth_method, COALESCE(session_version, 1) AS session_version
     FROM users WHERE tenant_id = $1 AND id = $2 AND deactivated_at IS NULL`,
    [auth.tenantId, auth.userId],
  );
  const account = rows[0];
  if (!account || account.session_version !== auth.sessionVersion) {
    throw new UnauthorizedError('Session is no longer valid', 'AUTH_SESSION_REVOKED');
  }
  if (account.auth_method !== 'LOCAL' || !account.password_hash) {
    throw new ValidationError('This account signs in through your organization and has no password to change here.');
  }
  const scope = { tenantId: auth.tenantId, email: account.email.trim().toLowerCase() };
  await rateLimiter.assertCanAttempt(db, scope);
  if (!await bcrypt.compare(currentPassword, account.password_hash)) {
    await rateLimiter.recordFailure(db, scope);
    throw new ValidationError('Your current password is not correct.', 'AUTH_CURRENT_PASSWORD_INVALID');
  }
  await rateLimiter.clearFailures(db, scope);
  return { verifiedHash: account.password_hash, currentPassword };
}

/**
 * Step 2, inside the caller's transaction: replace the hash, retire outstanding
 * reset links and end every other session by advancing the session version.
 * Returns the new session version so the caller can re-issue this browser's cookie.
 */
export async function changeOwnPassword(
  db: DbClient,
  auth: AuthContext,
  verified: { verifiedHash: string; currentPassword: string },
  newPassword: unknown,
): Promise<{ sessionVersion: number }> {
  const account = await lockCurrentAccount(db, auth);
  if (account.password_hash !== verified.verifiedHash) {
    throw new UnauthorizedError('Your password changed during this request. Sign in again.', 'AUTH_SESSION_REVOKED');
  }
  const next = validateNewPassword(newPassword, verified.currentPassword);
  const passwordHash = await bcrypt.hash(next, BCRYPT_ROUNDS);
  const sessionVersion = account.session_version + 1;
  await db.query(
    `UPDATE users SET password_hash = $3, session_version = $4 WHERE tenant_id = $1 AND id = $2`,
    [auth.tenantId, auth.userId, passwordHash, sessionVersion],
  );
  await db.query(
    `UPDATE password_reset_tokens SET used_at = NOW() WHERE tenant_id = $1 AND user_id = $2 AND used_at IS NULL`,
    [auth.tenantId, auth.userId],
  );
  await appendAdministrativeEvent(db, {
    auth, projectId: null, subjectUserId: auth.userId, eventType: 'password.changed',
    authorityEvidence: { basis: 'SELF_SERVICE_CURRENT_PASSWORD', priorSessionVersion: auth.sessionVersion },
    changes: { otherSessionsEnded: true, resetLinksRetired: true },
  });
  return { sessionVersion };
}
