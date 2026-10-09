import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_NAME, TOKEN_TTL_SECONDS, requireActiveAuth, signToken } from '@/lib/auth';
import { pool } from '@/lib/db';
import { errorResponse } from '@/lib/api-error';
import { withTransaction } from '@/lib/with-transaction';
import { ValidationError } from '@/shared/errors';
import { changeOwnPassword, verifyCurrentPassword } from '@/modules/identity/application/account-self-service';
import { createLoginRateLimiter } from '@/modules/identity/application/login-rate-limit';
import { LoginRateLimitRepository } from '@/modules/identity/infrastructure/login-rate-limit.repository';

export const dynamic = 'force-dynamic';

/**
 * POST /api/account/password — change your own password while signed in.
 * Other sessions end; this browser receives a fresh session cookie.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireActiveAuth(req);
    const body = await req.json().catch(() => null) as { currentPassword?: unknown; newPassword?: unknown } | null;
    if (!body || typeof body !== 'object') throw new ValidationError('Enter your current and new password.');
    const verified = await verifyCurrentPassword(pool, auth, body.currentPassword, createLoginRateLimiter(new LoginRateLimitRepository()));
    const { sessionVersion } = await withTransaction(db => changeOwnPassword(db, auth, verified, body.newPassword));
    const res = NextResponse.json({ changed: true }, { headers: { 'Cache-Control': 'private, no-store' } });
    res.cookies.set(COOKIE_NAME, signToken(auth.userId, auth.tenantId, sessionVersion), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: TOKEN_TTL_SECONDS,
    });
    return res;
  } catch (error) { return errorResponse(error); }
}
