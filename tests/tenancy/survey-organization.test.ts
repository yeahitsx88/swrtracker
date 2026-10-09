import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { readOrganizationPages, readSurveyOrganization, type OrganizationReadRepositories, type SurveyOrganization } from '@/modules/tenancy/application/read-survey-organization';
import { organizationChartPeople } from '@/components/ui/survey-org-chart/survey-org-chart-live-model';
import { handleGetSurveyOrganization, type OrganizationReadDeps } from '@/app/api/projects/[projectId]/survey/organization/handler';
import type { TeamActor, TeamPersonnel, SurveyTeamDetail } from '@/modules/tenancy/application/survey-teams';
import type { SurveyStaffingDetail } from '@/modules/tenancy/application/read-survey-staffing';
import type { DbClient, UUID } from '@/shared/types';
import { ForbiddenError, UnauthorizedError } from '@/shared/errors';

const id = (n: number) => `91000000-0000-4000-8000-${String(n).padStart(12, '0')}` as UUID;
const actor: TeamActor = { tenantId: id(1), projectId: id(2), actorId: id(3), actorRole: 'SURVEY_MANAGER', sessionVersion: 1 };
const auth = { tenantId: actor.tenantId, userId: actor.actorId, sessionVersion: 1 };
const person = (n: number, role: TeamPersonnel['role']): TeamPersonnel => ({ userId: id(n), name: `Survey ${n}`, email: `survey${n}@example.invalid`, role, active: true, teamId: null, teamName: null, roleVersion: 1 });
const manager = person(3, 'SURVEY_MANAGER'), superintendent = person(4, 'SURVEY_SUPERINTENDENT'), chief = person(5, 'PARTY_CHIEF'), instrument = person(6, 'INSTRUMENT_MAN');
const area = { id: id(20), name: 'Reporting Area', retired: false };
const team: SurveyTeamDetail = { id: id(30), name: 'Distinct Named Team', areaId: id(21), areaName: 'Team Area', areas: [{ id: id(21), name: 'Team Area' }, { id: id(22), name: 'Additional Team Area' }], lead: superintendent, members: [superintendent, chief, instrument], memberCount: 3, rowVersion: 1 };
const staffing: SurveyStaffingDetail = { snapshotToken: 'a'.repeat(32), partyChief: chief, reporting: { id: id(40), superintendent, area, assignedAt: '2026-10-06' },
  areas: { data: [{ id: id(23), name: 'Individual Chief Area', retired: true }], total: 1, limit: 100, truncated: false },
  instrumentMen: { data: [instrument], total: 1, limit: 100, offset: 0 }, instrumentManTotal: 1 };

function fixture() {
  const scope: unknown[][] = [];
  let readCount = 0;
  const personnel = [manager, superintendent, chief, instrument].map(value => ({ ...value, ...(value === manager ? {} : { teamId: team.id, teamName: team.name }) }));
  const page = <T>(data: T[]) => ({ data, total: data.length, limit: 100, offset: 0 });
  const repos = {
    teams: {
      projectContext: async (_db: DbClient, tenant: UUID, project: UUID) => { readCount++; scope.push([tenant, project]); return { status: 'ACTIVE', crewBuild: 'FULL' }; },
      personnel: async (_db: DbClient, tenant: UUID, project: UUID) => { readCount++; scope.push([tenant, project]); return page(personnel); },
      list: async (_db: DbClient, tenant: UUID, project: UUID) => { readCount++; scope.push([tenant, project]); return page([team]); },
      team: async (_db: DbClient, tenant: UUID, project: UUID, teamId: UUID) => { readCount++; scope.push([tenant, project]); assert.equal(teamId, team.id); return team; },
    },
    staffing: { readStaffing: async (_db: DbClient, tenant: UUID, project: UUID, chiefId: UUID) => { readCount++; scope.push([tenant, project]); assert.equal(chiefId, chief.userId); return staffing; } },
    superintendentAreas: { readPage: async (_db: DbClient, current: typeof auth, project: UUID) => {
      readCount++; scope.push([current.tenantId, project]);
      return { mode: 'superintendent-areas', project: { status: 'ACTIVE', crewBuild: 'FULL' }, person: superintendent, snapshotToken: 'b'.repeat(32), assignments: page([{ assignmentId: id(50), areaId: id(24), areaName: 'Superintendent Individual Area', retired: false, depth: 0, parentId: null }]), departmentMembershipCount: 1, sharedDepartmentAssignmentCount: 2 };
    } },
  } as unknown as OrganizationReadRepositories;
  return { repos, scope, readCount: () => readCount, db: { query: async () => ({ rows: [] }) } as unknown as DbClient };
}

