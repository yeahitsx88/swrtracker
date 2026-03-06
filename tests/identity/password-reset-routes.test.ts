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
    includeDebugToken: () => true,
    sendResetEmail: async () => undefined,
    resolveAppBaseUrl: () => 'http://localhost:3000',
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

test('handlePostForgotPassword returns success and debug token when enabled', async () => {
  const response = await handlePostForgotPassword(
    makeRequest('http://localhost/api/auth/forgot-password', {
      tenantId: 'tenant-1',
      email: 'field.user@example.com',
    }),
    makeForgotDeps(),
  );

  assert.equal(response.status, 200);
  const json = await response.json() as { success: boolean; debugResetToken?: string | null };
  assert.equal(json.success, true);
  assert.equal(json.debugResetToken, 'debug-token');
});

test('handlePostForgotPassword hides debug token when disabled', async () => {
  const response = await handlePostForgotPassword(
    makeRequest('http://localhost/api/auth/forgot-password', {
      tenantId: 'tenant-1',
      email: 'field.user@example.com',
    }),
    makeForgotDeps({
      includeDebugToken: () => false,
    }),
  );

  assert.equal(response.status, 200);
  const json = await response.json() as { success: boolean; debugResetToken?: string | null };
  assert.equal(json.success, true);
  assert.equal('debugResetToken' in json, false);
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

test('handlePostForgotPassword sends reset email only when token is generated', async () => {
  let sendCount = 0;
  const response = await handlePostForgotPassword(
    makeRequest('http://localhost/api/auth/forgot-password', {
      tenantId: 'tenant-1',
      email: 'field.user@example.com',
    }),
    makeForgotDeps({
      requestPasswordReset: async () => ({ resetToken: 'email-token' }),
      sendResetEmail: async () => {
        sendCount += 1;
      },
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(sendCount, 1);
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
