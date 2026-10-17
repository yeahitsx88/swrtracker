import test from 'node:test';
import assert from 'node:assert/strict';
import { composeOffboardingReason, offboardingCommentLimit, OFFBOARDING_REASONS } from '@/lib/offboarding-reasons';

test('access removal reasons are the approved list (D6)', () => {
  assert.deepEqual([...OFFBOARDING_REASONS], ['Terminated', 'Resigned', 'Transferred', 'Other']);
});

test('the chosen reason is stored as a prefix the server accepts', () => {
  for (const category of ['Terminated', 'Resigned', 'Transferred'] as const) {
    const bare = composeOffboardingReason(category, '  ');
    assert.equal(bare, `[${category}]`);
    assert.ok(bare && bare.length >= 10 && bare.length <= 1000, 'meets the existing 10–1000 character rule without a comment');
  }
  assert.equal(composeOffboardingReason('Resigned', ' Last day 4 October '), '[Resigned] Last day 4 October');
});

test('Other needs its own explanation; nothing is stored without a choice', () => {
  assert.equal(composeOffboardingReason('', 'Some explanation here'), null);
  assert.equal(composeOffboardingReason('Other', 'short'), null);
  assert.equal(composeOffboardingReason('Other', 'Contract ended early'), '[Other] Contract ended early');
});

test('the stored reason never exceeds the server limit', () => {
  const limit = offboardingCommentLimit('Transferred');
  assert.equal(composeOffboardingReason('Transferred', 'x'.repeat(limit))?.length, 1000);
  assert.equal(composeOffboardingReason('Transferred', 'x'.repeat(limit + 1)), null);
});
