import test from 'node:test';
import assert from 'node:assert/strict';
import { blockersFrom } from '@/components/ui/action-blockers';

test('blockersFrom keeps only the reasons that apply, in order, with their targets', () => {
  assert.deepEqual(blockersFrom([
    [true, 'Enter a team name.', 'tm-team-name'],
    [false, 'Select at least one Area.', 'tm-team-areas'],
    [true, 'The team changed. Reload first.'],
    [true, 'Choose the team lead.', 'tm-team-lead'],
  ]), [
    { reason: 'Enter a team name.', target: 'tm-team-name' },
    { reason: 'The team changed. Reload first.' },
    { reason: 'Choose the team lead.', target: 'tm-team-lead' },
  ]);
});

test('blockersFrom returns no reasons when every check passes, which leaves the action enabled', () => {
  assert.deepEqual(blockersFrom([[false, 'Enter a team name.', 'tm-team-name'], [false, 'Tick the confirmation box.']]), []);
});
