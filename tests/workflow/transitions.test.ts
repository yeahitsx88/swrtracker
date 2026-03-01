import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConflictError } from '@/shared/errors';
import { assertValidTransition } from '@/modules/workflow/domain/transitions';

test('standard approval transitions accept valid steps', () => {
  assert.doesNotThrow(() => assertValidTransition('STANDARD_APPROVAL', 'DRAFT', 'SUBMITTED'));
  assert.doesNotThrow(() => assertValidTransition('STANDARD_APPROVAL', 'SUBMITTED', 'APPROVED'));
  assert.doesNotThrow(() => assertValidTransition('STANDARD_APPROVAL', 'SUBMITTED', 'REJECTED'));
});

test('standard approval transitions reject invalid steps', () => {
  assert.throws(
    () => assertValidTransition('STANDARD_APPROVAL', 'DRAFT', 'APPROVED'),
    ConflictError,
  );
});

test('direct assignment transitions accept valid steps', () => {
  assert.doesNotThrow(() => assertValidTransition('DIRECT_ASSIGNMENT', 'CREATED', 'ASSIGNED'));
  assert.doesNotThrow(() => assertValidTransition('DIRECT_ASSIGNMENT', 'COMPLETED', 'CLOSED'));
});

test('direct assignment transitions reject invalid steps', () => {
  assert.throws(
    () => assertValidTransition('DIRECT_ASSIGNMENT', 'CREATED', 'APPROVED'),
    ConflictError,
  );
  assert.throws(
    () => assertValidTransition('DIRECT_ASSIGNMENT', 'CLOSED', 'IN_PROGRESS'),
    ConflictError,
  );
});
