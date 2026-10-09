import test from 'node:test';
import assert from 'node:assert/strict';
import { createFixture, canMove, projectMove } from '../../src/app/prototypes/survey-team/fixtures';

test('prototype accepts only IM-to-Chief and Chief-to-Superintendent moves, excluding current parent', () => {
  const people = createFixture();
  for (const person of people) for (const target of people) {
    const expected = target.id !== person.parentId && (
      person.role === 'Instrument Man' && target.role === 'Party Chief' ||
      person.role === 'Party Chief' && target.role === 'Survey Superintendent'
    );
    assert.equal(canMove(person, target), expected, `${person.role} → ${target.role}`);
  }
  assert.throws(() => projectMove(people, { personId: 'im-1', destinationId: 'sup-2' }), /Invalid/);
});

test('proposed crew move preserves every descendant and leaves committed fixtures unchanged', () => {
  const people = createFixture();
  const original = structuredClone(people);
  const preview = projectMove(people, { personId: 'chief-1', destinationId: 'sup-2' });
  assert.equal(preview.find(p => p.id === 'chief-1')?.parentId, 'sup-2');
  assert.equal(preview.find(p => p.id === 'chief-1')?.area, 'South Process');
  assert.deepEqual(preview.filter(p => p.parentId === 'chief-1'), original.filter(p => p.parentId === 'chief-1'));
  assert.deepEqual(people, original);
});

test('available IM can be assigned, then moved independently without disturbing other crew members', () => {
  const people = createFixture();
  const assigned = projectMove(people, { personId: 'available-0', destinationId: 'chief-2' });
  const moved = projectMove(assigned, { personId: 'available-0', destinationId: 'chief-5' });
  assert.equal(moved.find(p => p.id === 'available-0')?.parentId, 'chief-5');
  assert.deepEqual(moved.filter(p => p.id !== 'available-0'), people.filter(p => p.id !== 'available-0'));
  assert.equal(createFixture().find(p => p.id === 'available-0')?.parentId, null);
});
