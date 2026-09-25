import assert from 'node:assert/strict';
import test from 'node:test';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ITenancyRepository } from '@/modules/tenancy/application/ports';
import { createDepartment, listProjectDepartments } from '@/modules/tenancy/application/create-department';
import {
  addDepartmentMember, addDepartmentTitle, assignDepartmentTitle,
} from '@/modules/tenancy/application/manage-department';

const tenantId = '00000000-0000-0000-0000-000000000001' as UUID;
const projectId = '00000000-0000-0000-0000-000000000002' as UUID;
const actorId = '00000000-0000-0000-0000-000000000003' as UUID;
const nodeId = '00000000-0000-0000-0000-000000000004' as UUID;
const db: DbClient = { async query() { return { rows: [] }; } };
const base = {
  tenantId, projectId, actorId, actorRole: 'PROJECT_ADMIN' as const,
  name: 'Civil', managerTitle: 'Civil Manager', aorNodeIds: [nodeId],
};

test('department creation validates role, project, AOR scope, and input before writes', async () => {
  const writes: string[] = [];
  let projectStatus = 'SETUP';
  let nodeExists = true;
  const repo = {
    findProjectById: async () => ({ status: projectStatus }),
    findAorNodePlacement: async () => nodeExists ? { id: nodeId, depth: 0 } : null,
    saveDepartment: async () => { writes.push('department'); return true; },
  } as unknown as ITenancyRepository;
  await assert.rejects(createDepartment(repo, db, {
    ...base, actorRole: 'REQUESTER',
  }), ForbiddenError);
  projectStatus = 'ARCHIVED';
  await assert.rejects(createDepartment(repo, db, base), ConflictError);
  projectStatus = 'SETUP';
  nodeExists = false;
  await assert.rejects(createDepartment(repo, db, base), NotFoundError);
  nodeExists = true;
  await assert.rejects(createDepartment(repo, db, {
    ...base, aorNodeIds: [nodeId, nodeId],
  }), ValidationError);
  assert.deepEqual(writes, []);
});

test('department creation writes manager title and AOR assignment before event', async () => {
  const writes: string[] = [];
  const repo = {
    findProjectById: async () => ({ status: 'SETUP' }),
    findAorNodePlacement: async () => ({ id: nodeId, depth: 0 }),
    saveDepartment: async () => { writes.push('department'); return true; },
    saveDepartmentManagerTitle: async () => { writes.push('title'); },
    assignDepartmentAor: async () => { writes.push('AOR'); return true; },
    appendTenantEvent: async (_db: DbClient, _tenantId: UUID, _actorId: UUID,
      eventType: string, payload: Record<string, unknown>) => {
      assert.equal(eventType, 'department.created');
      assert.deepEqual(payload.aor_node_ids, [nodeId]);
      writes.push('event');
    },
  } as unknown as ITenancyRepository;
  const department = await createDepartment(repo, db, base);
  assert.equal(department.name, 'Civil');
  assert.equal(department.managerTitle, 'Civil Manager');
  assert.deepEqual(writes, ['department', 'title', 'AOR', 'event']);
});

test('department list requires project administrator and tenant-scoped project', async () => {
  const repo = {
    findProjectById: async (_db: DbClient, requestedTenantId: UUID) =>
      requestedTenantId === tenantId ? { status: 'ACTIVE' } : null,
    listDepartments: async () => [{ id: nodeId, name: 'Civil' }],
  } as unknown as ITenancyRepository;
  await assert.rejects(listProjectDepartments(repo, db, {
    tenantId, projectId, actorRole: 'REQUESTER',
  }), ForbiddenError);
  await assert.rejects(listProjectDepartments(repo, db, {
    tenantId: actorId, projectId, actorRole: 'PROJECT_ADMIN',
  }), NotFoundError);
  const departments = await listProjectDepartments(repo, db, {
    tenantId, projectId, actorRole: 'TENANT_ADMIN',
  });
  assert.equal(departments.length, 1);
});

