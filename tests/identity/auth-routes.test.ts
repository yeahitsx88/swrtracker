import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { RateLimitError, UnauthorizedError } from '@/shared/errors';
import {
  handlePostLogin,
  type LoginRouteDeps,
} from '@/app/api/auth/login/handler';
import {
  handlePostRegister,
  type RegisterRouteDeps,
} from '@/app/api/auth/register/handler';
import type { IUserRepository } from '@/modules/identity/application/ports';
import type { LoginRateLimiter } from '@/modules/identity/application/login-rate-limit';
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
    isCompanyInTenant: async () => true,
    listRegisterableProjectIds: async () => ['project-1' as UUID],
    saveProjectMembership: async () => undefined,
    findActiveInviteByToken: async () => null,
    markInviteAccepted: async () => undefined,
    bumpSessionVersion: async () => undefined,
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
  const rateLimiter: LoginRateLimiter = {
    assertCanAttempt: async () => undefined,
    recordFailure: async () => undefined,
    clearFailures: async () => undefined,
  };

  return {
    db,
    createRepo: () => makeRepo(),
    createRateLimiter: () => rateLimiter,
    authenticateUser: async () => ({
      user: makeUser(),
      token: 'test-jwt-token',
    }),
    ...overrides,
  };
}

test('handlePostRegister returns 201 with mapped user payload', async () => {
  const memberships: Array<{ projectId: UUID; userId: UUID; role: string }> = [];
  const response = await handlePostRegister(
    makeRequest('http://localhost/api/auth/register', {
      tenantId,
      companyId,
      email: 'field.user@example.com',
      password: 'strong-password',
      name: 'Field User',
    }),
    makeRegisterDeps({
      createRepo: () =>
        makeRepo({
          listRegisterableProjectIds: async () => ['project-1' as UUID, 'project-2' as UUID],
          saveProjectMembership: async (_db, membership) => {
            memberships.push(membership);
          },
        }),
    }),
  );

  assert.equal(response.status, 201);
  const json = await response.json() as { user: User };
  assert.equal(json.user.id, userId);
  assert.equal(json.user.tenantId, tenantId);
  assert.equal(json.user.email, 'field.user@example.com');
  assert.deepEqual(
    memberships.map(({ projectId, userId: memberUserId, role }) => ({ projectId, userId: memberUserId, role })),
    [
      { projectId: 'project-1' as UUID, userId, role: 'REQUESTER' },
      { projectId: 'project-2' as UUID, userId, role: 'REQUESTER' },
    ],
  );
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

test('handlePostRegister rejects company ids outside the tenant', async () => {
  const response = await handlePostRegister(
    makeRequest('http://localhost/api/auth/register', {
      tenantId,
      companyId,
      email: 'field.user@example.com',
      password: 'strong-password',
      name: 'Field User',
    }),
    makeRegisterDeps({
      createRepo: () =>
        makeRepo({
          isCompanyInTenant: async () => false,
        }),
    }),
  );

  assert.equal(response.status, 400);
  const json = await response.json() as { error: { message: string } };
  assert.equal(json.error.message, 'companyId must reference a company in this tenant');
});

test('handlePostRegister honors active invite tokens and marks them accepted', async () => {
  const memberships: Array<{ projectId: UUID; role: string }> = [];
  let acceptedToken: string | null = null;

  const response = await handlePostRegister(
    makeRequest('http://localhost/api/auth/register', {
      tenantId,
      companyId,
      email: 'Invited.User@Example.com',
      password: 'strong-password',
      name: 'Invited User',
      inviteToken: 'invite-token-1',
    }),
    makeRegisterDeps({
      createRepo: () =>
        makeRepo({
          isDomainAllowed: async () => false,
          findActiveInviteByToken: async () => ({
            tenantId,
            projectId: 'project-7' as UUID,
            email: 'invited.user@example.com',
            role: 'SURVEY_MANAGER',
          }),
          saveProjectMembership: async (_db, membership) => {
            memberships.push({ projectId: membership.projectId, role: membership.role });
          },
          markInviteAccepted: async (_db, token) => {
            acceptedToken = token;
          },
        }),
      createUser: async (_repo, _db, params) =>
        makeUser({
          tenantId: params.tenantId,
          companyId: params.companyId,
          email: params.email,
          name: params.name,
        }),
    }),
  );

  assert.equal(response.status, 201);
  const json = await response.json() as { user: User };
  assert.equal(json.user.email, 'invited.user@example.com');
  assert.deepEqual(memberships, [{ projectId: 'project-7' as UUID, role: 'SURVEY_MANAGER' }]);
  assert.equal(acceptedToken, 'invite-token-1');
});

test('handlePostRegister normalizes email before creating the user', async () => {
  let capturedEmail = '';

  const response = await handlePostRegister(
    makeRequest('http://localhost/api/auth/register', {
      tenantId,
      companyId,
      email: ' Mixed.Case@Example.com ',
      password: 'strong-password',
      name: 'Field User',
    }),
    makeRegisterDeps({
      createUser: async (_repo, _db, params) => {
        capturedEmail = params.email;
        return makeUser({
          email: params.email,
          name: params.name,
        });
      },
    }),
  );

  assert.equal(response.status, 201);
  assert.equal(capturedEmail, 'mixed.case@example.com');
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
  let cleared = false;
  const response = await handlePostLogin(
    makeRequest('http://localhost/api/auth/login', {
      tenantId,
      email: 'field.user@example.com',
      password: 'strong-password',
    }),
    makeLoginDeps({
      createRateLimiter: () => ({
        assertCanAttempt: async () => undefined,
        recordFailure: async () => undefined,
        clearFailures: async () => {
          cleared = true;
        },
      }),
    }),
  );

  assert.equal(response.status, 200);
  const json = await response.json() as { user: User };
  assert.equal(json.user.id, userId);
  assert.equal(cleared, true);
  const setCookie = response.headers.get('set-cookie') ?? '';
  assert.match(setCookie, /swr_session=/);
});

test('handlePostLogin returns 401 for unauthorized credentials', async () => {
  let recorded = false;
  const response = await handlePostLogin(
    makeRequest('http://localhost/api/auth/login', {
      tenantId,
      email: ' Field.User@Example.com ',
      password: 'wrong-password',
    }),
    makeLoginDeps({
      createRateLimiter: () => ({
        assertCanAttempt: async () => undefined,
        recordFailure: async (_db, scope) => {
          recorded = true;
          assert.equal(scope.tenantId, tenantId);
          assert.equal(scope.email, 'field.user@example.com');
        },
        clearFailures: async () => undefined,
      }),
      authenticateUser: async () => {
        throw new UnauthorizedError('Invalid email or password');
      },
    }),
  );

  assert.equal(response.status, 401);
  assert.equal(recorded, true);
});

test('handlePostLogin returns 429 when login attempts are rate limited', async () => {
  const response = await handlePostLogin(
    makeRequest('http://localhost/api/auth/login', {
      tenantId,
      email: 'field.user@example.com',
      password: 'strong-password',
    }),
    makeLoginDeps({
      createRateLimiter: () => ({
        assertCanAttempt: async () => {
          throw new RateLimitError('Too many login attempts. Try again later.', 'AUTH_RATE_LIMITED');
        },
        recordFailure: async () => undefined,
        clearFailures: async () => undefined,
      }),
    }),
  );

  assert.equal(response.status, 429);
  const json = await response.json() as { error: { code: string } };
  assert.equal(json.error.code, 'AUTH_RATE_LIMITED');
});
