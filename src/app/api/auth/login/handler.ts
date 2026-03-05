import { NextResponse, type NextRequest } from 'next/server';
import { UnauthorizedError, ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { COOKIE_NAME, TOKEN_TTL_SECONDS } from '@/lib/auth';
import { pool } from '@/lib/db';
import { authenticateUser } from '@/modules/identity/application/authenticate';
import {
  createLoginRateLimiter,
  type LoginRateLimiter,
} from '@/modules/identity/application/login-rate-limit';
import type { IUserRepository } from '@/modules/identity/application/ports';
import { LoginRateLimitRepository } from '@/modules/identity/infrastructure/login-rate-limit.repository';
import { UserRepository } from '@/modules/identity/infrastructure/user.repository';
import type { DbClient, UUID } from '@/shared/types';

export interface LoginRouteDeps {
  db: DbClient;
  createRepo: () => IUserRepository;
  createRateLimiter: () => LoginRateLimiter;
  authenticateUser: typeof authenticateUser;
}

const defaultDeps: LoginRouteDeps = {
  db: pool,
  createRepo: () => new UserRepository(),
  createRateLimiter: () => createLoginRateLimiter(new LoginRateLimitRepository()),
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
    const scope = {
      tenantId: tenantId.trim() as UUID,
      email: email.trim().toLowerCase(),
    };

    const repo = deps.createRepo();
    const rateLimiter = deps.createRateLimiter();

    await rateLimiter.assertCanAttempt(deps.db, scope);

    let user: Awaited<ReturnType<typeof deps.authenticateUser>>['user'];
    let token: string;
    try {
      const authResult = await deps.authenticateUser(repo, deps.db, {
        tenantId: scope.tenantId,
        email: scope.email,
        password,
      });
      user = authResult.user;
      token = authResult.token;
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        await rateLimiter.recordFailure(deps.db, scope);
      }
      throw err;
    }

    await rateLimiter.clearFailures(deps.db, scope);

    const res = NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, tenantId: user.tenantId },
    });

    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: TOKEN_TTL_SECONDS,
    });

    return res;
  } catch (err) {
    return errorResponse(err);
  }
}
