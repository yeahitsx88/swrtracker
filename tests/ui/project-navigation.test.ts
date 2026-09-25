import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProjectRole } from '@/modules/identity/domain/types';
import { getProjectLandingHref, getProjectNavigation } from '@/components/ui/project-navigation';

function labels(role: ProjectRole): string[] {
  return getProjectNavigation(role).map((item) => item.label);
}

test('Amelia pilot roles receive only their relevant project navigation', () => {
  assert.deepEqual(labels('REQUESTER'), ['New Request', 'My Requests', 'Drafts']);
  assert.deepEqual(labels('SURVEY_MANAGER'), ['Survey Operations', 'All Requests']);
  assert.deepEqual(labels('PARTY_CHIEF'), ['Crew Work', 'PC Approvals']);
  assert.deepEqual(labels('INSTRUMENT_MAN'), ['Crew Work']);
  assert.deepEqual(labels('PROJECT_ADMIN'), ['Admin']);
});

test('other supported project roles retain a read or operational entry point', () => {
  const roles: ProjectRole[] = [
    'SURVEY_SUPERINTENDENT',
    'CAD_TECHNICIAN',
    'CAD_LEAD',
    'DEPARTMENT_MANAGER',
    'DEPARTMENT_LEAD',
    'VIEWER',
    'AREA_VIEWER',
    'SUBCONTRACTS_COORDINATOR',
  ];

  for (const role of roles) assert.ok(getProjectNavigation(role).length > 0, role);
});

test('project landing follows the first authorized navigation destination', () => {
  assert.equal(getProjectLandingHref('amelia', 'REQUESTER'), '/projects/amelia/request/new');
  assert.equal(getProjectLandingHref('amelia', 'SURVEY_MANAGER'), '/projects/amelia/survey/operations');
  assert.equal(getProjectLandingHref('amelia', 'PARTY_CHIEF'), '/projects/amelia/crew/work');
  assert.equal(getProjectLandingHref('amelia', 'PROJECT_ADMIN'), '/projects/amelia/admin');
});
