import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Client } from 'pg';
import { ConflictError, ForbiddenError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ITenancyRepository } from '@/modules/tenancy/application/ports';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import { createDepartment } from '@/modules/tenancy/application/create-department';
import {
  addDepartmentMember, addDepartmentTitle, assignDepartmentTitle,
} from '@/modules/tenancy/application/manage-department';
import {
  assignMissingDepartmentManager, reassignDepartmentAor,
  reassignDepartmentTitle, removeDepartmentMember,
  updateDepartmentCatalogTitle,
} from '@/modules/tenancy/application/department-operations';

const id = () => randomUUID() as UUID;
const tenantId = id(); const projectId = id(); const departmentId = id();
const actorId = id(); const userId = id();
const db: DbClient = { async query() { return { rows: [] }; } };
const context = { tenantId, projectId, departmentId,
  actorId, actorRole: 'PROJECT_ADMIN' as const };
const department = { id: departmentId, tenantId, projectId,
  name: 'Civil', managerTitle: 'Civil Manager',
  createdBy: actorId, createdAt: new Date() };

test('titled member removal requires reason and a replacement Manager', async () => {
  const writes: string[] = [];
  let count = 1;
  const repo = {
    lockProjectById: async () => ({ status: 'ACTIVE' }),
    findDepartment: async () => department,
    findDepartmentMembership: async () => ({
      departmentId, title: 'Civil Manager', deactivatedAt: null,
    }),
    countActiveDepartmentManagers: async () => count,
    removeDepartmentMember: async () => { writes.push('remove'); return true; },
    appendTenantEvent: async () => { writes.push('event'); },
  } as unknown as ITenancyRepository;
  await assert.rejects(removeDepartmentMember(repo, db,
    { ...context, userId, reason: '' }), ValidationError);
  await assert.rejects(removeDepartmentMember(repo, db,
    { ...context, userId, reason: 'replacement arranged' }), ConflictError);
  count = 2;
  await removeDepartmentMember(repo, db,
    { ...context, userId, reason: 'replacement arranged' });
  assert.deepEqual(writes, ['remove', 'event']);
});

test('catalog edit records previous priority and updates member titles before event', async () => {
  const writes: string[] = [];
  const repo = {
    lockProjectById: async () => ({ status: 'ACTIVE' }),
    findDepartment: async () => department,
    findDepartmentTitle: async (_db: DbClient, _tenant: UUID,
      _department: UUID, title: string) => title === 'Engineer'
      ? { title, defaultPriority: 'NORMAL', assignmentLayer: 'MANAGER' } : null,
    updateDepartmentTitleCatalog: async () => { writes.push('catalog'); return true; },
    renameDepartmentMemberTitles: async () => { writes.push('members'); },
    appendTenantEvent: async () => { writes.push('event'); },
  } as unknown as ITenancyRepository;
  await updateDepartmentCatalogTitle(repo, db,
    { ...context, oldTitle: 'Engineer', title: 'Field Engineer',
      defaultPriority: 'MED_HIGH', assignmentLayer: 'MANAGER' });
  assert.deepEqual(writes, ['catalog', 'members', 'event']);
});

test('title reassignment follows delegation role and blocks last Manager removal', async () => {
  let count = 1;
  let reassigned = false;
  const repo = {
    lockProjectById: async () => ({ status: 'ACTIVE' }),
    findDepartment: async () => department,
    findDepartmentMembership: async () => ({
      departmentId, title: 'Civil Manager', deactivatedAt: null,
    }),
    findDepartmentTitle: async () => ({
      title: 'Engineer', assignmentLayer: 'MANAGER',
    }),
    countActiveDepartmentManagers: async () => count,
    reassignDepartmentTitle: async () => { reassigned = true; return true; },
    appendTenantEvent: async () => {},
  } as unknown as ITenancyRepository;
  await assert.rejects(reassignDepartmentTitle(repo, db,
    { ...context, actorRole: 'REQUESTER', userId, title: 'Engineer' }), ForbiddenError);
  await assert.rejects(reassignDepartmentTitle(repo, db,
    { ...context, actorRole: 'DEPARTMENT_MANAGER', userId, title: 'Engineer' }), ForbiddenError);
  await assert.rejects(reassignDepartmentTitle(repo, db,
    { ...context, userId, title: 'Engineer' }), ConflictError);
  count = 2;
  await reassignDepartmentTitle(repo, db,
    { ...context, userId, title: 'Engineer' });
  assert.equal(reassigned, true);
});

test('assigning a missing Manager rejects departments that already have one', async () => {
  const repo = {
    lockProjectById: async () => ({ status: 'ACTIVE' }),
    findDepartment: async () => department,
    countActiveDepartmentManagers: async () => 1,
  } as unknown as ITenancyRepository;
  await assert.rejects(assignMissingDepartmentManager(repo, db,
    { ...context, userId }), ConflictError);
});

