import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { createEmailTransportFromEnv, sendPasswordResetEmail } from '@/lib/email';
import { withTransaction } from '@/lib/with-transaction';
import { requestPasswordReset } from '@/modules/identity/application/password-reset';
import type { IPasswordResetRepository } from '@/modules/identity/application/password-reset';
import { UserRepository } from '@/modules/identity/infrastructure/user.repository';
import type { UUID } from '@/shared/types';
import type { DbClient } from '@/shared/types';

type TransactionRunner = <T>(fn: (client: DbClient) => Promise<T>) => Promise<T>;

export interface ForgotPasswordRouteDeps {
  createRepo: () => IPasswordResetRepository;
  requestPasswordReset: typeof requestPasswordReset;
  withTransaction: TransactionRunner;
  includeDebugToken: () => boolean;
  sendResetEmail: typeof sendPasswordResetEmail;
  resolveAppBaseUrl: () => string;
}

const defaultDeps: ForgotPasswordRouteDeps = {
  createRepo: () => new UserRepository(),
  requestPasswordReset,
  withTransaction,
  includeDebugToken: () => process.env.NODE_ENV !== 'production',
  sendResetEmail: (transport, params) => sendPasswordResetEmail(transport, params),
  resolveAppBaseUrl: () => process.env.APP_BASE_URL?.trim() || 'http://localhost:3000',
};

export async function handlePostForgotPassword(
  req: NextRequest,
  deps: ForgotPasswordRouteDeps = defaultDeps,
) {
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
    const repo = deps.createRepo();
    const result = await deps.withTransaction((client) =>
      deps.requestPasswordReset(repo, client, {
        tenantId: tenantId.trim() as UUID,
        email: email.trim().toLowerCase(),
      }),
    );

    if (result.resetToken) {
      await deps.sendResetEmail(createEmailTransportFromEnv(), {
        tenantId: tenantId.trim() as UUID,
        recipientEmail: email.trim().toLowerCase(),
        resetToken: result.resetToken,
        appBaseUrl: deps.resolveAppBaseUrl(),
      });
    }

    return NextResponse.json({
      success: true,
      debugResetToken: deps.includeDebugToken() ? result.resetToken : undefined,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
