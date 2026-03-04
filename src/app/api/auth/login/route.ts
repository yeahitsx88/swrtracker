import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { COOKIE_NAME, TOKEN_TTL_SECONDS } from '@/lib/auth';
import { pool } from '@/lib/db';
import { authenticateUser } from '@/modules/identity/application/authenticate';
import type { IUserRepository } from '@/modules/identity/application/ports';
import { UserRepository } from '@/modules/identity/infrastructure/user.repository';
import type { DbClient, UUID } from '@/shared/types';

export const dynamic = 'force-dynamic';

export interface LoginRouteDeps {
  db: DbClient;
  createRepo: () => IUserRepository;
  authenticateUser: typeof authenticateUser;
}

const defaultDeps: LoginRouteDeps = {
  db: pool,
  createRepo: () => new UserRepository(),
  authenticateUser,
};

export async function handlePostLogin(
  req: NextRequest,
  deps: LoginRouteDeps = defaultDeps,
) {
  try {
    const body = await req.json() as unknown;

    if (
      !body ||
      typeof body !== 'object' ||
      typeof (body as Record<string, unknown>).tenantId !== 'string' ||
      typeof (body as Record<string, unknown>).email !== 'string' ||
      typeof (body as Record<string, unknown>).password !== 'string'
    ) {
      throw new ValidationError('tenantId, email, and password are required');
    }

    const { tenantId, email, password } = body as { tenantId: string; email: string; password: string };

    const repo = deps.createRepo();
    const { user, token } = await deps.authenticateUser(repo, deps.db, {
      tenantId: tenantId as UUID,
      email,
      password,
    });

    const res = NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, tenantId: user.tenantId },
    });

    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path:     '/',
      maxAge:   TOKEN_TTL_SECONDS,
    });

    return res;
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  return handlePostLogin(req);
}
