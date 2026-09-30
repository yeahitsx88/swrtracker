import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { assertActiveSession, requireAuth, requireActiveAuth, sessionTokenHash, signToken } from '@/lib/auth';
import { handlePostLogout } from '@/app/api/auth/logout/handler';
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

test('logout revokes the presented token without revoking another login', async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'session-auth-test-secret';
  try {
    const first = signToken(userId, tenantId);
    const second = signToken(userId, tenantId);
    assert.notEqual(first, second);
    const revoked = new Set<string>();
    const db: DbClient = {
      query: async <T extends object>(sql: string, params?: unknown[]) => {
        if (sql.includes('INSERT INTO revoked_auth_sessions')) {
          revoked.add(String(params?.[0]));
          return { rows: [] as T[] };
        }
        return { rows: [{ revoked: revoked.has(String(params?.[0])) }] as T[] };
      },
    };
    const request = (token: string) => new NextRequest('http://localhost/api/companies', {
      method: 'POST', headers: { cookie: `swr_session=${token}` },
    });
    const response = await handlePostLogout(request(first), db);
    assert.equal(response.status, 200);
    assert.ok(revoked.has(sessionTokenHash(first)));
    await assert.rejects(() => requireActiveAuth(request(first), db),
      (err: unknown) => err instanceof UnauthorizedError && err.code === 'AUTH_SESSION_REVOKED');
    const other = await requireActiveAuth(request(second), db);
    assert.equal(other.userId, userId);
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test('logout clears an invalid stale cookie without a database write', async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'session-auth-test-secret';
  let writes = 0;
  const db: DbClient = { query: async () => { writes += 1; return { rows: [] }; } };
  try {
    const req = new NextRequest('http://localhost/api/auth/logout', {
      method: 'POST', headers: { cookie: 'swr_session=invalid-token' },
    });
    const response = await handlePostLogout(req, db);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('set-cookie') ?? '', /swr_session=/);
    assert.equal(writes, 0);
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
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
