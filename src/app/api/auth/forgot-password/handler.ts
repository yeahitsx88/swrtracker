import { NextResponse, type NextRequest } from 'next/server';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { withTransaction } from '@/lib/with-transaction';
import { requestPasswordReset } from '@/modules/identity/application/password-reset';
import type { IPasswordResetRepository } from '@/modules/identity/application/password-reset';
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
}

const defaultDeps: ForgotPasswordRouteDeps = {
  createRepo: () => new UserRepository(),
  requestPasswordReset,
  withTransaction,
  enqueueResetEmail: enqueuePasswordResetEmail,
  resolveAppBaseUrl: () => process.env.APP_BASE_URL?.trim() || 'http://localhost:3000',
  allowAttempt: (db, tenantId, email, req) =>
    new PasswordResetRateLimitRepository().allowAttempt(db, tenantId, email, req),
};

export async function handlePostForgotPassword(
  req: NextRequest,
  deps: ForgotPasswordRouteDeps = defaultDeps,
) {
  const startedAt = Date.now();
  try {
    const body = await req.json() as unknown;
    if (
      !body ||
      typeof body !== 'object' ||
      typeof (body as Record<string, unknown>).tenantId !== 'string' ||
      typeof (body as Record<string, unknown>).email !== 'string'
    ) {
      throw new ValidationError('tenantId and email are required');
    }

    const { tenantId, email } = body as { tenantId: string; email: string };
    const normalizedTenantId = tenantId.trim() as UUID;
    requireResourceUuid(normalizedTenantId,'tenantId');
    const normalizedEmail = email.trim().toLowerCase();
    const repo = deps.createRepo();
    await deps.withTransaction(async (client) => {
      try {
        await acquireTenantLifecycleLock(client, normalizedTenantId, 'EXCLUSIVE');
      } catch (err) {
        if (err instanceof NotFoundError) return;
        throw err;
      }
      const allowed = await deps.allowAttempt(client, normalizedTenantId, normalizedEmail, req);
      if (!allowed) return;
      const result = await deps.requestPasswordReset(repo, client, {
        tenantId: normalizedTenantId,
        email: normalizedEmail,
      });
      if (result.resetToken) {
        await deps.enqueueResetEmail(client, {
          tenantId: normalizedTenantId,
          recipientEmail: normalizedEmail,
          resetToken: result.resetToken,
          appBaseUrl: deps.resolveAppBaseUrl(),
        });
      }
    });
    // Equalize ordinary DB-path latency; no external email service runs before response.
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, 250 - (Date.now() - startedAt))));
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err);
  }
}
