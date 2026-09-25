import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { ConflictError, ForbiddenError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { Project } from '@/modules/tenancy/domain/types';
import type { ITenancyRepository } from '@/modules/tenancy/application/ports';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import {
  archiveProject, assessSurveyManagerRemoval, confirmActingGrant,
  designateActingSurveyManager, issueSurveyManagerVacancyGrant,
  revokeActingGrant,
} from '@/modules/tenancy/application/project-continuity';

const tenantId = '00000000-0000-0000-0000-000000000001' as UUID;
const projectId = '00000000-0000-0000-0000-000000000002' as UUID;
const actorId = '00000000-0000-0000-0000-000000000003' as UUID;
const userId = '00000000-0000-0000-0000-000000000004' as UUID;
const grantId = '00000000-0000-0000-0000-000000000005' as UUID;
const db: DbClient = { async query() { return { rows: [] }; } };

function project(status: Project['status'] = 'ACTIVE'): Project {
  return { id: projectId, tenantId, name: 'Project', status,
    crewBuild: 'FULL', templateId: null,
    activatedAt: new Date(), activatedBy: actorId,
    archivedAt: null, archivedBy: null, createdAt: new Date() };
}

const context = { tenantId, projectId, actorId, actorRole: 'PROJECT_ADMIN' as const };

test('designated Survey Manager requires an active eligible member and audits the change', async () => {
  const writes: string[] = [];
  let eligible = false;
  const repo = {
    lockProjectById: async () => project(),
    isEligibleActingDesignee: async () => eligible,
    findActingDesignee: async () => null,
    setActingDesignee: async () => { writes.push('designation'); },
    appendTenantEvent: async (_db: DbClient, _tenant: UUID, _actor: UUID,
      event: string) => { writes.push(event); },
  } as unknown as ITenancyRepository;
  await assert.rejects(designateActingSurveyManager(repo, db,
    { ...context, userId }), ConflictError);
  assert.deepEqual(writes, []);
  eligible = true;
  await designateActingSurveyManager(repo, db, { ...context, userId });
  assert.deepEqual(writes, ['designation', 'acting_designee.changed']);
  await assert.rejects(designateActingSurveyManager(repo, db,
    { ...context, actorRole: 'REQUESTER', userId }), ForbiddenError);
});

test('archival is tenant-admin only, requires ACTIVE, and records open count', async () => {
  const writes: string[] = [];
  let status: Project['status'] = 'ACTIVE';
  const repo = {
    lockProjectById: async () => project(status),
    archiveProject: async () => { writes.push('archive'); return 6; },
    appendTenantEvent: async (_db: DbClient, _tenant: UUID, _actor: UUID,
      event: string, payload: { openTicketCount: number }) => {
      assert.equal(payload.openTicketCount, 6);
      writes.push(event);
    },
  } as unknown as ITenancyRepository;
  await assert.rejects(archiveProject(repo, db, context), ForbiddenError);
  assert.deepEqual(writes, []);
  status = 'SETUP';
  await assert.rejects(archiveProject(repo, db,
    { ...context, actorRole: 'TENANT_ADMIN' }), ConflictError);
  status = 'ACTIVE';
  const count = await archiveProject(repo, db,
    { ...context, actorRole: 'TENANT_ADMIN' });
  assert.equal(count, 6);
  assert.deepEqual(writes, ['archive', 'project.archived']);
});

test('Survey Manager removal gate lists only uncovered active projects', async () => {
  const repo = {
    listSurveyManagerRemovalProjects: async () => [
      { id: projectId, name: 'Blocked', hasOtherManager: false, hasActingCoverage: false },
      { id: userId, name: 'Acting', hasOtherManager: false, hasActingCoverage: true },
      { id: actorId, name: 'Other Manager', hasOtherManager: true, hasActingCoverage: false },
    ],
  } as unknown as ITenancyRepository;
  const result = await assessSurveyManagerRemoval(repo, db, { tenantId, userId });
  assert.deepEqual(result.blockedProjects, [{ id: projectId, name: 'Blocked' }]);
  assert.deepEqual(result.coveredProjectIds, [userId]);
});

test('vacancy grant uses designated candidate, is scoped, and emits an event after insert', async () => {
  const writes: string[] = [];
  const repo = {
    lockProjectById: async () => project(),
    listActiveActingGrants: async () => [],
    findEligibleActingCandidate: async () => ({ userId, cascadeLevel: 0 }),
    issueActingGrant: async (_db: DbClient, grant: { userId: UUID; scope: unknown }) => {
      assert.equal(grant.userId, userId);
      assert.deepEqual(grant.scope, { actions: ['approve', 'reject', 'assign_crew',
        'manage_workflow'], projectId });
      writes.push('grant');
      return true;
    },
    appendTenantEvent: async (_db: DbClient, _tenant: UUID, _actor: UUID,
      event: string) => { writes.push(event); },
  } as unknown as ITenancyRepository;
  const grant = await issueSurveyManagerVacancyGrant(repo, db,
    { tenantId, projectId, vacatedUserId: actorId, actorId, reason: 'deactivated' });
  assert.equal(grant?.trigger, 'VACANCY');
  assert.deepEqual(writes, ['grant', 'acting_grant.issued']);
});

test('vacancy cascade emits critical event when no survey personnel remain', async () => {
  const writes: string[] = [];
  const repo = {
    lockProjectById: async () => project(),
    listActiveActingGrants: async () => [],
    findEligibleActingCandidate: async () => null,
    appendTenantEvent: async (_db: DbClient, _tenant: UUID, _actor: UUID,
      event: string) => { writes.push(event); },
  } as unknown as ITenancyRepository;
  const grant = await issueSurveyManagerVacancyGrant(repo, db,
    { tenantId, projectId, vacatedUserId: actorId, actorId, reason: 'removed' });
  assert.equal(grant, null);
  assert.deepEqual(writes, ['vacancy.no_survey_personnel']);
});

test('grant confirmation and revocation need active state and permanent replacement', async () => {
  const writes: string[] = [];
  let replacement = false;
  const grant = { id: grantId, userId, revokedAt: null, confirmedAt: null,
    role: 'SURVEY_MANAGER',
    scope: { projectId, actions: ['manage_workflow'] } };
  const repo = {
    lockProjectById: async () => project(),
    findActingGrant: async () => grant,
    listActiveActingGrants: async () => [grant],
    confirmActingGrant: async () => { writes.push('confirm'); return true; },
    revokeActingGrant: async () => { writes.push('revoke'); return true; },
    isActiveSurveyManager: async () => replacement,
    appendTenantEvent: async (_db: DbClient, _tenant: UUID, _actor: UUID,
      event: string) => { writes.push(event); },
  } as unknown as ITenancyRepository;
  await confirmActingGrant(repo, db, { ...context, grantId });
  await assert.rejects(revokeActingGrant(repo, db,
    { ...context, grantId, permanentReplacementId: actorId }), ConflictError);
  replacement = true;
  await revokeActingGrant(repo, db,
    { ...context, grantId, permanentReplacementId: actorId });
  assert.deepEqual(writes, ['confirm', 'acting_grant.confirmed',
    'revoke', 'acting_grant.revoked']);
});

test('PostgreSQL continuity designation, vacancy, confirmation, and archive are tenant scoped',
  { skip: !process.env.DATABASE_URL }, async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query('BEGIN');
    try {
      const t = randomUUID() as UUID;
      const p = randomUUID() as UUID;
      const c = randomUUID() as UUID;
      const admin = randomUUID() as UUID;
      const manager = randomUUID() as UUID;
      const chief = randomUUID() as UUID;
      const outsider = randomUUID() as UUID;
      await client.query('INSERT INTO tenants (id,name) VALUES ($1,$2)', [t, 'Continuity']);
      await client.query(
        "INSERT INTO companies (id,tenant_id,name,type) VALUES ($1,$2,'GC','GC')",
        [c, t]);
      await client.query(
        `INSERT INTO users (id,tenant_id,company_id,email,password_hash,name)
         VALUES ($1,$5,$6,'admin-continuity@example.com','fixture','Admin'),
                ($2,$5,$6,'manager-continuity@example.com','fixture','Manager'),
                ($3,$5,$6,'chief-continuity@example.com','fixture','Chief'),
                ($4,$5,$6,'outsider-continuity@example.com','fixture','Outsider')`,
        [admin, manager, chief, outsider, t, c]);
      await client.query(
        "INSERT INTO projects (id,tenant_id,name,status,crew_build) VALUES ($1,$2,'Continuity','ACTIVE','MEDIUM')",
        [p, t]);
      await client.query(
        `INSERT INTO project_memberships (project_id,user_id,role) VALUES
         ($1,$2,'PROJECT_ADMIN'),($1,$3,'SURVEY_MANAGER'),($1,$4,'PARTY_CHIEF')`,
        [p, admin, manager, chief]);
      const repo = new TenancyRepository();
      await assert.rejects(designateActingSurveyManager(repo, client,
        { tenantId: t, projectId: p, actorId: admin, actorRole: 'PROJECT_ADMIN',
          userId: outsider }), ConflictError);
      await designateActingSurveyManager(repo, client,
        { tenantId: t, projectId: p, actorId: admin, actorRole: 'PROJECT_ADMIN',
          userId: chief });
      const assessed = await assessSurveyManagerRemoval(repo, client,
        { tenantId: t, userId: manager });
      assert.deepEqual(assessed.coveredProjectIds, [p]);
      assert.deepEqual(assessed.blockedProjects, []);
      await client.query('UPDATE users SET deactivated_at=NOW() WHERE id=$1 AND tenant_id=$2',
        [manager, t]);
      const grant = await issueSurveyManagerVacancyGrant(repo, client,
        { tenantId: t, projectId: p, vacatedUserId: manager,
          actorId: admin, reason: 'Manager deactivated' });
      assert.equal(grant?.userId, chief);
      assert.equal(grant?.cascadeLevel, 0);
      await confirmActingGrant(repo, client,
        { tenantId: t, projectId: p, actorId: admin, actorRole: 'PROJECT_ADMIN',
          grantId: grant!.id });
      await client.query(
        "UPDATE project_memberships SET role='SURVEY_MANAGER' WHERE project_id=$1 AND user_id=$2",
        [p, chief]);
      await revokeActingGrant(repo, client,
        { tenantId: t, projectId: p, actorId: admin, actorRole: 'PROJECT_ADMIN',
          grantId: grant!.id, permanentReplacementId: chief });
      const openTicketCount = await archiveProject(repo, client,
        { tenantId: t, projectId: p, actorId: admin, actorRole: 'TENANT_ADMIN' });
      assert.equal(openTicketCount, 0);
      const { rows } = await client.query<{ event_type: string }>(
        'SELECT event_type FROM tenant_events WHERE tenant_id=$1', [t]);
      assert.deepEqual(rows.map((r) => r.event_type).sort(), [
        'acting_designee.changed', 'acting_grant.issued',
        'acting_grant.confirmed', 'acting_grant.revoked', 'project.archived',
      ].sort());
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });
