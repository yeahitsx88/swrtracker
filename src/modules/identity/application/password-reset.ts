/**
 * Password reset use-cases for LOCAL auth users.
 *
 * Forgot-password requests always return success at the route layer to avoid
 * account enumeration. This use-case returns a token only when a LOCAL user
 * exists for the provided tenant/email pair.
 */
import bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { randomUUID } from 'crypto';
import { NotFoundError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { UserWithCredentials } from '../domain/types';

import { acquireTenantLifecycleLock } from '@/lib/tenant-lifecycle-lock';
import { appendAdministrativeEvent } from '@/modules/audit/infrastructure/administrative-event.repository';

const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_TTL_MINUTES = 60;
const BCRYPT_ROUNDS = 12;
const RESET_RESEND_COOLDOWN_MINUTES = 10;

export interface PasswordResetToken {
  id: UUID;
  tenantId: UUID;
  userId: UUID;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

export interface IPasswordResetRepository {
  findByEmail(db: DbClient, tenantId: UUID, email: string): Promise<UserWithCredentials | null>;
  lockPasswordResetUser(db: DbClient, tenantId: UUID, userId: UUID): Promise<UserWithCredentials | null>;
  findRecentActivePasswordResetToken(
    db: DbClient, tenantId: UUID, userId: UUID, issuedAfter: Date, now: Date,
  ): Promise<PasswordResetToken | null>;
  savePasswordResetToken(db: DbClient, token: PasswordResetToken): Promise<void>;
  findActivePasswordResetTokenByHash(
    db: DbClient,
    tokenHash: string,
    now: Date,
    lock?: boolean,
  ): Promise<PasswordResetToken | null>;
  markPasswordResetTokenUsed(db: DbClient, tokenId: UUID, usedAt: Date): Promise<void>;
  markActivePasswordResetTokensUsedForUser(
    db: DbClient,
    tenantId: UUID,
    userId: UUID,
    usedAt: Date,
  ): Promise<void>;
  updatePasswordHash(
    db: DbClient,
    tenantId: UUID,
    userId: UUID,
    passwordHash: string,
  ): Promise<void>;
  bumpSessionVersion(db: DbClient, tenantId: UUID, userId: UUID): Promise<void>;
}

export interface RequestPasswordResetParams {
  tenantId: UUID;
  email: string;
  now?: Date;
  generateToken?: () => string;
}

export interface RequestPasswordResetResult {
  resetToken: string | null;
}

export async function requestPasswordReset(
  repo: IPasswordResetRepository,
  db: DbClient,
  params: RequestPasswordResetParams,
): Promise<RequestPasswordResetResult> {
  const now = params.now ?? new Date();
  try {
    await acquireTenantLifecycleLock(db, params.tenantId, 'EXCLUSIVE');
  } catch (err) {
    if (err instanceof NotFoundError) return {resetToken: null};
    throw err;
  }
  const user = await repo.findByEmail(db, params.tenantId, params.email.trim());

  if (!user || user.authMethod !== 'LOCAL' || !user.passwordHash || user.deactivatedAt) {
    return { resetToken: null };
  }

  // Serialize competing requests before checking the cooldown. A repeat request
  // must not invalidate a link that was already delivered to the user.
  const current = await repo.lockPasswordResetUser(db, user.tenantId, user.id);
  if (!current || current.deactivatedAt || current.authMethod !== 'LOCAL' || !current.passwordHash) {
    return {resetToken: null};
  }
  const recent = await repo.findRecentActivePasswordResetToken(
    db, user.tenantId, user.id,
    new Date(now.getTime() - RESET_RESEND_COOLDOWN_MINUTES * 60_000), now,
  );
  if (recent) return { resetToken: null };

  const resetToken = params.generateToken?.() ?? randomBytes(RESET_TOKEN_BYTES).toString('hex');
  const tokenHash = hashPasswordResetToken(resetToken);
  const expiresAt = new Date(now.getTime() + (RESET_TOKEN_TTL_MINUTES * 60 * 1000));

  await repo.savePasswordResetToken(db, {
    id: randomUUID() as UUID,
    tenantId: user.tenantId,
    userId: user.id,
    tokenHash,
    expiresAt,
    usedAt: null,
    createdAt: now,
  });

  await appendAdministrativeEvent(db, {
    auth:{tenantId:user.tenantId,userId:null},projectId:null,subjectUserId:user.id,
    eventType:'password.reset_requested',authorityEvidence:{kind:'ANONYMOUS_LOCAL_ACCOUNT_RESET_REQUEST'},
    changes:{expiresAt:expiresAt.toISOString()},
  });
  return { resetToken };
}

export interface ResetPasswordParams {
  token: string;
  newPassword: string;
  now?: Date;
}

export async function resetPassword(
  repo: IPasswordResetRepository,
  db: DbClient,
  params: ResetPasswordParams,
): Promise<void> {
  if (params.newPassword.length < 8) {
    throw new ValidationError('Password must be at least 8 characters');
  }

  const now = params.now ?? new Date();
  const tokenHash = hashPasswordResetToken(params.token.trim());
  // Discover only the scope before the barrier; never lock a token ahead of its tenant.
  const peek = await repo.findActivePasswordResetTokenByHash(db, tokenHash, now, false);
  if (!peek) throw new ValidationError('Reset token is invalid or expired');
  try {
    await acquireTenantLifecycleLock(db, peek.tenantId, 'EXCLUSIVE');
  } catch (err) {
    if (err instanceof NotFoundError) throw new ValidationError('Reset token is invalid or expired');
    throw err;
  }
  const user = await repo.lockPasswordResetUser(db, peek.tenantId, peek.userId);
  const resetToken = await repo.findActivePasswordResetTokenByHash(
    db, tokenHash, params.now ?? new Date(), true);
  if (!resetToken || resetToken.tenantId !== peek.tenantId || resetToken.userId !== peek.userId ||
      !user || user.deactivatedAt || user.authMethod !== 'LOCAL' || !user.passwordHash) {
    throw new ValidationError('Reset token is invalid or expired');
  }

  const passwordHash = await bcrypt.hash(params.newPassword, BCRYPT_ROUNDS);

  await repo.markPasswordResetTokenUsed(db, resetToken.id, now);
  await repo.markActivePasswordResetTokensUsedForUser(
    db,
    resetToken.tenantId,
    resetToken.userId,
    now,
  );
  await repo.updatePasswordHash(
    db,
    resetToken.tenantId,
    resetToken.userId,
    passwordHash,
  );
  await repo.bumpSessionVersion(db, resetToken.tenantId, resetToken.userId);
  await appendAdministrativeEvent(db, {
    auth:{tenantId:user.tenantId,userId:user.id},projectId:null,subjectUserId:user.id,
    eventType:'password.reset_completed',authorityEvidence:{kind:'VALID_PASSWORD_RESET_TOKEN'},
    changes:{sessionsRevoked:true},
  });
}

export function hashPasswordResetToken(token: string): string {
  return createHash('sha256')
    .update(token)
    .digest('hex');
}
