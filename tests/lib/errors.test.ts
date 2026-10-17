import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiClientError, NetworkError, NETWORK_MESSAGE, getErrorMessage, isApiErrorPayload } from '@/lib/errors';

test('isApiErrorPayload accepts structured payload with status/code metadata', () => {
  const payload = {
    error: {
      type: 'InternalError',
      message: 'Unexpected failure',
      code: 'INTERNAL_ERROR',
      correlationId: 'corr-123',
      status: 500,
    },
  };

  assert.equal(isApiErrorPayload(payload), true);
});

test('getErrorMessage keeps actionable wording and preserves diagnostic metadata', () => {
  const err = new ApiClientError('ConflictError', 'Reload the current request and review again.', 409, 'CONFLICT', 'corr-123');
  assert.equal(getErrorMessage(err, 'fallback'), 'Reload the current request and review again.');
  assert.equal(err.status, 409);
  assert.equal(err.code, 'CONFLICT');
  assert.equal(err.type, 'ConflictError');
  assert.equal(err.correlationId, 'corr-123');
});

test('getErrorMessage uses supplied recovery wording when no usable message is available', () => {
  for (const error of [undefined, new Error(' ')]) {
    assert.equal(getErrorMessage(error, 'Unable to load requests. Refresh to retry.'), 'Unable to load requests. Refresh to retry.');
  }
});

test('getErrorMessage falls back to raw Error message for non-api errors', () => {
  const err = new Error('boom');
  assert.equal(getErrorMessage(err, 'fallback'), 'boom');
});

test('unexpected server failures lead with the caller recovery wording and a support reference, never raw text', () => {
  const message = getErrorMessage(new ApiClientError('InternalError', 'An unexpected error occurred', 500, 'INTERNAL_ERROR', '1234abcd-ffff'), 'Unable to load requests');
  assert.match(message, /^Unable to load requests. Something went wrong on our side/);
  assert.match(message, /reference 1234abcd./);
  assert.doesNotMatch(message, /unexpected error occurred/);
  assert.match(getErrorMessage(new ApiClientError('InternalError', '', 502), 'Unable to save.'), /^Unable to save. Something went wrong/);
});

test('network failures and the browser raw fetch TypeError become one plain explanation', () => {
  assert.equal(getErrorMessage(new NetworkError(), 'fallback'), NETWORK_MESSAGE);
  assert.equal(getErrorMessage(new TypeError('Failed to fetch'), 'fallback'), NETWORK_MESSAGE);
  assert.ok(!(new NetworkError() instanceof ApiClientError), 'uncertain outcomes stay outside ApiClientError so exact-retry intent is kept');
});

test('session ends are explained; wrong-password sign-in keeps its own message', () => {
  assert.match(getErrorMessage(new ApiClientError('UnauthorizedError', 'Current active session is required', 401, 'AUTH_SESSION_REVOKED'), 'x'), /^Your sign-in has ended or changed/);
  assert.equal(getErrorMessage(new ApiClientError('UnauthorizedError', 'Invalid email or password', 401, 'AUTH_UNAUTHORIZED'), 'x'), 'Invalid email or password');
});

test('permission and missing-record messages keep the rule and add the next step; role codes are humanized', () => {
  assert.equal(getErrorMessage(new ApiClientError('ForbiddenError', 'Only TENANT_ADMIN can create projects', 403), 'x'),
    'Only Tenant Admin can create projects. Contact your project administrator if you believe this is incorrect.');
  assert.equal(getErrorMessage(new ApiClientError('NotFoundError', 'Ticket not found', 404), 'x'), 'Ticket not found. It may have been removed, or you may no longer have access.');
  assert.equal(getErrorMessage(new ApiClientError('RateLimitError', 'Too many requests', 429), 'x'), 'Too many attempts in a short time. Wait a minute, then try again.');
  assert.equal(getErrorMessage(new ApiClientError('ValidationError', 'Choose an active project Area', 400), 'x'), 'Choose an active project Area');
});

test('internal record ids never reach the operator', () => {
  assert.equal(getErrorMessage(new ApiClientError('NotFoundError', 'Ticket b815bcf4-5958-41a9-b3aa-c3bfbae9fd92 not found', 404), 'x'),
    'This request was not found. It may have been removed, or you may no longer have access.');
  assert.equal(getErrorMessage(new ApiClientError('ConflictError', 'Superintendent (10000000-0000-4000-8000-000000000013) changed', 409), 'x'), 'Superintendent changed');
});

test('server field names are shown as plain words; version conflicts ask for a reload', () => {
  assert.equal(getErrorMessage(new ApiClientError('ValidationError', 'inviteToken is invalid or expired', 400), 'x'), 'The invitation link is invalid or expired');
  assert.equal(getErrorMessage(new ApiClientError('ValidationError', 'assignedPartyChiefId must be an active Party Chief on this project', 400), 'x'),
    'The selected Party Chief must be an active Party Chief on this project');
  assert.equal(getErrorMessage(new ApiClientError('ValidationError', 'parentId is required for non-root AOR nodes', 400), 'x'), 'The parent Area is required for non-root Area');
  assert.match(getErrorMessage(new ApiClientError('ValidationError', 'expectedVersion must be a nonnegative integer', 400), 'x'), /^This record changed since you opened it/);
  assert.equal(getErrorMessage(new ApiClientError('ValidationError', 'Choose an active project Area', 400), 'x'), 'Choose an active project Area', 'plain messages are untouched');
});
