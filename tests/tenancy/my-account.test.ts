import test from 'node:test';
import assert from 'node:assert/strict';
import type { DbClient, UUID } from '@/shared/types';
import { getMyAccount, type MyAccountReader } from '@/modules/tenancy/application/my-account';
import { SqlMyAccountReader } from '@/modules/tenancy/infrastructure/my-account.reader';
import { accountNavigation } from '@/components/ui/account-navigation';

const auth = { tenantId: 'tenant' as UUID, userId: 'self' as UUID, sessionVersion: 2 };
const projectId = 'project' as UUID;
function database(sessionVersion = 2, member = true, deactivated = false): DbClient {
  return { async query<T extends object>(sql: string) {
    const rows = sql.includes('session_version') ? [{ session_version: sessionVersion, deactivated_at: deactivated ? new Date() : null }]
      : member ? [{ role: 'PARTY_CHIEF' }] : [];
    return { rows: rows as T[] };
  } };
}
const reader: MyAccountReader = {
  async profile(_db, tenant, user) {
    assert.equal(tenant, auth.tenantId); assert.equal(user, auth.userId);
    return { name: 'Chief', email: 'chief@example.test', company: 'Example' };
  },
  async assignment(_db, tenant, project, user) {
    assert.deepEqual([tenant, project, user], [auth.tenantId, projectId, auth.userId]);
    return { areas: ['Train 1'], crew: [{ name: 'Crew member', role: 'Instrument Man' }] };
  },
};
test('account reads only the authenticated person and their authorized project', async () => {
  const result = await getMyAccount(reader, database(), auth, projectId);
  assert.equal(result.assignment?.role, 'PARTY_CHIEF');
  assert.equal(result.assignment?.crew.length, 1);
  assert.equal((await getMyAccount(reader, database(), auth)).assignment, null);
});
test('account rejects revoked and deactivated sessions before reading profile or assignments', async () => {
  for (const db of [database(1), database(2, true, true)]) {
    await assert.rejects(() => getMyAccount(reader, db, auth, projectId), { name: 'UnauthorizedError' });
  }
});
test('account rejects a project outside membership before querying assignments', async () => {
  await assert.rejects(() => getMyAccount(reader, database(2, false), auth, projectId), { name: 'ForbiddenError' });
});
test('account SQL applies tenant, project and self scope and omits credentials', async () => {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const db: DbClient = { async query<T extends object>(sql: string, params?: unknown[]) {
    queries.push({ sql, params }); return { rows: [] as T[] };
  } };
  const repo = new SqlMyAccountReader();
  await repo.profile(db, auth.tenantId, auth.userId);
  await repo.assignment(db, auth.tenantId, projectId, auth.userId);
  assert.deepEqual(queries[0]?.params, [auth.tenantId, auth.userId]);
  for (const query of queries.slice(1)) {
    assert.deepEqual(query.params, [auth.tenantId, projectId, auth.userId]);
    assert.match(query.sql, /tenant_id = \$1/); assert.match(query.sql, /project_id = \$2/);
    assert.match(query.sql, /deactivated_at IS NULL/);
  }
  assert.ok(queries.every(query => !/password|session_version|SELECT \*/.test(query.sql)));
});
test('account navigation retains the project for Home and account destinations', () => {
  assert.equal(accountNavigation(projectId)[0]?.href, '/projects/project');
  assert.equal(accountNavigation(projectId).find(item => item.label === 'Profile')?.href, '/profile?projectId=project');
  assert.equal(accountNavigation()[0]?.href, '/projects');
});