test('free-agent onboarding enforces one department per project and audits the insert', async () => {
  const writes: string[] = [];
  let membershipExists = false;
  const repo = {
    findProjectById: async () => ({ status: 'ACTIVE' }),
    findDepartment: async () => ({ id: nodeId }),
    findDepartmentMembership: async () => membershipExists ? { departmentId: nodeId } : null,
    addDepartmentMember: async () => { writes.push('member'); return true; },
    appendTenantEvent: async () => { writes.push('event'); },
  } as unknown as ITenancyRepository;
  const params = { tenantId, projectId, departmentId: nodeId,
    actorId, actorRole: 'PROJECT_ADMIN' as const, userId: actorId };
  await assert.rejects(addDepartmentMember(repo, db, {
    ...params, actorRole: 'DEPARTMENT_MANAGER',
  }), ForbiddenError);
  membershipExists = true;
  await assert.rejects(addDepartmentMember(repo, db, params), ConflictError);
  membershipExists = false;
  await addDepartmentMember(repo, db, params);
  assert.deepEqual(writes, ['member', 'event']);
});

test('title catalog creation requires matching department management and audits the title', async () => {
  const writes: string[] = [];
  const repo = {
    findProjectById: async () => ({ status: 'ACTIVE' }),
    findDepartment: async () => ({ id: nodeId, managerTitle: 'Civil Manager' }),
    findDepartmentMembership: async () => ({ departmentId: nodeId, deactivatedAt: null }),
    addDepartmentTitle: async () => { writes.push('title'); return true; },
    appendTenantEvent: async () => { writes.push('event'); },
  } as unknown as ITenancyRepository;
  const params = { tenantId, projectId, departmentId: nodeId,
    actorId, actorRole: 'DEPARTMENT_MANAGER' as const,
    title: 'Civil Superintendent', defaultPriority: 'MED_HIGH' as const,
    assignmentLayer: 'MANAGER' as const };
  await assert.rejects(addDepartmentTitle(repo, db, {
    ...params, actorRole: 'DEPARTMENT_LEAD',
  }), ForbiddenError);
  const title = await addDepartmentTitle(repo, db, params);
  assert.equal(title.assignmentLayer, 'MANAGER');
  assert.deepEqual(writes, ['title', 'event']);
});

test('title assignment follows the three delegation layers', async () => {
  const departmentId = nodeId;
  const targetId = '00000000-0000-0000-0000-000000000005' as UUID;
  const writes: string[] = [];
  let titleName = 'Civil Manager';
  let titleLayer: 'MANAGER' | 'SUPERINTENDENT' = 'MANAGER';
  const repo = {
    findProjectById: async () => ({ status: 'ACTIVE' }),
    findDepartment: async () => ({ id: departmentId, managerTitle: 'Civil Manager' }),
    findDepartmentTitle: async () => ({ title: titleName, assignmentLayer: titleLayer }),
    findDepartmentMembership: async (_db: DbClient, _tenant: UUID,
      _project: UUID, userId: UUID) => ({
      departmentId, title: null, deactivatedAt: null,
      superintendentId: userId === targetId ? null : undefined,
    }),
    assignDepartmentTitle: async (_db: DbClient, _tenant: UUID,
      _project: UUID, _department: UUID, _user: UUID, _title: string,
      _actor: UUID, superintendentId: UUID | null) => {
      writes.push(superintendentId ?? 'none'); return true;
    },
    appendTenantEvent: async () => { writes.push('event'); },
  } as unknown as ITenancyRepository;
  const params = { tenantId, projectId, departmentId,
    actorId, userId: targetId, title: titleName };
  await assert.rejects(assignDepartmentTitle(repo, db, {
    ...params, actorRole: 'DEPARTMENT_MANAGER',
  }), ForbiddenError);
  await assignDepartmentTitle(repo, db, { ...params, actorRole: 'PROJECT_ADMIN' });
  titleName = 'Civil Superintendent';
  await assert.rejects(assignDepartmentTitle(repo, db, {
    ...params, title: titleName, actorRole: 'PROJECT_ADMIN',
  }), ForbiddenError);
  await assignDepartmentTitle(repo, db, {
    ...params, title: titleName, actorRole: 'DEPARTMENT_MANAGER',
  });
  titleName = 'Civil Engineer';
  titleLayer = 'SUPERINTENDENT';
  await assert.rejects(assignDepartmentTitle(repo, db, {
    ...params, title: titleName, actorRole: 'DEPARTMENT_MANAGER',
  }), ForbiddenError);
  await assignDepartmentTitle(repo, db, {
    ...params, title: titleName, actorRole: 'DEPARTMENT_LEAD',
  });
  assert.deepEqual(writes, ['none', 'event', 'none', 'event', actorId, 'event']);
});
