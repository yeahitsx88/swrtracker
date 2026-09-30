import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_NAME, requireAuth, sessionTokenHash } from '@/lib/auth';
import { pool } from '@/lib/db';
import { errorResponse } from '@/lib/api-error';
import { UnauthorizedError } from '@/shared/errors';
import type { DbClient } from '@/shared/types';

export async function handlePostLogout(req: NextRequest, db: DbClient = pool) {
  try {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    if (token) {
      try {
        const auth = requireAuth(req);
        await db.query(
          `INSERT INTO revoked_auth_sessions (token_hash, tenant_id, user_id, expires_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (token_hash) DO NOTHING`,
          [sessionTokenHash(token), auth.tenantId, auth.userId, auth.expiresAt],
        );
      } catch (err) {
        // There is no valid bearer to revoke, but still clear a stale cookie.
        if (!(err instanceof UnauthorizedError)) throw err;
      }
    }
    const res = NextResponse.json({ success: true });
    res.cookies.set(COOKIE_NAME, '', {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict', path: '/', maxAge: 0,
    });
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}