test('organization read reuses scoped existing Manager reads and keeps every relationship distinct', async () => {
  const f = fixture();
  const data = await readSurveyOrganization(f.repos, f.db, actor, auth);
  assert.equal(data.projectId, actor.projectId);
  assert.ok(f.scope.every(scope => JSON.stringify(scope) === JSON.stringify([actor.tenantId, actor.projectId])));
  assert.equal(data.staffing[0]!.reporting!.area.id, area.id);
  assert.equal(data.staffing[0]!.areas.data[0]!.id, id(23));
  assert.deepEqual(data.teams[0]!.areas?.map(value => value.id), [id(21), id(22)]);
  assert.equal(data.superintendentAreas[0]!.assignments[0]!.areaId, id(24));
  assert.equal(data.superintendentAreas[0]!.sharedDepartmentAssignmentCount, 2);
  assert.equal(JSON.stringify(data).includes('@example.invalid'), false, 'No email fields added to the chart contract');
  const people = organizationChartPeople(data);
  assert.equal(people.find(value => value.id === superintendent.userId)!.parentId, null, 'Manager reporting must not be invented');
  assert.equal(people.find(value => value.id === chief.userId)!.parentId, superintendent.userId);
  assert.equal(people.find(value => value.id === instrument.userId)!.parentId, chief.userId);
  assert.match(people.find(value => value.id === chief.userId)!.details.join(';'), /Distinct Named Team.*Team Area.*Additional Team Area.*Individual Chief Area \(retired\).*Reporting Area/);
});

test('team membership and overlapping Areas never create a reporting or roster edge', async () => {
  const f = fixture();
  const data = await readSurveyOrganization(f.repos, f.db, actor, auth);
  data.staffing[0]!.reporting = null;
  data.staffing[0]!.instrumentMen = [];
  const people = organizationChartPeople(data);
  assert.equal(people.find(value => value.id === chief.userId)!.parentId, null);
  assert.equal(people.find(value => value.id === instrument.userId)!.parentId, null);
  assert.match(people.find(value => value.id === instrument.userId)!.details.join(';'), /does not establish availability/);
});

test('inactive or changed-role retained links remain explicit evidence without false hierarchy nodes', async () => {
  const f = fixture();
  const data = await readSurveyOrganization(f.repos, f.db, actor, auth);
  data.staffing[0]!.reporting!.superintendent = { ...superintendent, active: false, role: 'REQUESTER' };
  data.staffing[0]!.instrumentMen.push({ userId: id(61), name: 'Former crew member', active: false, role: null });
  const people = organizationChartPeople(data);
  const node = people.find(value => value.id === chief.userId)!;
  assert.equal(node.parentId, null);
  assert.match(node.details.join(';'), /outside current Superintendent population/);
  assert.match(node.retainedCrew.join(';'), /Former crew member \(no project role, inactive access\)/);
  assert.equal(people.some(value => value.id === id(61)), false);
});

test('organization reads reject every non-Manager before repository reads', async () => {
  for (const actorRole of ['SURVEY_SUPERINTENDENT', 'PARTY_CHIEF', 'INSTRUMENT_MAN', 'REQUESTER', 'PROJECT_ADMIN', 'VIEWER'] as const) {
    const f = fixture();
    await assert.rejects(readSurveyOrganization(f.repos, f.db, { ...actor, actorRole }, auth), ForbiddenError);
    assert.equal(f.readCount(), 0);
  }
});

