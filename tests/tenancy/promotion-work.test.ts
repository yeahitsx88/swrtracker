import test from 'node:test';
import assert from 'node:assert/strict';
import { newRoleCanComplete, planPromotionWork, validateWorkDecisions, type PromotionWorkItem } from '@/modules/tenancy/domain/promotion-work';

const SUBJECT = 'subject-1', OTHER = 'other-1';
const item = (fields: Partial<PromotionWorkItem>): PromotionWorkItem => ({ ticketId: 't-1', ticketNumber: 'FSS-1', description: 'Layout', status: 'ASSIGNED', rowVersion: 3, part: 'INSTRUMENT', ...fields });

test('crew work can be reassigned while approved or active, never kept by a new role', () => {
  for (const status of ['APPROVED', 'ASSIGNED', 'IN_PROGRESS', 'DELAYED']) {
    const [planned] = planPromotionWork([item({ status })], 'PARTY_CHIEF');
    assert.equal(planned?.reassignable, true, status);
    assert.equal(planned?.keepAllowed, false, status);
  }
});

test('work waiting on a field-report decision cannot move', () => {
  for (const status of ['PENDING_PC_APPROVAL', 'PENDING_FIELD_VALIDATION']) {
    const [planned] = planPromotionWork([item({ status, part: 'CHIEF' })], 'SURVEY_SUPERINTENDENT');
    assert.equal(planned?.reassignable, false);
    assert.equal(planned?.keepAllowed, false);
    assert.match(planned?.note ?? '', /field-report decision/);
  }
});

test('a recorded field-report review stays only with a role that sees every request', () => {
  assert.equal(newRoleCanComplete('REVIEWER', 'SURVEY_MANAGER'), true);
  for (const role of ['SURVEY_SUPERINTENDENT', 'PARTY_CHIEF', 'INSTRUMENT_MAN']) assert.equal(newRoleCanComplete('REVIEWER', role), false, role);
  assert.equal(newRoleCanComplete('CHIEF', 'SURVEY_MANAGER'), false);
});

test('every open item needs one valid decision against its reviewed version', () => {
  const planned = planPromotionWork([item({ ticketId: 'a' }), item({ ticketId: 'b', part: 'CHIEF' })], 'PARTY_CHIEF');
  const ok = [
    { ticketId: 'a', part: 'INSTRUMENT' as const, action: 'REASSIGN' as const, replacementId: OTHER, expectedRowVersion: 3 },
    { ticketId: 'b', part: 'CHIEF' as const, action: 'REASSIGN' as const, replacementId: OTHER, expectedRowVersion: 3 },
  ];
  assert.doesNotThrow(() => validateWorkDecisions(planned, ok, SUBJECT));
  assert.throws(() => validateWorkDecisions(planned, ok.slice(0, 1), SUBJECT), /changed since your review/, 'a missing item');
  assert.throws(() => validateWorkDecisions(planned, [{ ...ok[0]!, expectedRowVersion: 2 }, ok[1]!], SUBJECT), /changed since your review/, 'a stale version');
  assert.throws(() => validateWorkDecisions(planned, [{ ...ok[0]!, action: 'KEEP' }, ok[1]!], SUBJECT), /can’t stay with the new role/);
  assert.throws(() => validateWorkDecisions(planned, [{ ...ok[0]!, replacementId: SUBJECT }, ok[1]!], SUBJECT), /Choose who takes over/, 'the same person');
  assert.throws(() => validateWorkDecisions(planned, [ok[0]!, ok[0]!, ok[1]!], SUBJECT), /one action per request/);
});

test('the role change accepts only well-formed work decisions', async () => {
  const { parseWorkDecisions } = await import('@/app/api/projects/[projectId]/survey/teams/handler');
  const ticketId = '10000000-0000-4000-8000-0000000000aa', replacementId = '10000000-0000-4000-8000-0000000000bb';
  assert.equal(parseWorkDecisions(undefined), undefined);
  assert.deepEqual(parseWorkDecisions([{ ticketId, part: 'INSTRUMENT', action: 'REASSIGN', replacementId, expectedRowVersion: 4 }]),
    [{ ticketId, part: 'INSTRUMENT', action: 'REASSIGN', replacementId, expectedRowVersion: 4 }]);
  assert.throws(() => parseWorkDecisions([{ ticketId, part: 'INSTRUMENT', action: 'MOVE', expectedRowVersion: 4 }]), /keep or reassign/);
  assert.throws(() => parseWorkDecisions([{ ticketId, part: 'INSTRUMENT', action: 'KEEP', expectedRowVersion: 4, extra: true }]), /keep or reassign/);
  assert.throws(() => parseWorkDecisions(new Array(201).fill({})), /at most 200/);
});
