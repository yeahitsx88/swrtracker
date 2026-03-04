import test from 'node:test';
import assert from 'node:assert/strict';
import { ConflictError } from '@/shared/errors';
import { assertValidTransition } from '@/modules/workflow/domain/transitions';

test('standard approval supports pending Party Chief approval workflow', () => {
  assert.doesNotThrow(() => assertValidTransition('STANDARD_APPROVAL', 'IN_PROGRESS', 'PENDING_PC_APPROVAL'));
  assert.doesNotThrow(() => assertValidTransition('STANDARD_APPROVAL', 'PENDING_PC_APPROVAL', 'COMPLETED'));
  assert.doesNotThrow(() => assertValidTransition('STANDARD_APPROVAL', 'PENDING_PC_APPROVAL', 'DELAYED'));
  assert.doesNotThrow(() => assertValidTransition('STANDARD_APPROVAL', 'DELAYED', 'IN_PROGRESS'));
  assert.doesNotThrow(() => assertValidTransition('STANDARD_APPROVAL', 'APPROVED', 'SURVEY_CANCELED'));
});

test('direct assignment starts at ASSIGNED and no longer permits CREATED', () => {
  assert.doesNotThrow(() => assertValidTransition('DIRECT_ASSIGNMENT', 'ASSIGNED', 'IN_PROGRESS'));
  assert.doesNotThrow(() => assertValidTransition('DIRECT_ASSIGNMENT', 'ASSIGNED', 'REQUESTER_CANCELED'));
  assert.doesNotThrow(() => assertValidTransition('DIRECT_ASSIGNMENT', 'ASSIGNED', 'SURVEY_CANCELED'));
  assert.doesNotThrow(() => assertValidTransition('DIRECT_ASSIGNMENT', 'IN_PROGRESS', 'PENDING_PC_APPROVAL'));
  assert.doesNotThrow(() => assertValidTransition('DIRECT_ASSIGNMENT', 'PENDING_PC_APPROVAL', 'FIELD_CANCELED'));
  assert.doesNotThrow(() => assertValidTransition('DIRECT_ASSIGNMENT', 'DELAYED', 'PENDING_PC_APPROVAL'));
  assert.throws(
    () => assertValidTransition('DIRECT_ASSIGNMENT', 'CREATED' as never, 'ASSIGNED'),
    ConflictError,
  );
});

test('legacy close and cancel states are no longer valid transitions', () => {
  assert.throws(
    () => assertValidTransition('STANDARD_APPROVAL', 'COMPLETED', 'CLOSED' as never),
    ConflictError,
  );
  assert.throws(
    () => assertValidTransition('STANDARD_APPROVAL', 'IN_PROGRESS', 'CANCEL_REQUESTED' as never),
    ConflictError,
  );
});
