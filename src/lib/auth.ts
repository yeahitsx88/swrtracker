/**
 * JWT utilities for the Identity module.
 *
 * Auth decision (CLAUDE.md §10): JWT stored in httpOnly cookie.
 * Short-lived token (8 hours). No refresh token in v1.
 *
 * Cookie name: swr_session
 * Token lifetime: TOKEN_TTL_SECONDS
 */
import jwt from 'jsonwebtoken';
import type { NextRequest } from 'next/server';
import { UnauthorizedError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';

export const COOKIE_NAME = 'swr_session';
export const TOKEN_TTL_SECONDS = 8 * 60 * 60; // 8 hours — one shift

interface RawJwtPayload {
  sub: string;
  tenantId: string;
  sv?: number;
  iat: number;
  exp: number;
}

export interface AuthContext {
  userId: UUID;
  tenantId: UUID;
  sessionVersion: number;
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is required');
  return secret;
}

export function signToken(userId: UUID, tenantId: UUID, sessionVersion = 1): string {
  return jwt.sign({ sub: userId, tenantId, sv: sessionVersion }, getSecret(), {
    expiresIn: TOKEN_TTL_SECONDS,
  });
}

function verifyToken(token: string): AuthContext {
  const payload = jwt.verify(token, getSecret()) as RawJwtPayload;
  if (typeof payload.sv !== 'number' || !Number.isFinite(payload.sv)) {
    throw new UnauthorizedError('Session is no longer valid', 'AUTH_SESSION_REVOKED');
  }
  return {
    userId: payload.sub as UUID,
    tenantId: payload.tenantId as UUID,
    sessionVersion: payload.sv,
  };
}

/**
 * Extracts and validates the JWT from the request cookie.
 * Throws UnauthorizedError if missing or invalid.
 * Call this at the top of any protected route handler.
 */
export function requireAuth(req: NextRequest): AuthContext {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) throw new UnauthorizedError();
  try {
    return verifyToken(token);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      throw err;
    }
    throw new UnauthorizedError();
  }
}

/**
 * Rejects stale/revoked sessions and deactivated users.
 * Routes should call this for any protected operation where immediate revocation matters.
 */
export async function assertActiveSession(db: DbClient, auth: AuthContext): Promise<void> {
  const { rows } = await db.query<{
    session_version: number;
    deactivated_at: Date | null;
  }>(
    `SELECT COALESCE(session_version, 1) AS session_version, deactivated_at
     FROM users
     WHERE tenant_id = $1
       AND id = $2
     LIMIT 1`,
    [auth.tenantId, auth.userId],
  );

  const state = rows[0];
  if (!state) {
    throw new UnauthorizedError('Session is no longer valid', 'AUTH_SESSION_REVOKED');
  }
  if (state.deactivated_at) {
    throw new UnauthorizedError('Account is deactivated', 'AUTH_USER_DEACTIVATED');
  }
  if (state.session_version !== auth.sessionVersion) {
    throw new UnauthorizedError('Session is no longer valid', 'AUTH_SESSION_REVOKED');
  }
}
