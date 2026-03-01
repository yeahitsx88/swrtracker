import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';

test('errorResponse maps known errors to status codes and payload shape', async () => {
  const cases = [
    { error: new ValidationError('bad input'), status: 400, type: 'ValidationError' },
    { error: new UnauthorizedError('login required'), status: 401, type: 'UnauthorizedError' },
    { error: new ForbiddenError('no access'), status: 403, type: 'ForbiddenError' },
    { error: new NotFoundError('missing'), status: 404, type: 'NotFoundError' },
    { error: new ConflictError('conflict'), status: 409, type: 'ConflictError' },
    { error: new InternalError('boom'), status: 500, type: 'InternalError' },
  ] as const;

  for (const entry of cases) {
    const response = errorResponse(entry.error);
    assert.equal(response.status, entry.status);

    const body = await response.json();
    assert.deepEqual(body, {
      error: {
        type: entry.type,
        message: entry.error.message,
      },
    });
  }
});

test('errorResponse maps unknown errors to generic internal error response', async () => {
  const response = errorResponse(new Error('unexpected'));
  assert.equal(response.status, 500);

  const body = await response.json();
  assert.deepEqual(body, {
    error: {
      type: 'InternalError',
      message: 'An unexpected error occurred',
    },
  });
});
