import test from 'node:test';
import assert from 'node:assert/strict';
import { isActionableNotice, SUCCESS_DISMISS_MS } from '@/components/ui/feedback';

test('completion messages auto-dismiss unless they ask the reader to act', () => {
  assert.ok(SUCCESS_DISMISS_MS >= 5000 && SUCCESS_DISMISS_MS <= 15000, 'long enough to read, short enough not to linger');
  for (const actionable of ['Grant Project Admin: done. The affected person must sign in again for the change to apply.', 'Project role saved. The person must sign in again.', 'Access removed. They must sign in again before any further work.']) {
    assert.equal(isActionableNotice(actionable), true, actionable);
  }
  for (const transient of ['Register TELCO for this project: done.', 'Draft deleted. Project IT can restore it within 30 days.', 'Custom role deleted.', 'Password changed. You stay signed in here; other devices and browsers have been signed out.']) {
    assert.equal(isActionableNotice(transient), false, transient);
  }
});
