import { NextResponse, type NextRequest } from 'next/server';
import { UnauthorizedError, ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { readJsonBody } from '@/lib/read-json-body';
import { requireResourceUuid } from '@/lib/resource-uuid';
import { COOKIE_NAME, TOKEN_TTL_SECONDS } from '@/lib/auth';
import { pool } from '@/lib/db';
import { authenticateUser, signInByEmail } from '@/modules/identity/application/authenticate';
import {
  createLoginRateLimiter,
  type LoginRateLimiter,
} from '@/modules/identity/application/login-rate-limit';
import type { IEmailAccountLookup, IUserRepository } from '@/modules/identity/application/ports';
import type { User } from '@/modules/identity/domain/types';
import { LoginRateLimitRepository } from '@/modules/identity/infrastructure/login-rate-limit.repository';
import { UserRepository } from '@/modules/identity/infrastructure/user.repository';
import type { DbClient, UUID } from '@/shared/types';

export interface LoginRouteDeps {
  db: DbClient;
  createRepo: () => IUserRepository;
  createEmailLookup: () => IEmailAccountLookup;
  createRateLimiter: () => LoginRateLimiter;
  authenticateUser: typeof authenticateUser;
  signInByEmail: typeof signInByEmail;
}

const defaultDeps: LoginRouteDeps = {
  db: pool,
  createRepo: () => new UserRepository(),
  createEmailLookup: () => new UserRepository(),
  createRateLimiter: () => createLoginRateLimiter(new LoginRateLimitRepository()),
  authenticateUser,
  signInByEmail,
};

function signedInResponse(user: User, token: string) {
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
}

/**
 * Sign In. Email and password are required. tenantId is optional (Decision 58):
 * without it the organization is resolved after the password check, and an
 * email whose password matches in several organizations gets a choice of those
 * organizations (no session) to resubmit with the chosen tenantId.
 */
export async function handlePostLogin(
  req: NextRequest,
  deps: LoginRouteDeps = defaultDeps,
) {
  try {
    const body = await readJsonBody(req);
    const fields = body && typeof body === 'object' ? body as Record<string, unknown> : null;

    if (
      !fields ||
      typeof fields.email !== 'string' ||
      typeof fields.password !== 'string' ||
      (fields.tenantId !== undefined && fields.tenantId !== null && typeof fields.tenantId !== 'string')
    ) {
      throw new ValidationError('email and password are required');
    }

    const tenantId = typeof fields.tenantId === 'string' ? fields.tenantId.trim() : '';
    const email = fields.email.trim().toLowerCase();
    const password = fields.password;
    if (tenantId) requireResourceUuid(tenantId, 'tenantId');
    if (!email || !password) throw new ValidationError('email and password are required');

    const rateLimiter = deps.createRateLimiter();

    if (!tenantId) {
      const result = await deps.signInByEmail(deps.createEmailLookup(), rateLimiter, deps.db, { email, password });
      if (result.kind === 'choose-organization') {
        return NextResponse.json({ organizations: result.organizations });
      }
      return signedInResponse(result.user, result.token);
    }

    const scope = { tenantId: tenantId as UUID, email };
    const repo = deps.createRepo();

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

    return signedInResponse(user, token);
  } catch (err) {
    return errorResponse(err);
  }
}
