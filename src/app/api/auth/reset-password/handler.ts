import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { withTransaction } from '@/lib/with-transaction';
import { resetPassword } from '@/modules/identity/application/password-reset';
import type { IPasswordResetRepository } from '@/modules/identity/application/password-reset';
import { UserRepository } from '@/modules/identity/infrastructure/user.repository';
import type { DbClient } from '@/shared/types';

type TransactionRunner = <T>(fn: (client: DbClient) => Promise<T>) => Promise<T>;

export interface ResetPasswordRouteDeps {
  createRepo: () => IPasswordResetRepository;
  resetPassword: typeof resetPassword;
  withTransaction: TransactionRunner;
}

const defaultDeps: ResetPasswordRouteDeps = {
  createRepo: () => new UserRepository(),
  resetPassword,
  withTransaction,
};

export async function handlePostResetPassword(
  req: NextRequest,
  deps: ResetPasswordRouteDeps = defaultDeps,
) {
  try {
    const body = await req.json() as unknown;
    if (
      !body ||
      typeof body !== 'object' ||
      typeof (body as Record<string, unknown>).token !== 'string' ||
      typeof (body as Record<string, unknown>).newPassword !== 'string'
    ) {
      throw new ValidationError('token and newPassword are required');
    }

    const { token, newPassword } = body as { token: string; newPassword: string };
    const repo = deps.createRepo();
    await deps.withTransaction((client) =>
      deps.resetPassword(repo, client, {
        token,
        newPassword,
      }),
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err);
  }
}
