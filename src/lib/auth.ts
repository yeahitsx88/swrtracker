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

export const COOKIE_NAME = 'swr_session';
export const TOKEN_TTL_SECONDS = 8 * 60 * 60; // 8 hours — one shift

interface RawJwtPayload {
  sub: string;
  tenantId: string;
  iat: number;
  exp: number;
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

export function signToken(userId: UUID, tenantId: UUID): string {
  return jwt.sign({ sub: userId, tenantId }, getSecret(), {
    expiresIn: TOKEN_TTL_SECONDS,
  });
}

function verifyToken(token: string): AuthContext {
  const payload = jwt.verify(token, getSecret()) as RawJwtPayload;
  return {
    userId: payload.sub as UUID,
    tenantId: payload.tenantId as UUID,
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
  } catch {
    throw new UnauthorizedError();
  }
}
