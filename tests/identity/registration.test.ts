import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { IUserRepository } from '@/modules/identity/application/ports';
import { createUser } from '@/modules/identity/application/create-user';
import { POST } from '@/app/api/auth/register/route';
import { UserRepository } from '@/modules/identity/infrastructure/user.repository';

const tenantId = '00000000-0000-0000-0000-000000000001' as UUID;
const companyId = '00000000-0000-0000-0000-000000000002' as UUID;
const db: DbClient = { async query() { return { rows: [] }; } };

test('registration use case rejects a company outside tenant before hashing or saving', async () => {
  let saved = false;
  const repo = {
    isCompanyInTenant: async () => false,
    findByEmail: async () => null,
    save: async () => { saved = true; },
  } as unknown as IUserRepository;
  await assert.rejects(createUser(repo, db, {
    tenantId, companyId, email: 'user@example.com', name: 'User', password: 'secret-passphrase',
  }), ValidationError);
  assert.equal(saved, false);
});

test('registration rejects oversized and malformed inputs before database access', async () => {
  const base = {
    tenantId, projectId: tenantId, companyId, name: 'User', email: 'user@example.com', password: 'secret-passphrase',
  };
  for (const body of [
    { ...base, email: 'bad@@example.com' },
    { ...base, password: 'x'.repeat(73) },
    { ...base, name: 'N'.repeat(201) },
    { ...base, extra: 'X'.repeat(9000) },
    { ...base, projectId: undefined },
    { ...base, companyId: 1 },
  ]) {
    const request = new NextRequest('http://localhost/api/auth/register', {
      method: 'POST', body: JSON.stringify(body),
    });
    const response = await POST(request);
    assert.equal(response.status, 400);
  }
});

test('domain authorization is tied to the selected company', async () => {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const captureDb: DbClient = {
    async query<T extends object>(sql: string, params?: unknown[]) {
      queries.push({ sql, params });
      return { rows: [{ exists: false } as unknown as T] };
    },
  };
  const allowed = await new UserRepository().isDomainAllowed(
    captureDb, tenantId, companyId, 'user@example.com',
  );
  assert.equal(allowed, false);
  assert.match(queries[0]?.sql ?? '', /company_id = \$2/);
  assert.deepEqual(queries[0]?.params, [tenantId, companyId, 'example.com']);
});
