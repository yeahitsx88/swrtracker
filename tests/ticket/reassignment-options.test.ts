import assert from 'node:assert/strict';
import test from 'node:test';
import { getReassignmentCapability, getReassignmentOptions } from '@/modules/ticket/application/reassignment-options';
import type { ITicketRepository, VisibilityScope } from '@/modules/ticket/application/ports';
import type { Ticket } from '@/modules/ticket/domain/types';
import type { CandidateQuery, AssignmentCandidatesPort } from '@/modules/tenancy/application/assignment-candidates';
import type { DbClient, UUID } from '@/shared/types';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';

const id = '00000000-0000-0000-0000-000000000001' as UUID;
const other = '00000000-0000-0000-0000-000000000002' as UUID;
const db: DbClient = { async query() { throw new Error('Unexpected SQL'); } };
const ticket = { id, tenantId: id, projectId: id, companyId: id, aorNodeId: id,
  status: 'PENDING_PC_APPROVAL', assignedPartyChiefId: id } as Ticket;
const actor: VisibilityScope = { actorId: id, actorRole: 'SURVEY_MANAGER', companyId: id, companyType: 'GC' };
const params = { tenantId: id, ticketId: id, actor, role: 'PARTY_CHIEF' as const,
  search: ' Crew ', limit: 1, offset: 2 };
function setup() {
  const queries: CandidateQuery[] = [];
  const repo = { findById: async (_db: DbClient, tenant: UUID, ticketId: UUID, scope: VisibilityScope) => {
    assert.equal(ticketId, id); assert.ok(scope.actorId);
    return tenant === id ? ticket : null;
  }, findActiveProjectCrewBuild: async () => 'MEDIUM',
  isAorNodeInSurveyRoleScope: async () => true } as unknown as ITicketRepository;
  const candidates: AssignmentCandidatesPort = { async list(_db, query) {
    queries.push(query); return [{ id, name: 'Crew One' }, { id: other, name: 'Crew Two' }];
  } };
  return { repo, candidates, queries };
}

test('reassignment candidates preserve tenant/project scope, search and pagination', async () => {
  const { repo, candidates, queries } = setup();
  const result = await getReassignmentOptions(repo, candidates, db, params);
  assert.deepEqual(result, { crewBuild: 'MEDIUM', canChangePartyChief: true,
    instrumentManRequired: false, candidates: [{ id, name: 'Crew One' }], hasMore: true });
  assert.deepEqual(queries, [{ tenantId: id, projectId: id, role: 'PARTY_CHIEF',
    aorNodeId: null, search: 'Crew', limit: 2, offset: 2 }]);
  await assert.rejects(getReassignmentOptions(repo, candidates, db, { ...params, tenantId: other }), NotFoundError);
  repo.findById = async () => null;
  await assert.rejects(getReassignmentOptions(repo, candidates, db, params), NotFoundError);
  assert.equal(queries.length, 1);
});

test('Superintendent candidate lookup scopes chiefs to the ticket AOR but permits project IMs', async () => {
  const { repo, candidates, queries } = setup();
  const scoped = { ...params, actor: { ...actor, actorRole: 'SURVEY_SUPERINTENDENT' as const } };
  await getReassignmentOptions(repo, candidates, db, scoped);
  await getReassignmentOptions(repo, candidates, db, { ...scoped, role: 'INSTRUMENT_MAN' });
  assert.equal(queries[0]?.aorNodeId, id); assert.equal(queries[1]?.aorNodeId, null);
  repo.isAorNodeInSurveyRoleScope = async () => false;
  await assert.rejects(getReassignmentOptions(repo, candidates, db, scoped), ForbiddenError);
  assert.equal(queries.length, 2);
});

test('assigned Party Chief can choose project IMs only, and Slim exposes only required IM', async () => {
  const { repo, candidates, queries } = setup();
  const own = { ...params, actor: { ...actor, actorRole: 'PARTY_CHIEF' as const } };
  await assert.rejects(getReassignmentOptions(repo, candidates, db, own), ForbiddenError);
  const result = await getReassignmentOptions(repo, candidates, db, { ...own, role: 'INSTRUMENT_MAN' });
  assert.equal(result.canChangePartyChief, false); assert.equal(result.instrumentManRequired, true);
  assert.equal(queries[0]?.aorNodeId, null);
  await assert.rejects(getReassignmentOptions(repo, candidates, db,
    { ...own, role: 'INSTRUMENT_MAN', actor: { ...own.actor, actorId: other } }), ForbiddenError);
  repo.findActiveProjectCrewBuild = async () => 'SLIM';
  await assert.rejects(getReassignmentOptions(repo, candidates, db, params), ForbiddenError);
  assert.equal((await getReassignmentOptions(repo, candidates, db,
    { ...params, role: 'INSTRUMENT_MAN' })).instrumentManRequired, true);
});

test('capabilities hide forbidden states and roles while unexpected infrastructure errors propagate', async () => {
  const { repo, candidates } = setup();
  for (const status of ['ASSIGNED', 'IN_PROGRESS', 'PENDING_PC_APPROVAL', 'DELAYED'] as const) {
    assert.ok(await getReassignmentCapability(repo, db, { ...ticket, status }, actor));
  }
  for (const status of ['DRAFT', 'SUBMITTED', 'APPROVED', 'CREATED', 'REJECTED',
    'COMPLETED', 'SURVEY_CANCELED', 'FIELD_CANCELED', 'REQUESTER_CANCELED'] as const) {
    assert.equal(await getReassignmentCapability(repo, db, { ...ticket, status }, actor), null);
  }
  for (const actorRole of ['REQUESTER', 'INSTRUMENT_MAN', 'TENANT_ADMIN', 'PROJECT_ADMIN'] as const) {
    assert.equal(await getReassignmentCapability(repo, db, ticket, { ...actor, actorRole }), null);
  }
  assert.equal(await getReassignmentCapability(repo, db, ticket,
    { ...actor, companyType: 'SUBCONTRACTOR', companyId: other }), null);
  await assert.rejects(getReassignmentOptions(repo, candidates, db, { ...params, limit: NaN }), ValidationError);
  repo.findActiveProjectCrewBuild = async () => null;
  assert.equal(await getReassignmentCapability(repo, db, ticket, actor), null);
  await assert.rejects(getReassignmentOptions(repo, candidates, db, params), ConflictError);
  repo.findActiveProjectCrewBuild = async () => { throw new Error('offline'); };
  await assert.rejects(getReassignmentCapability(repo, db, ticket, actor), /offline/);
});
