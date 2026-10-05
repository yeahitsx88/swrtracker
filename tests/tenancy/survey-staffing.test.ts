import assert from 'node:assert/strict';
import test from 'node:test';
import { saveSurveyStaffing, type SurveyStaffingRepository } from '@/modules/tenancy/application/save-survey-staffing';
import { ConflictError, ForbiddenError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}` as UUID;
const tenantId = id(1), projectId = id(2), actorId = id(3), chiefId = id(4), areaId = id(5), superintendentId = id(6), instrumentManId = id(7);
const db = {} as DbClient;
const input = () => ({ expectedSnapshot: 'a'.repeat(32), partyChiefId: chiefId, areaId, superintendentId, instrumentManIds: [instrumentManId], confirmRoleChanges: true });

function fixture() {
  const writes: string[] = [];
  const roles = new Map<UUID, ProjectRole>([[chiefId, 'PARTY_CHIEF'], [superintendentId, 'SURVEY_SUPERINTENDENT'], [instrumentManId, 'INSTRUMENT_MAN']]);
  const areas: UUID[] = [];
  let rosterChief: UUID | null = null;
  let link = false;
  let covered = true;
  const repo: SurveyStaffingRepository = {
    lockManager: async () => true, snapshot: async () => 'a'.repeat(32), lockSubjects: async () => {},
    lockProject: async () => ({ status: 'ACTIVE', crewBuild: 'FULL' }),
    member: async (_db, _tenant, _project, userId) => roles.has(userId) ? { userId, role: roles.get(userId)! } : null,
    activeArea: async () => true,
    superintendentCoversArea: async () => covered,
    activeAreasForUser: async () => areas,
    rosterChief: async () => rosterChief,
    changeRole: async (_db, _tenant, _project, userId, role) => { roles.set(userId, role); writes.push(`role:${userId}:${role}`); },
    addArea: async () => { areas.push(areaId); writes.push('area'); },
    setReportingLink: async () => { if (link) return { changed: false, previousSuperintendentId: superintendentId, previousAreaId: areaId }; link = true; writes.push('link'); return { changed: true, previousSuperintendentId: null, previousAreaId: null }; },
    addInstrumentMan: async () => { rosterChief = chiefId; writes.push('roster'); },
    record: async () => { writes.push('audit'); },
  };
  const save = (actorRole: ProjectRole = 'SURVEY_MANAGER') => saveSurveyStaffing(repo, db, { tenantId, projectId, actorId, actorRole, sessionVersion: 1, input: input() });
  return { repo, roles, areas, writes, save, setCovered: (value: boolean) => { covered = value; }, setRosterChief: (value: UUID) => { rosterChief = value; } };
}

test('only Survey Manager may change fixed-role staffing', async () => {
  const f = fixture();
  await assert.rejects(f.save('PROJECT_ADMIN'), ForbiddenError);
  assert.deepEqual(f.writes, []);
});

test('Superintendent must explicitly cover the selected active Area', async () => {
  const f = fixture(); f.setCovered(false);
  await assert.rejects(f.save(), ForbiddenError);
  assert.deepEqual(f.writes, []);
});

test('another Party Chief roster cannot be silently reassigned', async () => {
  const f = fixture(); f.setRosterChief(id(9));
  await assert.rejects(f.save(), ConflictError);
  assert.deepEqual(f.writes, []);
});

test('selected people must already be project members with compatible roles', async () => {
  const f = fixture(); f.roles.delete(instrumentManId);
  await assert.rejects(f.save(), ValidationError);
  assert.deepEqual(f.writes, []);
  f.roles.set(instrumentManId, 'SURVEY_MANAGER');
  await assert.rejects(f.save(), ConflictError);
  assert.deepEqual(f.writes, []);
});

test('staffing cannot convert Requesters or Viewers into survey personnel', async () => {
  for (const userId of [chiefId,instrumentManId]) {
    for (const role of ['REQUESTER','VIEWER'] as const) {
      const f=fixture();f.roles.set(userId,role);
      await assert.rejects(f.save(),ConflictError);
      assert.deepEqual(f.writes,[]);
    }
  }
});

test('Manager staffing preserves survey roles and records one atomic staffing event', async () => {
  const f = fixture();
  assert.deepEqual(await f.save(), { changed: true });
  assert.equal(f.roles.get(chiefId), 'PARTY_CHIEF');
  assert.equal(f.roles.get(instrumentManId), 'INSTRUMENT_MAN');
  assert.deepEqual(f.writes.map(write => write.split(':')[0]), ['area', 'link', 'roster', 'audit']);
  assert.deepEqual(await f.save(), { changed: false });
  assert.equal(f.writes.filter(write => write === 'audit').length, 1);
});

test('Full builds require an explicit Superintendent; Medium builds reject one', async () => {
  const f = fixture();
  await assert.rejects(saveSurveyStaffing(f.repo, db, {
    tenantId, projectId, actorId, actorRole: 'SURVEY_MANAGER', sessionVersion: 1, input: { ...input(), superintendentId: null },
  }), ValidationError);
  const original = f.repo.lockProject;
  f.repo.lockProject = async () => ({ status: 'ACTIVE', crewBuild: 'MEDIUM' });
  await assert.rejects(f.save(), ValidationError);
  f.repo.lockProject = original;
  assert.deepEqual(f.writes, []);
});
