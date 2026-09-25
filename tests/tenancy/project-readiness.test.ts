import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateProjectReadiness } from '@/modules/tenancy/domain/project-readiness';

const facts = {
  crewBuild: 'MEDIUM' as const,
  aorLevels: 1,
  aorNodes: 1,
  surveyManagers: 1,
  superintendentAorAssignments: 0,
  departments: 1,
  actingSurveyManagers: 1,
  allowedDomains: 1,
};

test('Medium Build is ready without a Superintendent when all hard requirements exist', () => {
  assert.deepEqual(evaluateProjectReadiness(facts), { hardFailures: [], warnings: [] });
});

test('Full Build requires a Superintendent assigned to an AOR', () => {
  const result = evaluateProjectReadiness({ ...facts, crewBuild: 'FULL' });
  assert.equal(result.hardFailures.length, 1);
  assert.match(result.hardFailures[0] ?? '', /Superintendent/);
});

test('missing baseline requirements block and soft requirements warn', () => {
  const result = evaluateProjectReadiness({ ...facts,
    aorLevels: 0, aorNodes: 0, surveyManagers: 0,
    departments: 0, actingSurveyManagers: 0, allowedDomains: 0,
  });
  assert.equal(result.hardFailures.length, 3);
  assert.equal(result.warnings.length, 3);
});
