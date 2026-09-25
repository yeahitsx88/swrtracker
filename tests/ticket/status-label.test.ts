import assert from 'node:assert/strict';
import test from 'node:test';
import { statusLabel } from '@/modules/ticket/domain/status-label';

test('requester status labels do not expose internal pending approval code', () => {
  assert.equal(statusLabel('PENDING_PC_APPROVAL'), 'Under Review by Survey Lead');
  assert.equal(statusLabel('SUBMITTED'), 'Pending Review');
  assert.equal(statusLabel('CREATED'), 'Awaiting Assignment');
});
