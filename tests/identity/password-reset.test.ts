import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { ValidationError } from '@/shared/errors';
import {
  hashPasswordResetToken,
  requestPasswordReset,
  resetPassword,
  type IPasswordResetRepository,
  type PasswordResetToken,
} from '@/modules/identity/application/password-reset';
import type { UserWithCredentials } from '@/modules/identity/domain/types';
import type { DbClient, UUID } from '@/shared/types';

const tenantId = 'tenant-1' as UUID;
const companyId = 'company-1' as UUID;
const userId = 'user-1' as UUID;
const db: DbClient = { query: async () => ({ rows: [] }) };

function makeUser(overrides?: Partial<UserWithCredentials>): UserWithCredentials {
  return {
    id: userId,
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

function makeResetToken(overrides?: Partial<PasswordResetToken>): PasswordResetToken {
  return {
    id: randomUUID() as UUID,
    tenantId,
    userId,
    tokenHash: hashPasswordResetToken('raw-token'),
    expiresAt: new Date('2026-03-04T13:00:00Z'),
    usedAt: null,
    createdAt: new Date('2026-03-04T12:00:00Z'),
    ...overrides,
  };
}

function makeRepo(overrides?: Partial<IPasswordResetRepository>): IPasswordResetRepository {
  return {
    findByEmail: async () => null,
    savePasswordResetToken: async () => undefined,
    findActivePasswordResetTokenByHash: async () => null,
    markPasswordResetTokenUsed: async () => undefined,
    markActivePasswordResetTokensUsedForUser: async () => undefined,
    updatePasswordHash: async () => undefined,
    ...overrides,
  };
}

test('requestPasswordReset saves hashed token for LOCAL users', async () => {
  const savedTokens: PasswordResetToken[] = [];
  const revoked: Array<{ tenantId: UUID; userId: UUID }> = [];
  const repo = makeRepo({
    findByEmail: async () => makeUser(),
    savePasswordResetToken: async (_db, token) => {
      savedTokens.push(token);
    },
    markActivePasswordResetTokensUsedForUser: async (_db, tid, uid) => {
      revoked.push({ tenantId: tid, userId: uid });
    },
  });

  const result = await requestPasswordReset(repo, db, {
    tenantId,
    email: 'field.user@example.com',
    now: new Date('2026-03-04T12:00:00Z'),
    generateToken: () => 'known-reset-token',
  });

  assert.equal(result.resetToken, 'known-reset-token');
  assert.equal(savedTokens.length, 1);
  assert.equal(savedTokens[0]?.tokenHash, hashPasswordResetToken('known-reset-token'));
  assert.deepEqual(revoked, [{ tenantId, userId }]);
});

test('requestPasswordReset returns null token when user is missing or non-local', async () => {
  const savedTokens: PasswordResetToken[] = [];
  const repoMissing = makeRepo({
    savePasswordResetToken: async (_db, token) => {
      savedTokens.push(token);
    },
  });
  const missing = await requestPasswordReset(repoMissing, db, {
    tenantId,
    email: 'missing@example.com',
  });
  assert.equal(missing.resetToken, null);
  assert.equal(savedTokens.length, 0);

  const repoSso = makeRepo({
    findByEmail: async () => makeUser({ authMethod: 'SSO', passwordHash: null }),
    savePasswordResetToken: async (_db, token) => {
      savedTokens.push(token);
    },
  });
  const sso = await requestPasswordReset(repoSso, db, {
    tenantId,
    email: 'sso@example.com',
  });
  assert.equal(sso.resetToken, null);
  assert.equal(savedTokens.length, 0);
});

test('resetPassword consumes token and updates password hash', async () => {
  const used: UUID[] = [];
  const updatedHashes: string[] = [];
  const revokedForUser: Array<{ tenantId: UUID; userId: UUID }> = [];
  const repo = makeRepo({
    findActivePasswordResetTokenByHash: async () => makeResetToken(),
    markPasswordResetTokenUsed: async (_db, tokenId) => {
      used.push(tokenId);
    },
    markActivePasswordResetTokensUsedForUser: async (_db, tid, uid) => {
      revokedForUser.push({ tenantId: tid, userId: uid });
    },
    updatePasswordHash: async (_db, _tenantId, _userId, passwordHash) => {
      updatedHashes.push(passwordHash);
    },
  });

  await resetPassword(repo, db, {
    token: 'raw-token',
    newPassword: 'new-strong-password',
    now: new Date('2026-03-04T12:30:00Z'),
  });

  assert.equal(used.length, 1);
  assert.equal(revokedForUser.length, 1);
  assert.equal(updatedHashes.length, 1);
  const hashMatches = await bcrypt.compare('new-strong-password', updatedHashes[0] ?? '');
  assert.equal(hashMatches, true);
});

test('resetPassword rejects invalid tokens', async () => {
  const repo = makeRepo({
    findActivePasswordResetTokenByHash: async () => null,
  });

  await assert.rejects(
    () => resetPassword(repo, db, {
      token: 'bad-token',
      newPassword: 'new-strong-password',
    }),
    ValidationError,
  );
});

test('resetPassword rejects passwords shorter than 8 chars', async () => {
  const repo = makeRepo();
  await assert.rejects(
    () => resetPassword(repo, db, {
      token: 'raw-token',
      newPassword: 'short',
    }),
    ValidationError,
  );
});
