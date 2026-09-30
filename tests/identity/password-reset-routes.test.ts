import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import {
  handlePostForgotPassword,
  type ForgotPasswordRouteDeps,
} from '@/app/api/auth/forgot-password/handler';
import {
  handlePostResetPassword,
  type ResetPasswordRouteDeps,
} from '@/app/api/auth/reset-password/handler';
import type { IPasswordResetRepository } from '@/modules/identity/application/password-reset';
import type { DbClient } from '@/shared/types';

const db: DbClient = { query: async () => ({ rows: [] }) };

function makeRequest(url: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeRepo(): IPasswordResetRepository {
  return {
    findByEmail: async () => null,
    lockPasswordResetUser: async () => undefined,
    findRecentActivePasswordResetToken: async () => null,
    savePasswordResetToken: async () => undefined,
    findActivePasswordResetTokenByHash: async () => null,
    markPasswordResetTokenUsed: async () => undefined,
    markActivePasswordResetTokensUsedForUser: async () => undefined,
    updatePasswordHash: async () => undefined,
    bumpSessionVersion: async () => undefined,
  };
}

function makeForgotDeps(overrides?: Partial<ForgotPasswordRouteDeps>): ForgotPasswordRouteDeps {
  return {
    createRepo: () => makeRepo(),
    requestPasswordReset: async () => ({ resetToken: 'debug-token' }),
    withTransaction: async (fn) => fn(db),
    enqueueResetEmail: async () => undefined,
    resolveAppBaseUrl: () => 'http://localhost:3000',
    allowAttempt: async () => true,
    ...overrides,
  };
}

function makeResetDeps(overrides?: Partial<ResetPasswordRouteDeps>): ResetPasswordRouteDeps {
  return {
    createRepo: () => makeRepo(),
    resetPassword: async () => undefined,
    withTransaction: async (fn) => fn(db),
    ...overrides,
  };
}

test('handlePostForgotPassword never returns a reset bearer token', async () => {
  const response = await handlePostForgotPassword(
    makeRequest('http://localhost/api/auth/forgot-password', {
      tenantId: 'tenant-1',
      email: 'field.user@example.com',
    }),
    makeForgotDeps(),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
});

test('handlePostForgotPassword returns the same response without a generated token', async () => {
  const response = await handlePostForgotPassword(
    makeRequest('http://localhost/api/auth/forgot-password', {
      tenantId: 'tenant-1',
      email: 'field.user@example.com',
    }),
    makeForgotDeps({
      requestPasswordReset: async () => ({ resetToken: null }),
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
});

test('handlePostForgotPassword returns 400 for invalid payload', async () => {
  const response = await handlePostForgotPassword(
    makeRequest('http://localhost/api/auth/forgot-password', {
      email: 'field.user@example.com',
    }),
    makeForgotDeps(),
  );

  assert.equal(response.status, 400);
});

test('handlePostForgotPassword enqueues reset email only when token is generated', async () => {
  let queuedCount = 0;
  const response = await handlePostForgotPassword(
    makeRequest('http://localhost/api/auth/forgot-password', {
      tenantId: 'tenant-1',
      email: 'field.user@example.com',
    }),
    makeForgotDeps({
      requestPasswordReset: async () => ({ resetToken: 'email-token' }),
      enqueueResetEmail: async () => {
        queuedCount += 1;
      },
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(queuedCount, 1);
});

test('handlePostForgotPassword silently throttles attempts before account lookup', async () => {
  let lookupCount = 0;
  let queuedCount = 0;
  const response = await handlePostForgotPassword(
    makeRequest('http://localhost/api/auth/forgot-password', {
      tenantId: 'tenant-1', email: 'field.user@example.com',
    }),
    makeForgotDeps({
      allowAttempt: async () => false,
      requestPasswordReset: async () => { lookupCount += 1; return { resetToken: 'nope' }; },
      enqueueResetEmail: async () => { queuedCount += 1; },
    }),
  );
  assert.deepEqual(await response.json(), { success: true });
  assert.equal(lookupCount, 0);
  assert.equal(queuedCount, 0);
});

test('handlePostResetPassword returns success for valid token and password', async () => {
  const response = await handlePostResetPassword(
    makeRequest('http://localhost/api/auth/reset-password', {
      token: 'reset-token',
      newPassword: 'new-strong-password',
    }),
    makeResetDeps(),
  );

  assert.equal(response.status, 200);
  const json = await response.json() as { success: boolean };
  assert.equal(json.success, true);
});

test('handlePostResetPassword returns 400 when reset use-case rejects', async () => {
  const response = await handlePostResetPassword(
    makeRequest('http://localhost/api/auth/reset-password', {
      token: 'bad-token',
      newPassword: 'new-strong-password',
    }),
    makeResetDeps({
      resetPassword: async () => {
        throw new ValidationError('Reset token is invalid or expired');
      },
    }),
  );

  assert.equal(response.status, 400);
});

test('handlePostResetPassword returns 400 for invalid payload', async () => {
  const response = await handlePostResetPassword(
    makeRequest('http://localhost/api/auth/reset-password', {
      token: 'reset-token',
    }),
    makeResetDeps(),
  );

  assert.equal(response.status, 400);
});
