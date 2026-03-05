import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { assertActiveSession, requireAuth } from '@/lib/auth';
import { UnauthorizedError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import { NextRequest } from 'next/server';

const tenantId = 'tenant-1' as UUID;
const userId = 'user-1' as UUID;

test('assertActiveSession rejects revoked session versions', async () => {
  const db: DbClient = {
    query: async <T extends object>() => ({
      rows: [{ session_version: 2, deactivated_at: null }] as T[],
    }),
  };

  await assert.rejects(
    () => assertActiveSession(db, { tenantId, userId, sessionVersion: 1 }),
    (err: unknown) =>
      err instanceof UnauthorizedError &&
      err.code === 'AUTH_SESSION_REVOKED',
  );
});

test('assertActiveSession rejects deactivated users', async () => {
  const db: DbClient = {
    query: async <T extends object>() => ({
      rows: [{ session_version: 1, deactivated_at: new Date('2026-03-05T00:00:00Z') }] as T[],
    }),
  };

  await assert.rejects(
    () => assertActiveSession(db, { tenantId, userId, sessionVersion: 1 }),
    (err: unknown) =>
      err instanceof UnauthorizedError &&
      err.code === 'AUTH_USER_DEACTIVATED',
  );
});

test('requireAuth rejects tokens missing sessionVersion claim', async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'session-auth-test-secret';

  try {
    const legacyToken = jwt.sign({ sub: userId, tenantId }, process.env.JWT_SECRET as string, {
      expiresIn: 60,
    });
    const req = new NextRequest('http://localhost/api/companies', {
      method: 'POST',
      headers: { cookie: `swr_session=${legacyToken}` },
    });

    assert.throws(
      () => requireAuth(req),
      (err: unknown) =>
        err instanceof UnauthorizedError &&
        err.code === 'AUTH_SESSION_REVOKED',
    );
  } finally {
    if (previousSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = previousSecret;
    }
  }
});
