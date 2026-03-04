import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '@/shared/errors';
import {
  handlePostLogin,
  type LoginRouteDeps,
} from '@/app/api/auth/login/route';
import {
  handlePostRegister,
  type RegisterRouteDeps,
} from '@/app/api/auth/register/route';
import type { IUserRepository } from '@/modules/identity/application/ports';
import type { User, UserWithCredentials } from '@/modules/identity/domain/types';
import type { DbClient, UUID } from '@/shared/types';

const tenantId = 'tenant-1' as UUID;
const companyId = 'company-1' as UUID;
const userId = 'user-1' as UUID;
const db: DbClient = { query: async () => ({ rows: [] }) };

function makeRequest(url: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeUser(overrides?: Partial<User>): User {
  return {
    id: userId,
    tenantId,
    companyId,
    email: 'field.user@example.com',
    name: 'Field User',
    authMethod: 'LOCAL',
    createdAt: new Date('2026-03-04T12:00:00Z'),
    ...overrides,
  };
}

function makeRepo(overrides?: Partial<IUserRepository>): IUserRepository {
  return {
    findByEmail: async () => null,
    findById: async () => null,
    isDomainAllowed: async () => true,
    save: async (_db: DbClient, _user: UserWithCredentials) => undefined,
    ...overrides,
  };
}

function makeRegisterDeps(overrides?: Partial<RegisterRouteDeps>): RegisterRouteDeps {
  return {
    db,
    createRepo: () => makeRepo(),
    createUser: async (_repo, _db, params) =>
      makeUser({
        tenantId: params.tenantId,
        companyId: params.companyId,
        email: params.email,
        name: params.name,
      }),
    withTransaction: async (fn) => fn(db),
    ...overrides,
  };
}

function makeLoginDeps(overrides?: Partial<LoginRouteDeps>): LoginRouteDeps {
  return {
    db,
    createRepo: () => makeRepo(),
    authenticateUser: async () => ({
      user: makeUser(),
      token: 'test-jwt-token',
    }),
    ...overrides,
  };
}

test('handlePostRegister returns 201 with mapped user payload', async () => {
  const response = await handlePostRegister(
    makeRequest('http://localhost/api/auth/register', {
      tenantId,
      companyId,
      email: 'field.user@example.com',
      password: 'strong-password',
      name: 'Field User',
    }),
    makeRegisterDeps(),
  );

  assert.equal(response.status, 201);
  const json = await response.json() as { user: User };
  assert.equal(json.user.id, userId);
  assert.equal(json.user.tenantId, tenantId);
  assert.equal(json.user.email, 'field.user@example.com');
});

test('handlePostRegister returns 403 when email domain is not allowed', async () => {
  const response = await handlePostRegister(
    makeRequest('http://localhost/api/auth/register', {
      tenantId,
      companyId,
      email: 'field.user@blocked-domain.com',
      password: 'strong-password',
      name: 'Field User',
    }),
    makeRegisterDeps({
      createRepo: () =>
        makeRepo({
          isDomainAllowed: async () => false,
        }),
    }),
  );

  assert.equal(response.status, 403);
});

test('handlePostRegister returns 400 for invalid payload', async () => {
  const response = await handlePostRegister(
    makeRequest('http://localhost/api/auth/register', {
      tenantId,
      email: 'field.user@example.com',
      password: 'short',
    }),
    makeRegisterDeps(),
  );

  assert.equal(response.status, 400);
});

test('handlePostLogin returns 200 and sets session cookie', async () => {
  const response = await handlePostLogin(
    makeRequest('http://localhost/api/auth/login', {
      tenantId,
      email: 'field.user@example.com',
      password: 'strong-password',
    }),
    makeLoginDeps(),
  );

  assert.equal(response.status, 200);
  const json = await response.json() as { user: User };
  assert.equal(json.user.id, userId);
  const setCookie = response.headers.get('set-cookie') ?? '';
  assert.match(setCookie, /swr_session=/);
});

test('handlePostLogin returns 401 for unauthorized credentials', async () => {
  const response = await handlePostLogin(
    makeRequest('http://localhost/api/auth/login', {
      tenantId,
      email: 'field.user@example.com',
      password: 'wrong-password',
    }),
    makeLoginDeps({
      authenticateUser: async () => {
        throw new UnauthorizedError('Invalid email or password');
      },
    }),
  );

  assert.equal(response.status, 401);
});
