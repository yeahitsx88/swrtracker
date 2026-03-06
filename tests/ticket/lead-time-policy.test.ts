import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_LEAD_TIME_DAYS,
  doesRequestedDateMeetLeadTime,
  isLeadTimeDaysValid,
  normalizeProjectLeadTimeConfig,
} from '@/modules/ticket/domain/lead-time-policy';

test('isLeadTimeDaysValid enforces integer bounds', () => {
  assert.equal(isLeadTimeDaysValid(1), true);
  assert.equal(isLeadTimeDaysValid(30), true);
  assert.equal(isLeadTimeDaysValid(0), false);
  assert.equal(isLeadTimeDaysValid(31), false);
  assert.equal(isLeadTimeDaysValid(2.5), false);
});

test('normalizeProjectLeadTimeConfig defaults invalid values to standard policy', () => {
  const normalized = normalizeProjectLeadTimeConfig({
    enforcementEnabled: true,
    leadTimeDays: 999,
  });

  assert.equal(normalized.enforcementEnabled, true);
  assert.equal(normalized.leadTimeDays, DEFAULT_LEAD_TIME_DAYS);
});

test('doesRequestedDateMeetLeadTime passes when enforcement disabled', () => {
  const now = new Date('2026-03-05T12:00:00Z');
  const requested = new Date('2026-03-05T13:00:00Z');
  const passes = doesRequestedDateMeetLeadTime(requested, now, {
    enforcementEnabled: false,
    leadTimeDays: 10,
  });
  assert.equal(passes, true);
});

test('doesRequestedDateMeetLeadTime enforces day-based minimum when enabled', () => {
  const now = new Date('2026-03-05T12:00:00Z');
  const tooSoon = new Date('2026-03-07T11:59:00Z');
  const valid = new Date('2026-03-07T12:00:00Z');

  assert.equal(
    doesRequestedDateMeetLeadTime(tooSoon, now, {
      enforcementEnabled: true,
      leadTimeDays: 2,
    }),
    false,
  );
  assert.equal(
    doesRequestedDateMeetLeadTime(valid, now, {
      enforcementEnabled: true,
      leadTimeDays: 2,
    }),
    true,
  );
});