test('PostgreSQL department lifecycle keeps title, member, AOR, and audit atomic',
  { skip: !process.env.DATABASE_URL }, async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query('BEGIN');
    try {
      const t = id(); const p = id(); const c = id();
      const admin = id(); const manager = id(); const worker = id();
      const level = id(); const node1 = id(); const node2 = id();
      await client.query('INSERT INTO tenants (id,name) VALUES ($1,$2)', [t, 'Dept lifecycle']);
      await client.query(
        "INSERT INTO companies (id,tenant_id,name,type) VALUES ($1,$2,'GC','GC')",
        [c, t]);
      await client.query(
        `INSERT INTO users (id,tenant_id,company_id,email,password_hash,name) VALUES
         ($1,$4,$5,'dept-op-admin@example.com','fixture','Admin'),
         ($2,$4,$5,'dept-op-manager@example.com','fixture','Manager'),
         ($3,$4,$5,'dept-op-worker@example.com','fixture','Worker')`,
        [admin, manager, worker, t, c]);
      await client.query(
        "INSERT INTO projects (id,tenant_id,name,status,crew_build) VALUES ($1,$2,'Dept','ACTIVE','MEDIUM')",
        [p, t]);
      await client.query(
        `INSERT INTO project_memberships (project_id,user_id,role) VALUES
         ($1,$2,'PROJECT_ADMIN'),($1,$3,'DEPARTMENT_MANAGER'),($1,$4,'REQUESTER')`,
        [p, admin, manager, worker]);
      await client.query(
        "INSERT INTO aor_levels (id,project_id,tenant_id,depth,label) VALUES ($1,$2,$3,0,'AREA')",
        [level, p, t]);
      await client.query(
        `INSERT INTO aor_nodes (id,project_id,tenant_id,level_id,name,code)
         VALUES ($1,$3,$4,$5,'One','ONE'),($2,$3,$4,$5,'Two','TWO')`,
        [node1, node2, p, t, level]);
      const repo = new TenancyRepository();
      const dept = await createDepartment(repo, client,
        { tenantId: t, projectId: p, actorId: admin,
          actorRole: 'PROJECT_ADMIN', name: 'Civil',
          managerTitle: 'Civil Manager', aorNodeIds: [node1] });
      for (const userId of [manager, worker]) {
        await addDepartmentMember(repo, client,
          { tenantId: t, projectId: p, departmentId: dept.id,
            actorId: admin, actorRole: 'PROJECT_ADMIN', userId });
      }
      await assignMissingDepartmentManager(repo, client,
        { tenantId: t, projectId: p, departmentId: dept.id,
          actorId: admin, actorRole: 'PROJECT_ADMIN', userId: manager });
      await addDepartmentTitle(repo, client,
        { tenantId: t, projectId: p, departmentId: dept.id,
          actorId: manager, actorRole: 'DEPARTMENT_MANAGER',
          title: 'Engineer', defaultPriority: 'NORMAL',
          assignmentLayer: 'MANAGER' });
      await assignDepartmentTitle(repo, client,
        { tenantId: t, projectId: p, departmentId: dept.id,
          actorId: manager, actorRole: 'DEPARTMENT_MANAGER',
          userId: worker, title: 'Engineer' });
      await updateDepartmentCatalogTitle(repo, client,
        { tenantId: t, projectId: p, departmentId: dept.id,
          actorId: manager, actorRole: 'DEPARTMENT_MANAGER',
          oldTitle: 'Engineer', title: 'Field Engineer',
          defaultPriority: 'MED_HIGH', assignmentLayer: 'MANAGER' });
      const { rows: memberRows } = await client.query<{ title: string }>(
        `SELECT title FROM department_memberships
         WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3`,
        [t, p, worker]);
      assert.equal(memberRows[0]?.title, 'Field Engineer');
      await assert.rejects(removeDepartmentMember(repo, client,
        { tenantId: t, projectId: p, departmentId: dept.id,
          actorId: admin, actorRole: 'PROJECT_ADMIN',
          userId: manager, reason: 'replacement pending' }), ConflictError);
      const { rows: assignments } = await client.query<{ id: UUID }>(
        `SELECT id FROM aor_assignments WHERE tenant_id=$1 AND project_id=$2
         AND department_id=$3`, [t, p, dept.id]);
      await reassignDepartmentAor(repo, client,
        { tenantId: t, projectId: p, departmentId: dept.id,
          actorId: admin, actorRole: 'PROJECT_ADMIN',
          assignmentId: assignments[0]!.id, nodeId: node2 });
      await removeDepartmentMember(repo, client,
        { tenantId: t, projectId: p, departmentId: dept.id,
          actorId: admin, actorRole: 'PROJECT_ADMIN',
          userId: worker, reason: 'Transferred' });
      const { rows: removed } = await client.query<{ count: string }>(
        `SELECT count(*) AS count FROM department_memberships
         WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3`, [t, p, worker]);
      assert.equal(Number(removed[0]?.count), 0);
      const { rows: events } = await client.query<{ event_type: string }>(
        'SELECT event_type FROM tenant_events WHERE tenant_id=$1', [t]);
      assert.ok(events.some((e) => e.event_type === 'department.title_catalog_updated'));
      assert.ok(events.some((e) => e.event_type === 'department.aor_assigned'));
      assert.ok(events.some((e) => e.event_type === 'department.member_removed'));
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });
