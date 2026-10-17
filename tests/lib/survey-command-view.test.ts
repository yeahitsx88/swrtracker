import test from 'node:test';
import assert from 'node:assert/strict';
import { commandReviewHref } from '@/lib/survey-command-view';

test('command drill-down retains supported cohort filters but not activity dates', () => {
  const href = commandReviewHref('project', { areaId: 'area', crewId: 'chief', dateFrom: '2026-09-01', dateTo: '2026-09-30' }, { status: 'COMPLETED' });
  assert.equal(href, '/projects/project/requests?view=requests&areaId=area&status=COMPLETED&crewId=chief');
});

test('command segment selection overrides its current dimension without expanding others', () => {
  const href = commandReviewHref('project', { ticketType: 'TOPO', status: 'SUBMITTED' }, { ticketType: 'LAYOUT' });
  assert.equal(href, '/projects/project/requests?view=requests&ticketType=LAYOUT&status=SUBMITTED');
});