test('bounded reads collect all pages and refuse oversized or incomplete populations', async () => {
  const items = Array.from({ length: 101 }, (_, n) => n);
  const offsets: number[] = [];
  assert.deepEqual(await readOrganizationPages(async query => { offsets.push(query.offset); return { data: items.slice(query.offset, query.offset + 100), total: 101, offset: query.offset, limit: 100 }; }, 500, 'people'), items);
  assert.deepEqual(offsets, [0, 100]);
  for (const page of [{ data: [], total: 501, offset: 0, limit: 100 }, { data: [], total: 1, offset: 0, limit: 100 }, { data: [], total: 0, offset: 100, limit: 100 }]) {
    await assert.rejects(readOrganizationPages(async () => page, 500, 'people'), { name: 'ConflictError' });
  }
  const f = fixture();
  f.repos.staffing.readStaffing = async () => ({ ...staffing, areas: { ...staffing.areas, total: 101, truncated: true } });
  await assert.rejects(readSurveyOrganization(f.repos, f.db, actor, auth), { code: 'ORG_CHART_LIMIT' });
});

test('GET uses one read-only repeatable snapshot, revalidates auth, and returns private no-store', async () => {
  const f = fixture(), queries: string[] = [];
  let authCalls = 0;
  const deps: OrganizationReadDeps = { repos: f.repos, withTransaction: async fn => fn({ query: async (sql: string) => { queries.push(sql); return { rows: [] }; } } as unknown as DbClient),
    requireAuth: async () => { authCalls++; return auth; }, getProjectRole: async () => 'SURVEY_MANAGER' };
  const response = await handleGetSurveyOrganization(new NextRequest(`http://localhost/api/projects/${actor.projectId}/survey/organization`), { params: Promise.resolve({ projectId: actor.projectId }) }, deps);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(queries, ['SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY']);
  assert.equal(authCalls, 2);
  assert.equal((await response.json() as SurveyOrganization).projectId, actor.projectId);
});

test('GET rejects forged filters, stale auth and foreign project authority without hierarchy reads', async () => {
  const f = fixture();
  const deps: OrganizationReadDeps = { repos: f.repos, withTransaction: async fn => fn(f.db), requireAuth: async () => auth, getProjectRole: async () => { throw new ForbiddenError('Project membership required'); } };
  const ctx = { params: Promise.resolve({ projectId: actor.projectId }) };
  const req = (suffix = '') => new NextRequest(`http://localhost/api/projects/${actor.projectId}/survey/organization${suffix}`);
  assert.equal((await handleGetSurveyOrganization(req('?tenantId=' + id(90)), ctx, deps)).status, 400);
  assert.equal((await handleGetSurveyOrganization(req(), { params: Promise.resolve({ projectId: 'invalid' }) }, deps)).status, 400);
  assert.equal((await handleGetSurveyOrganization(req(), ctx, deps)).status, 403);
  let calls = 0;
  deps.requireAuth = async () => { if (++calls === 2) throw new UnauthorizedError('Session revoked'); return auth; };
  assert.equal((await handleGetSurveyOrganization(req(), ctx, deps)).status, 401);
  assert.equal(f.readCount(), 0);
});

test('an empty team coverage set and an out-of-population reporting subject are never inferred from legacy fields', async () => {
  const f = fixture();
  const data = await readSurveyOrganization(f.repos, f.db, actor, auth);
  data.teams[0]!.areas = [];
  data.personnel = data.personnel.filter(value => value.userId !== superintendent.userId);
  const people = organizationChartPeople(data);
  const node = people.find(value => value.id === chief.userId)!;
  assert.equal(node.parentId, null);
  assert.match(node.details.join(';'), /Team Areas: none recorded/);
  assert.equal(node.details.join(';').includes('Team Areas: Team Area'), false);
  assert.match(node.details.join(';'), /outside current Superintendent population/);
});
