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
import type { UUID } from '@/shared/types';
import { getPool } from './db';

export const COOKIE_NAME = 'swr_session';
export const TOKEN_TTL_SECONDS = 8 * 60 * 60; // 8 hours — one shift

interface RawJwtPayload {
  sub: string;
  tenantId: string;
  iat: number;
  exp: number;
  sessionVersion: number;
}

export interface AuthContext {
  userId: UUID;
  tenantId: UUID;
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is required');
  return secret;
}

export function signToken(userId: UUID, tenantId: UUID, sessionVersion: number): string {
  return jwt.sign({ sub: userId, tenantId, sessionVersion }, getSecret(), {
    expiresIn: TOKEN_TTL_SECONDS,
  });
}

function verifyToken(token: string): AuthContext & { sessionVersion: number } {
  const payload = jwt.verify(token, getSecret()) as RawJwtPayload;
  if (!Number.isSafeInteger(payload.sessionVersion) || payload.sessionVersion < 0) {
    throw new UnauthorizedError();
  }
  return {
    userId: payload.sub as UUID,
    tenantId: payload.tenantId as UUID,
    sessionVersion: payload.sessionVersion,
  };
}

/**
 * Extracts and validates the JWT from the request cookie.
 * Throws UnauthorizedError if missing or invalid.
 * Call this at the top of any protected route handler.
 */
export async function requireAuth(req: NextRequest): Promise<AuthContext> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) throw new UnauthorizedError();
  let auth: AuthContext & { sessionVersion: number };
  try {
    auth = verifyToken(token);
  } catch {
    throw new UnauthorizedError();
  }
  const { rows } = await getPool().query<{ session_version: number }>(
    `SELECT session_version FROM users WHERE id=$1 AND tenant_id=$2
       AND deactivated_at IS NULL LIMIT 1`, [auth.userId, auth.tenantId]);
  if (rows[0]?.session_version !== auth.sessionVersion) throw new UnauthorizedError();
  return { userId: auth.userId, tenantId: auth.tenantId };
}
