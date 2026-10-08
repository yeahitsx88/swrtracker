import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiClientError, getErrorMessage, isApiErrorPayload } from '@/lib/errors';

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
  for (const error of [undefined, new Error(' '), new ApiClientError('InternalError', '', 500, 'INTERNAL_ERROR')]) {
    assert.equal(getErrorMessage(error, 'Unable to load requests. Refresh to retry.'), 'Unable to load requests. Refresh to retry.');
  }
});

test('getErrorMessage falls back to raw Error message for non-api errors', () => {
  const err = new Error('boom');
  assert.equal(getErrorMessage(err, 'fallback'), 'boom');
});
