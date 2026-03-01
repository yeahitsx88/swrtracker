import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import { after, beforeEach, test } from 'node:test';
import type { UUID } from '@/shared/types';
import { resolveVisibility } from '@/lib/resolve-visibility';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import {
  addProjectMembership,
  createArea,
  createCompany,
  createProject,
  createSubarea,
  createTenant,
  createTicket,
  createUser,
} from '../setup/fixtures';
import { closeTestPool, query } from '../setup/db';
import { resetDatabase } from '../setup/migrate';

const repo = new TicketRepository();

async function seedVisibilityScenario() {
  const tenant = await createTenant();
  const project = await createProject({ tenantId: tenant.id });
  const gcCompany = await createCompany({ tenantId: tenant.id, name: 'GC', type: 'GC' });
  const subCompany = await createCompany({
    tenantId: tenant.id,
    name: 'Subcontractor',
    type: 'SUBCONTRACTOR',
  });

  const requester = await createUser({
    tenantId: tenant.id,
    companyId: gcCompany.id,
    email: 'requester@example.com',
    name: 'Requester',
  });
  const otherRequester = await createUser({
    tenantId: tenant.id,
    companyId: gcCompany.id,
    email: 'other-requester@example.com',
    name: 'Other Requester',
  });
  const partyChief = await createUser({
    tenantId: tenant.id,
    companyId: gcCompany.id,
    email: 'pc@example.com',
    name: 'Party Chief',
  });
  const instrumentMan = await createUser({
    tenantId: tenant.id,
    companyId: gcCompany.id,
    email: 'im@example.com',
    name: 'Instrument Man',
  });
  const approver = await createUser({
    tenantId: tenant.id,
    companyId: gcCompany.id,
    email: 'approver@example.com',
    name: 'Approver',
  });
  const areaViewer = await createUser({
    tenantId: tenant.id,
    companyId: gcCompany.id,
    email: 'viewer@example.com',
    name: 'Area Viewer',
  });
  const subcontractorRequester = await createUser({
    tenantId: tenant.id,
    companyId: subCompany.id,
    email: 'sub@example.com',
    name: 'Subcontractor Requester',
  });

  await addProjectMembership({ projectId: project.id, userId: requester.id, role: 'REQUESTER' });
  await addProjectMembership({ projectId: project.id, userId: otherRequester.id, role: 'REQUESTER' });
  await addProjectMembership({ projectId: project.id, userId: partyChief.id, role: 'PARTY_CHIEF' });
  await addProjectMembership({ projectId: project.id, userId: instrumentMan.id, role: 'INSTRUMENT_MAN' });
  await addProjectMembership({ projectId: project.id, userId: approver.id, role: 'APPROVER' });
  await addProjectMembership({ projectId: project.id, userId: areaViewer.id, role: 'AREA_VIEWER' });
  await addProjectMembership({
    projectId: project.id,
    userId: subcontractorRequester.id,
    role: 'REQUESTER',
  });

  const areaOne = await createArea({ tenantId: tenant.id, projectId: project.id, name: 'Unit 1', code: 'U1' });
  const areaTwo = await createArea({ tenantId: tenant.id, projectId: project.id, name: 'Unit 2', code: 'U2' });
  const subareaOne = await createSubarea({
    tenantId: tenant.id,
    projectId: project.id,
    areaId: areaOne.id,
    name: 'U1-A',
  });
  const subareaTwo = await createSubarea({
    tenantId: tenant.id,
    projectId: project.id,
    areaId: areaTwo.id,
    name: 'U2-A',
  });

  await query(
    `INSERT INTO crew_rosters (id, project_id, tenant_id, party_chief_id, instrument_man_id, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [randomUUID(), project.id, tenant.id, partyChief.id, instrumentMan.id],
  );

  await query(
    `INSERT INTO area_memberships (id, project_id, user_id, area_id, created_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [randomUUID(), project.id, areaViewer.id, areaOne.id],
  );

  const requesterTicket = await createTicket({
    tenantId: tenant.id,
    projectId: project.id,
    areaId: areaOne.id,
    subareaId: subareaOne.id,
    companyId: gcCompany.id,
    requesterId: requester.id,
    ticketNumber: 'FSS-U1-00001',
    status: 'SUBMITTED',
  });
  const otherRequesterTicket = await createTicket({
    tenantId: tenant.id,
    projectId: project.id,
    areaId: areaTwo.id,
    subareaId: subareaTwo.id,
    companyId: gcCompany.id,
    requesterId: otherRequester.id,
    ticketNumber: 'FSS-U2-00002',
    status: 'SUBMITTED',
  });
  const assignedCrewTicket = await createTicket({
    tenantId: tenant.id,
    projectId: project.id,
    areaId: areaOne.id,
    subareaId: subareaOne.id,
    companyId: gcCompany.id,
    requesterId: requester.id,
    ticketNumber: 'FSS-U1-00003',
    workflowVariant: 'DIRECT_ASSIGNMENT',
    status: 'ASSIGNED',
    assignedPartyChiefId: partyChief.id,
    assignedInstrumentManId: instrumentMan.id,
  });
  const subcontractorTicket = await createTicket({
    tenantId: tenant.id,
    projectId: project.id,
    areaId: areaOne.id,
    subareaId: subareaOne.id,
    companyId: subCompany.id,
    requesterId: subcontractorRequester.id,
    ticketNumber: 'FSS-U1-00004',
    status: 'SUBMITTED',
  });

  return {
    tenant,
    project,
    users: {
      requester,
      otherRequester,
      partyChief,
      instrumentMan,
      approver,
      areaViewer,
      subcontractorRequester,
    },
    tickets: {
      requesterTicket,
      otherRequesterTicket,
      assignedCrewTicket,
      subcontractorTicket,
    },
  };
}

async function listVisibleTicketIds(params: {
  tenantId: UUID;
  projectId: UUID;
  actorId: UUID;
  actorRole: 'REQUESTER' | 'PARTY_CHIEF' | 'INSTRUMENT_MAN' | 'APPROVER' | 'AREA_VIEWER';
}) {
  const visibility = await resolveVisibility(
    { query },
    params.tenantId,
    params.projectId,
    params.actorId,
    params.actorRole,
  );

  const page = await repo.list({ query }, params.tenantId, {
    projectId: params.projectId,
    visibility,
    limit: 50,
    offset: 0,
  });

  return page.data.map((ticket) => ticket.id);
}

beforeEach(async () => {
  await resetDatabase();
});

after(async () => {
  await closeTestPool();
});

test('requester sees only their own tickets', async () => {
  const seeded = await seedVisibilityScenario();

  const visibleIds = await listVisibleTicketIds({
    tenantId: seeded.tenant.id,
    projectId: seeded.project.id,
    actorId: seeded.users.requester.id,
    actorRole: 'REQUESTER',
  });

  assert.deepEqual(
    visibleIds.sort(),
    [seeded.tickets.assignedCrewTicket.id, seeded.tickets.requesterTicket.id].sort(),
  );
});

test('party chief sees tickets assigned to them', async () => {
  const seeded = await seedVisibilityScenario();

  const visibleIds = await listVisibleTicketIds({
    tenantId: seeded.tenant.id,
    projectId: seeded.project.id,
    actorId: seeded.users.partyChief.id,
    actorRole: 'PARTY_CHIEF',
  });

  assert.deepEqual(visibleIds, [seeded.tickets.assignedCrewTicket.id]);
});

test('instrument man sees party chief tickets and explicit assignments', async () => {
  const seeded = await seedVisibilityScenario();

  const visibleIds = await listVisibleTicketIds({
    tenantId: seeded.tenant.id,
    projectId: seeded.project.id,
    actorId: seeded.users.instrumentMan.id,
    actorRole: 'INSTRUMENT_MAN',
  });

  assert.deepEqual(visibleIds, [seeded.tickets.assignedCrewTicket.id]);
});

test('area viewer sees only tickets in assigned areas', async () => {
  const seeded = await seedVisibilityScenario();

  const visibleIds = await listVisibleTicketIds({
    tenantId: seeded.tenant.id,
    projectId: seeded.project.id,
    actorId: seeded.users.areaViewer.id,
    actorRole: 'AREA_VIEWER',
  });

  assert.deepEqual(
    visibleIds.sort(),
    [
      seeded.tickets.assignedCrewTicket.id,
      seeded.tickets.requesterTicket.id,
      seeded.tickets.subcontractorTicket.id,
    ].sort(),
  );
});

test('approver sees all project tickets', async () => {
  const seeded = await seedVisibilityScenario();

  const visibleIds = await listVisibleTicketIds({
    tenantId: seeded.tenant.id,
    projectId: seeded.project.id,
    actorId: seeded.users.approver.id,
    actorRole: 'APPROVER',
  });

  assert.deepEqual(
    visibleIds.sort(),
    [
      seeded.tickets.assignedCrewTicket.id,
      seeded.tickets.otherRequesterTicket.id,
      seeded.tickets.requesterTicket.id,
      seeded.tickets.subcontractorTicket.id,
    ].sort(),
  );
});

test('findById returns null when ticket is outside visibility scope', async () => {
  const seeded = await seedVisibilityScenario();
  const visibility = await resolveVisibility(
    { query },
    seeded.tenant.id,
    seeded.project.id,
    seeded.users.requester.id,
    'REQUESTER',
  );

  const ticket = await repo.findById(
    { query },
    seeded.tenant.id,
    seeded.tickets.otherRequesterTicket.id,
    visibility,
  );

  assert.equal(ticket, null);
});
