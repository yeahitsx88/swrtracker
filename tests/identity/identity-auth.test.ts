import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { ConflictError, UnauthorizedError } from '@/shared/errors';
import { authenticateUser } from '@/modules/identity/application/authenticate';
import { createUser } from '@/modules/identity/application/create-user';
import type { IUserRepository } from '@/modules/identity/application/ports';
import type { UserWithCredentials } from '@/modules/identity/domain/types';
import type { DbClient, UUID } from '@/shared/types';

const tenantId = 'tenant-1' as UUID;
const companyId = 'company-1' as UUID;
const db: DbClient = { query: async () => ({ rows: [] }) };

function makeUserWithCredentials(overrides?: Partial<UserWithCredentials>): UserWithCredentials {
  return {
    id: randomUUID() as UUID,
    tenantId,
    companyId,
    email: 'field.user@example.com',
    name: 'Field User',
    authMethod: 'LOCAL',
    passwordHash: '$2b$12$111111111111111111111uA6M4tM6qjUpBAkLTUEX2UjsFvdcGa.W',
    createdAt: new Date('2026-03-04T12:00:00Z'),
    ...overrides,
  };
}

function makeRepo(overrides?: Partial<IUserRepository>): IUserRepository {
  return {
    findByEmail: async () => null,
    findById: async () => null,
    isDomainAllowed: async () => true,
    save: async () => undefined,
    ...overrides,
  };
}

test('createUser hashes password and persists LOCAL user credentials', async () => {
  const saved: UserWithCredentials[] = [];
  const repo = makeRepo({
    save: async (_db, user) => {
      saved.push(user);
    },
  });

  const user = await createUser(repo, db, {
    tenantId,
    companyId,
    email: 'field.user@example.com',
    name: 'Field User',
    password: 'strong-password',
  });

  assert.equal(saved.length, 1);
  assert.equal(saved[0]?.authMethod, 'LOCAL');
  assert.equal(saved[0]?.passwordHash === 'strong-password', false);
  assert.equal(saved[0]?.email, 'field.user@example.com');
  assert.equal(user.email, 'field.user@example.com');
  assert.equal('passwordHash' in user, false);
});

test('createUser rejects duplicate email within the same tenant', async () => {
  const repo = makeRepo({
    findByEmail: async () => makeUserWithCredentials(),
  });

  await assert.rejects(
    () => createUser(repo, db, {
      tenantId,
      companyId,
      email: 'field.user@example.com',
      name: 'Field User',
      password: 'strong-password',
    }),
    ConflictError,
  );
});

test('authenticateUser returns token and user for valid LOCAL credentials', async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'identity-test-secret';

  try {
    const passwordHash = await bcrypt.hash('strong-password', 12);
    const repo = makeRepo({
      findByEmail: async () =>
        makeUserWithCredentials({
          email: 'field.user@example.com',
          passwordHash,
        }),
    });

    const result = await authenticateUser(repo, db, {
      tenantId,
      email: 'field.user@example.com',
      password: 'strong-password',
    });

    assert.equal(result.user.email, 'field.user@example.com');
    assert.equal(typeof result.token, 'string');
    assert.equal(result.token.length > 0, true);
  } finally {
    if (previousSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = previousSecret;
    }
  }
});

test('authenticateUser rejects invalid credentials', async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'identity-test-secret';

  try {
    const passwordHash = await bcrypt.hash('strong-password', 12);
    const repo = makeRepo({
      findByEmail: async () =>
        makeUserWithCredentials({
          email: 'field.user@example.com',
          passwordHash,
        }),
    });

    await assert.rejects(
      () => authenticateUser(repo, db, {
        tenantId,
        email: 'field.user@example.com',
        password: 'wrong-password',
      }),
      UnauthorizedError,
    );
  } finally {
    if (previousSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = previousSecret;
    }
  }
});

test('authenticateUser rejects SSO users for password login', async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'identity-test-secret';

  try {
    const repo = makeRepo({
      findByEmail: async () =>
        makeUserWithCredentials({
          authMethod: 'SSO',
          passwordHash: null,
        }),
    });

    await assert.rejects(
      () => authenticateUser(repo, db, {
        tenantId,
        email: 'field.user@example.com',
        password: 'strong-password',
      }),
      UnauthorizedError,
    );
  } finally {
    if (previousSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = previousSecret;
    }
  }
});
