import test from 'node:test';
import assert from 'node:assert/strict';
import { getTenantRole } from '@/lib/get-tenant-role';
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
