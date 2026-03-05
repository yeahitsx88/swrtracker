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

test('getErrorMessage formats ApiClientError as status + brief message', () => {
  const err = new ApiClientError('InternalError', 'Unexpected failure', 500, 'INTERNAL_ERROR');
  assert.equal(getErrorMessage(err, 'fallback'), '500 INTERNAL_ERROR: Unexpected failure');
});

test('getErrorMessage falls back to raw Error message for non-api errors', () => {
  const err = new Error('boom');
  assert.equal(getErrorMessage(err, 'fallback'), 'boom');
});
