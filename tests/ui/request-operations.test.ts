import test from 'node:test';
import assert from 'node:assert/strict';
import type { TicketRecord } from '@/lib/contracts';
import { crewPart, fieldReportPart, needsAssignment, OPEN_STATUSES } from '@/lib/request-operation-rules';

const CHIEF = 'chief-1', IM = 'im-1', REVIEWER = 'super-1', OTHER = 'someone-else';
const ticket = (fields: Partial<TicketRecord>) => ({ id: 't-1', status: 'ASSIGNED', assignedPartyChiefId: CHIEF, assignedInstrumentManId: IM, ...fields }) as TicketRecord;

test('crew operations are offered only to the crew personally assigned to the request', () => {
  assert.equal(crewPart(ticket({}), 'PARTY_CHIEF', CHIEF), 'chief');
  assert.equal(crewPart(ticket({}), 'INSTRUMENT_MAN', IM), 'instrument');
  assert.equal(crewPart(ticket({}), 'PARTY_CHIEF', OTHER), null, 'another Party Chief');
  assert.equal(crewPart(ticket({}), 'INSTRUMENT_MAN', OTHER), null, 'another Instrument Man');
  assert.equal(crewPart(ticket({}), 'PARTY_CHIEF', undefined), null, 'unknown actor');
  for (const role of ['REQUESTER', 'SURVEY_MANAGER', 'SURVEY_SUPERINTENDENT', 'VIEWER']) {
    assert.equal(crewPart(ticket({}), role, CHIEF), null, `${role} never gets crew operations, even with a matching id`);
    assert.equal(crewPart(ticket({}), role, IM), null, `${role} never gets field operations, even with a matching id`);
  }
});

test('inability reports are decided only by the recorded survey reviewer', () => {
  const pending = ticket({ status: 'PENDING_FIELD_VALIDATION', fieldValidationReviewerId: REVIEWER });
  assert.equal(fieldReportPart(pending, 'SURVEY_SUPERINTENDENT', REVIEWER), 'validation');
  assert.equal(fieldReportPart(pending, 'SURVEY_MANAGER', OTHER), 'validation-reserved', 'leadership that is not the recorded reviewer');
  assert.equal(fieldReportPart(pending, 'REQUESTER', REVIEWER), 'validation-reserved', 'a matching id without a survey role');
});

test('legacy field reports go to the assigned Party Chief or survey leadership', () => {
  const legacy = ticket({ status: 'PENDING_PC_APPROVAL' });
  assert.equal(fieldReportPart(legacy, 'PARTY_CHIEF', CHIEF), 'legacy');
  assert.equal(fieldReportPart(legacy, 'SURVEY_MANAGER', OTHER), 'legacy');
  assert.equal(fieldReportPart(legacy, 'SURVEY_SUPERINTENDENT', OTHER), 'legacy');
  assert.equal(fieldReportPart(legacy, 'PARTY_CHIEF', OTHER), 'legacy-reserved', 'another Party Chief');
  for (const status of ['SUBMITTED', 'APPROVED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED'] as const) {
    assert.equal(fieldReportPart(ticket({ status }), 'SURVEY_MANAGER', OTHER), null, `${status} has no field report`);
  }
});

test('Need Assignment means approved without an Instrument Man', () => {
  assert.equal(needsAssignment(ticket({ status: 'APPROVED', assignedInstrumentManId: null })), true);
  assert.equal(needsAssignment(ticket({ status: 'APPROVED', assignedPartyChiefId: CHIEF, assignedInstrumentManId: null })), true, 'Chief chosen, crew not complete');
  assert.equal(needsAssignment(ticket({ status: 'APPROVED' })), false);
  assert.equal(needsAssignment(ticket({ status: 'SUBMITTED', assignedInstrumentManId: null })), false);
});

test('Survey Manager oversight never applies to drafts or closed requests', () => {
  for (const closed of ['DRAFT', 'COMPLETED', 'REJECTED', 'REQUESTER_CANCELED', 'FIELD_CANCELED', 'SURVEY_CANCELED']) {
    assert.equal(OPEN_STATUSES.includes(closed), false, closed);
  }
});
