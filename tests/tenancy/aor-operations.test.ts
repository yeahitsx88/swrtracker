import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Client } from 'pg';
import { ConflictError, ForbiddenError, NotFoundError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { Project } from '@/modules/tenancy/domain/types';
import type { ITenancyRepository } from '@/modules/tenancy/application/ports';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import {
  assignAorScope, deactivateCrewRoster, moveAorAssignment,
  retireAorNode, setCrewRoster,
} from '@/modules/tenancy/application/aor-operations';

const id = () => randomUUID() as UUID;
const tenantId = id();
const projectId = id();
const actorId = id();
const nodeId = id();
const partyChiefId = id();
const instrumentManId = id();
const db: DbClient = { async query() { return { rows: [] }; } };

function project(status: Project['status'] = 'ACTIVE'): Project {
  return { id: projectId, tenantId, name: 'Project', status,
    crewBuild: 'FULL', templateId: null,
    activatedAt: new Date(), activatedBy: actorId,
    archivedAt: null, archivedBy: null, createdAt: new Date() };
}

test('AOR retirement rejects active dependencies and records successful retirement', async () => {
  const writes: string[] = [];
  let canRetire = false;
  const repo = {
    lockProjectById: async () => project(),
    findAorNodeForOperation: async () => ({ id: nodeId, code: 'U1', retiredAt: null }),
    retireAorNode: async () => { writes.push('retire'); return canRetire; },
    appendTenantEvent: async (_db: DbClient, _tenant: UUID, _actor: UUID,
      event: string) => { writes.push(event); },
  } as unknown as ITenancyRepository;
  const params = { tenantId, projectId, actorId,
    actorRole: 'PROJECT_ADMIN' as const, nodeId };
  await assert.rejects(retireAorNode(repo, db,
    { ...params, actorRole: 'REQUESTER' }), ForbiddenError);
  await assert.rejects(retireAorNode(repo, db, params), ConflictError);
  assert.deepEqual(writes, ['retire']);
  canRetire = true;
  await retireAorNode(repo, db, params);
  assert.deepEqual(writes, ['retire', 'retire', 'aor.node_retired']);
});

test('AOR assignment checks role and Superintendent scope before writing', async () => {
  let assigned = false;
  let inScope = false;
  const repo = {
    lockProjectById: async () => project(),
    findAorNodeForOperation: async () => ({ id: nodeId, code: 'U1', retiredAt: null }),
    findEligibleAorUserRole: async () => 'PARTY_CHIEF',
    isActiveProjectDepartment: async () => true,
    isNodeWithinActorScope: async () => inScope,
    assignAorScope: async () => { assigned = true; return id(); },
    appendTenantEvent: async () => {},
  } as unknown as ITenancyRepository;
  const params = { tenantId, projectId, actorId,
    actorRole: 'SURVEY_SUPERINTENDENT' as const,
    nodeId, userId: partyChiefId, departmentId: null };
  await assert.rejects(assignAorScope(repo, db, params), ForbiddenError);
  assert.equal(assigned, false);
  inScope = true;
  await assignAorScope(repo, db, params);
  assert.equal(assigned, true);
  await assert.rejects(assignAorScope(repo, db,
    { ...params, userId: null, departmentId: id() }), ForbiddenError);
});

test('roster changes require assigned Chief under Superintendent scope', async () => {
  const writes: string[] = [];
  let scoped = false;
  const repo = {
    lockProjectById: async () => project(),
    canSuperintendentManagePartyChief: async () => scoped,
    findCrewRoster: async () => null,
    saveCrewRoster: async () => { writes.push('roster'); return id(); },
    appendTenantEvent: async (_db: DbClient, _tenant: UUID, _actor: UUID,
      event: string) => { writes.push(event); },
  } as unknown as ITenancyRepository;
  const params = { tenantId, projectId, actorId,
    actorRole: 'SURVEY_SUPERINTENDENT' as const,
    partyChiefId, instrumentManId };
  await assert.rejects(setCrewRoster(repo, db, params), ForbiddenError);
  assert.deepEqual(writes, []);
  scoped = true;
  await setCrewRoster(repo, db, params);
  assert.deepEqual(writes, ['roster', 'crew.roster_changed']);
});

test('archived project rejects AOR and roster writes', async () => {
  const repo = {
    lockProjectById: async () => project('ARCHIVED'),
  } as unknown as ITenancyRepository;
  await assert.rejects(retireAorNode(repo, db, {
    tenantId, projectId, actorId, actorRole: 'PROJECT_ADMIN', nodeId,
  }), ConflictError);
  await assert.rejects(setCrewRoster(repo, db, {
    tenantId, projectId, actorId, actorRole: 'SURVEY_MANAGER',
    partyChiefId, instrumentManId,
  }), ConflictError);
});

test('PostgreSQL AOR and roster operations preserve scope and audit writes',
  { skip: !process.env.DATABASE_URL }, async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query('BEGIN');
    try {
      const t = id(); const p = id(); const c = id();
      const admin = id(); const manager = id(); const superintendent = id();
      const chief = id(); const instrument = id(); const department = id();
      const level = id(); const root = id(); const child = id(); const other = id();
      await client.query('INSERT INTO tenants (id,name) VALUES ($1,$2)', [t, 'AOR operations']);
      await client.query(
        "INSERT INTO companies (id,tenant_id,name,type) VALUES ($1,$2,'GC','GC')",
        [c, t]);
      await client.query(
        `INSERT INTO users (id,tenant_id,company_id,email,password_hash,name) VALUES
         ($1,$6,$7,'aor-admin@example.com','fixture','Admin'),
         ($2,$6,$7,'aor-manager@example.com','fixture','Manager'),
         ($3,$6,$7,'aor-super@example.com','fixture','Super'),
         ($4,$6,$7,'aor-chief@example.com','fixture','Chief'),
         ($5,$6,$7,'aor-im@example.com','fixture','Instrument')`,
        [admin, manager, superintendent, chief, instrument, t, c]);
      await client.query(
        "INSERT INTO projects (id,tenant_id,name,status,crew_build) VALUES ($1,$2,'AOR','ACTIVE','FULL')",
        [p, t]);
      await client.query(
        `INSERT INTO project_memberships (project_id,user_id,role) VALUES
         ($1,$2,'PROJECT_ADMIN'),($1,$3,'SURVEY_MANAGER'),
         ($1,$4,'SURVEY_SUPERINTENDENT'),($1,$5,'PARTY_CHIEF'),
         ($1,$6,'INSTRUMENT_MAN')`,
        [p, admin, manager, superintendent, chief, instrument]);
      await client.query(
        "INSERT INTO aor_levels (id,project_id,tenant_id,depth,label) VALUES ($1,$2,$3,0,'AREA')",
        [level, p, t]);
      await client.query(
        `INSERT INTO aor_nodes (id,project_id,tenant_id,level_id,parent_id,name,code)
         VALUES ($1,$4,$5,$6,NULL,'Root','R1'),
                ($2,$4,$5,$6,$1,'Child','C1'),
                ($3,$4,$5,$6,NULL,'Other','O1')`,
        [root, child, other, p, t, level]);
      await client.query(
        `INSERT INTO departments (id,project_id,tenant_id,name,manager_title,created_by)
         VALUES ($1,$2,$3,'Civil','Civil Manager',$4)`, [department, p, t, admin]);
      const repo = new TenancyRepository();
      const adminContext = { tenantId: t, projectId: p, actorId: admin,
        actorRole: 'PROJECT_ADMIN' as const };
      const managerContext = { tenantId: t, projectId: p, actorId: manager,
        actorRole: 'SURVEY_MANAGER' as const };
      const superContext = { tenantId: t, projectId: p, actorId: superintendent,
        actorRole: 'SURVEY_SUPERINTENDENT' as const };
      const superAssignment = await assignAorScope(repo, client,
        { ...managerContext, nodeId: root, userId: superintendent, departmentId: null });
      await assert.rejects(assignAorScope(repo, client,
        { ...managerContext, tenantId: id(), nodeId: root,
          userId: superintendent, departmentId: null }), NotFoundError);
      const chiefAssignment = await assignAorScope(repo, client,
        { ...superContext, nodeId: child, userId: chief, departmentId: null });
      const deptAssignment = await assignAorScope(repo, client,
        { ...adminContext, nodeId: root, userId: null, departmentId: department });
      assert.ok(superAssignment && chiefAssignment && deptAssignment);
      await assert.rejects(assignAorScope(repo, client,
        { ...superContext, nodeId: other, userId: chief, departmentId: null }),
      ForbiddenError);
      const rosterId = await setCrewRoster(repo, client,
        { ...superContext, partyChiefId: chief, instrumentManId: instrument });
      assert.ok(rosterId);
      await deactivateCrewRoster(repo, client,
        { ...superContext, instrumentManId: instrument });
      await setCrewRoster(repo, client,
        { ...superContext, partyChiefId: chief, instrumentManId: instrument });
      await assert.rejects(retireAorNode(repo, client,
        { ...adminContext, nodeId: root }), ConflictError);
      await moveAorAssignment(repo, client,
        { ...managerContext, assignmentId: chiefAssignment, nodeId: other });
      await retireAorNode(repo, client, { ...adminContext, nodeId: child });
      const { rows } = await client.query<{ retired_at: Date | null }>(
        'SELECT retired_at FROM aor_nodes WHERE id=$1 AND tenant_id=$2', [child, t]);
      assert.ok(rows[0]?.retired_at);
      const { rows: events } = await client.query<{ event_type: string }>(
        'SELECT event_type FROM tenant_events WHERE tenant_id=$1', [t]);
      assert.ok(events.some((e) => e.event_type === 'aor.node_retired'));
      assert.equal(events.filter((e) => e.event_type === 'crew.roster_changed').length, 3);
      assert.ok(events.some((e) => e.event_type === 'department.aor_assigned'));
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });
