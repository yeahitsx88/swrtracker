import { NextResponse, type NextRequest } from 'next/server';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { pool } from '@/lib/db';
import { withTransaction } from '@/lib/with-transaction';
import { requestPasswordReset } from '@/modules/identity/application/password-reset';
import type { IPasswordResetRepository } from '@/modules/identity/application/password-reset';
import { MAX_EMAIL_SIGN_IN_ACCOUNTS } from '@/modules/identity/application/authenticate';
import { UserRepository } from '@/modules/identity/infrastructure/user.repository';
import { PasswordResetRateLimitRepository } from '@/modules/identity/infrastructure/password-reset-rate-limit.repository';
import { enqueuePasswordResetEmail } from '@/modules/identity/infrastructure/password-reset-email-outbox';
import { requireResourceUuid } from '@/lib/resource-uuid';
import { acquireTenantLifecycleLock } from '@/lib/tenant-lifecycle-lock';
import type { UUID } from '@/shared/types';
import type { DbClient } from '@/shared/types';

type TransactionRunner = <T>(fn: (client: DbClient) => Promise<T>) => Promise<T>;

export interface ForgotPasswordRouteDeps {
  createRepo: () => IPasswordResetRepository;
  requestPasswordReset: typeof requestPasswordReset;
  withTransaction: TransactionRunner;
  enqueueResetEmail: typeof enqueuePasswordResetEmail;
  resolveAppBaseUrl: () => string;
  allowAttempt: (db: DbClient, tenantId: UUID, email: string, req: NextRequest) => Promise<boolean>;
  /** Decision 58: tenants holding a LOCAL account with this email (nonlocking pre-authentication read). */
  findAccountTenants: (email: string) => Promise<UUID[]>;
}

const defaultDeps: ForgotPasswordRouteDeps = {
  createRepo: () => new UserRepository(),
  requestPasswordReset,
  withTransaction,
  enqueueResetEmail: enqueuePasswordResetEmail,
  resolveAppBaseUrl: () => process.env.APP_BASE_URL?.trim() || 'http://localhost:3000',
  allowAttempt: (db, tenantId, email, req) =>
    new PasswordResetRateLimitRepository().allowAttempt(db, tenantId, email, req),
  findAccountTenants: async (email) => {
    const accounts = await new UserRepository().findLocalAccountsByEmail(pool, email, MAX_EMAIL_SIGN_IN_ACCOUNTS);
    return [...new Set(accounts.map((account) => account.tenantId))];
  },
};

/**
 * Forgot Password. Email is required; tenantId is optional (Decision 58).
 * Without it, a reset is requested for each tenant holding a LOCAL account
 * with this email, each through the unchanged tenant-locked, throttled path.
 * The reply is the same whether or not any account exists.
 */
export async function handlePostForgotPassword(
  req: NextRequest,
  deps: ForgotPasswordRouteDeps = defaultDeps,
) {
  const startedAt = Date.now();
  try {
    const body = await req.json() as unknown;
    const fields = body && typeof body === 'object' ? body as Record<string, unknown> : null;
    if (
      !fields ||
      typeof fields.email !== 'string' ||
      (fields.tenantId !== undefined && fields.tenantId !== null && typeof fields.tenantId !== 'string')
    ) {
      throw new ValidationError('email is required');
    }

    const tenantId = typeof fields.tenantId === 'string' ? fields.tenantId.trim() : '';
    if (tenantId) requireResourceUuid(tenantId, 'tenantId');
    const normalizedEmail = fields.email.trim().toLowerCase();
    if (!normalizedEmail) throw new ValidationError('email is required');

    const tenantIds = tenantId ? [tenantId as UUID] : await deps.findAccountTenants(normalizedEmail);
    const repo = deps.createRepo();
    for (const accountTenantId of tenantIds) {
      await deps.withTransaction(async (client) => {
        try {
          await acquireTenantLifecycleLock(client, accountTenantId, 'EXCLUSIVE');
        } catch (err) {
          if (err instanceof NotFoundError) return;
          throw err;
        }
        const allowed = await deps.allowAttempt(client, accountTenantId, normalizedEmail, req);
        if (!allowed) return;
        const result = await deps.requestPasswordReset(repo, client, {
          tenantId: accountTenantId,
          email: normalizedEmail,
        });
        if (result.resetToken) {
          await deps.enqueueResetEmail(client, {
            tenantId: accountTenantId,
            recipientEmail: normalizedEmail,
            resetToken: result.resetToken,
            appBaseUrl: deps.resolveAppBaseUrl(),
          });
        }
      });
    }
    // Equalize ordinary DB-path latency; no external email service runs before response.
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, 250 - (Date.now() - startedAt))));
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err);
  }
}
