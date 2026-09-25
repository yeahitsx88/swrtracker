import test from 'node:test';
import assert from 'node:assert/strict';
import { CompanyAccessRepository } from '@/modules/identity/infrastructure/company-access.repository';
import type { DbClient, UUID } from '@/shared/types';

test('company access overview maps scoped companies, requesters, and pending invites without tokens', async () => {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const db: DbClient = {
    query: async <T extends object>(sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (sql.includes('FROM companies c')) {
        return { rows: [{ id: 'company-1', name: 'Civil Co' }] as T[] };
      }
      if (sql.includes('FROM project_memberships pm')) {
        return { rows: [{
          user_id: 'user-1', name: 'Pat Chief', email: 'pat@example.com',
          company_id: 'company-1', company_name: 'Civil Co', authority_grant_id: 'grant-1',
        }] as T[] };
      }
      return { rows: [{
        id: 'invite-1', email: 'new@example.com', company_id: 'company-1',
        company_name: 'Civil Co', expires_at: new Date('2026-10-01T12:00:00Z'),
      }] as T[] };
    },
  };

  const result = await new CompanyAccessRepository().listProjectCompanyAccess(
    db,
    'tenant-1' as UUID,
    'project-1' as UUID,
  );

  assert.deepEqual(result.companies, [{ id: 'company-1', name: 'Civil Co' }]);
  assert.equal(result.requesters[0]?.authorityGrantId, 'grant-1');
  assert.equal(result.pendingInvites[0]?.expiresAt, '2026-10-01T12:00:00.000Z');
  assert.equal('token' in (result.pendingInvites[0] ?? {}), false);
  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.deepEqual(call.params, ['tenant-1', 'project-1']);
  }
  assert.match(calls[1]!.sql, /pm\.role = 'REQUESTER'/);
  assert.match(calls[1]!.sql, /c\.type = 'SUBCONTRACTOR'/);
  assert.match(calls[2]!.sql, /i\.canceled_at IS NULL/);
});
