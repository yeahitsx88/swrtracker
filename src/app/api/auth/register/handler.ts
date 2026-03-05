import { NextResponse, type NextRequest } from 'next/server';
import { ForbiddenError, ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { pool } from '@/lib/db';
import { withTransaction } from '@/lib/with-transaction';
import { createUser } from '@/modules/identity/application/create-user';
import type { IUserRepository } from '@/modules/identity/application/ports';
import { UserRepository } from '@/modules/identity/infrastructure/user.repository';
import type { DbClient, UUID } from '@/shared/types';

type TransactionRunner = <T>(fn: (client: DbClient) => Promise<T>) => Promise<T>;

export interface RegisterRouteDeps {
  db: DbClient;
  createRepo: () => IUserRepository;
  createUser: typeof createUser;
  withTransaction: TransactionRunner;
}

const defaultDeps: RegisterRouteDeps = {
  db: pool,
  createRepo: () => new UserRepository(),
  createUser,
  withTransaction,
};

export async function handlePostRegister(
  req: NextRequest,
  deps: RegisterRouteDeps = defaultDeps,
) {
  try {
    const body = await req.json() as unknown;

    if (
      !body ||
      typeof body !== 'object' ||
      typeof (body as Record<string, unknown>).tenantId !== 'string' ||
      typeof (body as Record<string, unknown>).companyId !== 'string' ||
      typeof (body as Record<string, unknown>).email !== 'string' ||
      typeof (body as Record<string, unknown>).password !== 'string' ||
      typeof (body as Record<string, unknown>).name !== 'string'
    ) {
      throw new ValidationError('tenantId, companyId, email, password, and name are required');
    }

    const { tenantId, companyId, email, password, name } = body as {
      tenantId: string; companyId: string; email: string; password: string; name: string;
    };

    if (password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters');
    }

    const repo = deps.createRepo();
    const domainAllowed = await repo.isDomainAllowed(deps.db, tenantId as UUID, email);
    if (!domainAllowed) {
      throw new ForbiddenError(
        'Your email domain is not authorised for self-registration. Contact your project administrator for an invite.',
      );
    }

    const user = await deps.withTransaction((client) =>
      deps.createUser(repo, client, {
        tenantId: tenantId as UUID,
        companyId: companyId as UUID,
        email,
        password,
        name,
      }),
    );

    return NextResponse.json(
      { user: { id: user.id, email: user.email, name: user.name, tenantId: user.tenantId } },
      { status: 201 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
