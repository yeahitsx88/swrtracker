import test from 'node:test';
import assert from 'node:assert/strict';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import { ConflictError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';

test('existing membership is a conflict rather than a role or access update', async () => {
  const queries: string[] = [];
  const db: DbClient = { query: async <T extends object>(sql: string) => {
    queries.push(sql);
    if (sql.includes('SELECT tenant_id') || sql.includes('SELECT u.tenant_id')) return { rows: [{tenant_id:'tenant',deactivated_at:null,company_type:'GC'}] as T[] };
    if (sql.includes('SELECT status')) return { rows: [{status:'ACTIVE'}] as T[] };
    if (sql.includes('INSERT INTO project_memberships')) {
      assert.doesNotMatch(sql, /DO UPDATE/);
      return { rows: [] };
    }
    throw new Error('Unexpected query');
  }};
  await assert.rejects(new TenancyRepository().saveMembership(db, {
    id:'membership' as UUID,tenantId:'tenant' as UUID,projectId:'project' as UUID,
    userId:'user' as UUID,role:'VIEWER',createdAt:new Date(),
  }), ConflictError);
  assert.equal(queries.filter(sql=>/INSERT INTO project_memberships/.test(sql)).length,1);
});
