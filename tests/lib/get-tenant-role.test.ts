import test from 'node:test';
import assert from 'node:assert/strict';
import { getTenantRole } from '@/lib/get-tenant-role';
import { UnauthorizedError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';

const tenantId = 'tenant-1' as UUID;
const userId = 'user-1' as UUID;

test('getTenantRole returns the tenant role when a membership exists', async () => {
  const db: DbClient = {
    query: async <T extends object>() => ({
      rows: [{ role: 'TENANT_ADMIN' }] as T[],
    }),
  };

  const role = await getTenantRole(db, tenantId, userId);
  assert.equal(role, 'TENANT_ADMIN');
});

test('getTenantRole returns null when no membership exists', async () => {
  const db: DbClient = {
    query: async <T extends object>() => ({
      rows: [] as T[],
    }),
  };

  const role = await getTenantRole(db, tenantId, userId);
  assert.equal(role, null);
});

test('getTenantRole rejects stale session versions when sessionVersion is provided', async () => {
  const db: DbClient = {
    query: async <T extends object>(sql: string) => {
      if (sql.includes('FROM users')) {
        return {
          rows: [{ session_version: 2, deactivated_at: null }] as T[],
        };
      }
      return {
        rows: [{ role: 'TENANT_ADMIN' }] as T[],
      };
    },
  };

  await assert.rejects(
    () => getTenantRole(db, tenantId, userId, 1),
    (err: unknown) =>
      err instanceof UnauthorizedError &&
      err.code === 'AUTH_SESSION_REVOKED',
  );
});

test('getTenantRole rejects deactivated users when sessionVersion is provided', async () => {
  const db: DbClient = {
    query: async <T extends object>(sql: string) => {
      if (sql.includes('FROM users')) {
        return {
          rows: [{ session_version: 1, deactivated_at: new Date('2026-03-05T00:00:00Z') }] as T[],
        };
      }
      return {
        rows: [{ role: 'TENANT_ADMIN' }] as T[],
      };
    },
  };

  await assert.rejects(
    () => getTenantRole(db, tenantId, userId, 1),
    (err: unknown) =>
      err instanceof UnauthorizedError &&
      err.code === 'AUTH_USER_DEACTIVATED',
  );
});
