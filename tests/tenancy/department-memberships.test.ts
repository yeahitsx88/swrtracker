import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { ConflictError, ForbiddenError } from '@/shared/errors';
import { addDepartmentMember } from '@/modules/tenancy/application/add-department-member';
import { assignDepartmentTitle } from '@/modules/tenancy/application/assign-department-title';
import { reassignDepartmentMember } from '@/modules/tenancy/application/reassign-department-member';
import {
  handlePatchDepartmentMembers,
  handlePostDepartmentMembers,
  type DepartmentMembersRouteDeps,
} from '@/app/api/projects/[projectId]/departments/[departmentId]/members/handler';
import type { ITenancyRepository } from '@/modules/tenancy/application/ports';
import type {
  AorAssignment,
  AorLevel,
  AorNode,
  Area,
  Department,
  DepartmentMembership,
  DepartmentTitle,
  PriorityWhitelistEntry,
  Project,
  ProjectTemplate,
  Subarea,
  TenantMembership,
} from '@/modules/tenancy/domain/types';
import type { DbClient, UUID } from '@/shared/types';

const tenantId = 'tenant-1' as UUID;
const projectId = 'project-1' as UUID;
const departmentId = 'department-1' as UUID;
const otherDepartmentId = 'department-2' as UUID;
const actorId = 'actor-1' as UUID;
const userId = 'user-1' as UUID;

function makeProject(): Project {
  return {
    id: projectId,
    tenantId,
    name: 'Project',
    status: 'SETUP',
    crewBuild: 'FULL',
    templateId: null,
    createdAt: new Date('2026-03-04T12:00:00Z'),
  };
}

function makeDepartment(id: UUID = departmentId): Department {
  return {
    id,
    projectId,
    tenantId,
    name: id === departmentId ? 'Controls' : 'Safety',
    managerTitle: 'Manager',
    createdBy: actorId,
    createdAt: new Date('2026-03-04T12:00:00Z'),
  };
}

function makeMembership(overrides?: Partial<DepartmentMembership>): DepartmentMembership {
  return {
    id: 'membership-1' as UUID,
    projectId,
    tenantId,
    userId,
    departmentId,
    title: null,
    assignedBy: null,
    assignedAt: null,
    superintendentId: null,
    deactivatedAt: null,
    createdAt: new Date('2026-03-04T12:00:00Z'),
    ...overrides,
  };
}

function makeRepo(overrides?: Partial<ITenancyRepository>): ITenancyRepository {
  return {
    saveTenant: async () => undefined,
    saveCompany: async () => undefined,
    saveProject: async () => undefined,
    findProjectById: async () => makeProject(),
    getProjectActivationReadiness: async () => ({
      aorLevelsCount: 0,
      aorNodesCount: 0,
      surveyManagerCount: 0,
      superintendentAorAssignmentCount: 0,
      departmentsCount: 0,
      actingSurveyManagerCount: 0,
      allowedDomainsCount: 0,
    }),
    markProjectActive: async () => undefined,
    markProjectArchived: async () => undefined,
    listProjectTemplates: async () => [],
    findProjectTemplateById: async () => null,
    saveProjectTemplate: async (_db: DbClient, _template: ProjectTemplate) => undefined,
    updateProjectTemplate: async (_db: DbClient, _template: ProjectTemplate) => undefined,
    findProjectsUsingTemplate: async () => [],
    deleteProjectTemplate: async () => undefined,
    saveTenantMembership: async (_db: DbClient, _membership: TenantMembership) => undefined,
    deleteTenantMembership: async () => undefined,
    saveAorLevel: async (_db: DbClient, _level: AorLevel) => undefined,
    findAorLevelById: async () => null,
    findAorLevelByDepth: async () => null,
    saveAorNode: async (_db: DbClient, _node: AorNode) => undefined,
    findAorNodeById: async () => null,
    saveAorAssignment: async (_db: DbClient, _assignment: AorAssignment) => undefined,
    findAorAssignmentById: async () => null,
    deactivateAorAssignment: async () => undefined,
    findDepartmentById: async (_db, _tenantId, id) => makeDepartment(id),
    saveDepartment: async (_db: DbClient, _department: Department) => undefined,
    listDepartments: async () => [],
    saveDepartmentTitle: async (_db: DbClient, _title: DepartmentTitle) => undefined,
    upsertDepartmentTitle: async (_db: DbClient, _title: DepartmentTitle) => undefined,
    listDepartmentTitles: async () => [],
    findDepartmentTitleByName: async () => ({
      id: 'title-1' as UUID,
      tenantId,
      departmentId,
      title: 'Controls Superintendent',
      defaultPriority: 'MEDIUM',
      assignmentLayer: 'SUPERINTENDENT',
      createdAt: new Date('2026-03-04T12:00:00Z'),
    }),
    saveDepartmentMembership: async (_db: DbClient, _membership: DepartmentMembership) => undefined,
    findDepartmentMembershipByUser: async () => null,
    updateDepartmentMembership: async () => undefined,
    saveArea: async (_db: DbClient, _area: Area) => undefined,
    findAreaById: async () => null,
    saveSubarea: async (_db: DbClient, _subarea: Subarea) => undefined,
    saveMembership: async () => undefined,
    saveWhitelistEntry: async (_db: DbClient, _entry: PriorityWhitelistEntry) => undefined,
    deleteWhitelistEntry: async () => undefined,
    isEmailWhitelisted: async () => false,
    ...overrides,
  };
}

const db: DbClient = {
  query: async () => ({ rows: [] }),
};

function makeRequest(url: string, method: 'POST' | 'PATCH', body: Record<string, unknown>): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeDeps(
  repo: ITenancyRepository,
  actorRole: 'TENANT_ADMIN' | 'PROJECT_ADMIN' | 'DEPARTMENT_MANAGER' | 'DEPARTMENT_LEAD',
): DepartmentMembersRouteDeps {
  return {
    requireAuth: () => ({
      tenantId,
      userId: actorId,
      sessionVersion: 1,
    }),
    resolveActorRole: async () => actorRole,
    assertProjectSetupMutable: async () => undefined,
    createRepo: () => repo,
    withTransaction: async (fn) => fn(db),
  };
}

test('addDepartmentMember places a user into the department free-agent pool', async () => {
  const saved: DepartmentMembership[] = [];
  const repo = makeRepo({
    saveDepartmentMembership: async (_db, membership) => {
      saved.push(membership);
    },
  });

  const membership = await addDepartmentMember(repo, db, {
    tenantId,
    projectId,
    departmentId,
    userId,
    actorRole: 'PROJECT_ADMIN',
  });

  assert.equal(membership.departmentId, departmentId);
  assert.equal(membership.title, null);
  assert.equal(saved.length, 1);
});

test('addDepartmentMember enforces one department per user per project', async () => {
  const repo = makeRepo({
    findDepartmentMembershipByUser: async () => makeMembership(),
  });

  await assert.rejects(
    () => addDepartmentMember(repo, db, {
      tenantId,
      projectId,
      departmentId,
      userId,
      actorRole: 'TENANT_ADMIN',
    }),
    ConflictError,
  );
});

test('assignDepartmentTitle lets a department lead assign a working title within their department', async () => {
  const updated: DepartmentMembership[] = [];
  const repo = makeRepo({
    findDepartmentMembershipByUser: async (_db, _tenantId, _projectId, targetUserId) => {
      if (targetUserId === actorId) {
        return makeMembership({ userId: actorId });
      }
      return makeMembership();
    },
    updateDepartmentMembership: async (_db, membership) => {
      updated.push(membership);
    },
  });

  const membership = await assignDepartmentTitle(repo, db, {
    tenantId,
    projectId,
    departmentId,
    userId,
    title: 'Controls Superintendent',
    actorId,
    actorRole: 'DEPARTMENT_LEAD',
  });

  assert.equal(membership.title, 'Controls Superintendent');
  assert.equal(membership.superintendentId, actorId);
  assert.equal(updated.length, 1);
});

test('reassignDepartmentMember moves a member to a new department and clears title state', async () => {
  const updated: DepartmentMembership[] = [];
  const repo = makeRepo({
    findDepartmentMembershipByUser: async () => makeMembership({
      departmentId,
      title: 'Controls Superintendent',
      assignedBy: actorId,
      assignedAt: new Date('2026-03-04T13:00:00Z'),
      superintendentId: actorId,
    }),
    updateDepartmentMembership: async (_db, membership) => {
      updated.push(membership);
    },
    findDepartmentById: async (_db, _tenantId, id) => makeDepartment(id),
  });

  const membership = await reassignDepartmentMember(repo, db, {
    tenantId,
    projectId,
    departmentId: otherDepartmentId,
    userId,
    actorRole: 'PROJECT_ADMIN',
  });

  assert.equal(membership.departmentId, otherDepartmentId);
  assert.equal(membership.title, null);
  assert.equal(membership.superintendentId, null);
  assert.equal(updated.length, 1);
});

test('handlePostDepartmentMembers adds a member through the route', async () => {
  const saved: DepartmentMembership[] = [];
  const repo = makeRepo({
    saveDepartmentMembership: async (_db, membership) => {
      saved.push(membership);
    },
  });

  const response = await handlePostDepartmentMembers(
    makeRequest(
      'http://localhost/api/projects/project-1/departments/department-1/members',
      'POST',
      { userId },
    ),
    { params: Promise.resolve({ projectId, departmentId }) },
    makeDeps(repo, 'TENANT_ADMIN'),
  );

  assert.equal(response.status, 201);
  const json = await response.json() as { membership: DepartmentMembership };
  assert.equal(json.membership.userId, userId);
  assert.equal(saved.length, 1);
});

test('handlePatchDepartmentMembers assigns a title through the route', async () => {
  const updated: DepartmentMembership[] = [];
  const repo = makeRepo({
    findDepartmentMembershipByUser: async (_db, _tenantId, _projectId, targetUserId) => {
      if (targetUserId === actorId) {
        return makeMembership({ userId: actorId });
      }
      return makeMembership();
    },
    updateDepartmentMembership: async (_db, membership) => {
      updated.push(membership);
    },
  });

  const response = await handlePatchDepartmentMembers(
    makeRequest(
      'http://localhost/api/projects/project-1/departments/department-1/members',
      'PATCH',
      {
        kind: 'ASSIGN_TITLE',
        userId,
        title: 'Controls Superintendent',
      },
    ),
    { params: Promise.resolve({ projectId, departmentId }) },
    makeDeps(repo, 'DEPARTMENT_LEAD'),
  );

  assert.equal(response.status, 200);
  const json = await response.json() as { membership: DepartmentMembership };
  assert.equal(json.membership.title, 'Controls Superintendent');
  assert.equal(updated.length, 1);
});

test('handlePatchDepartmentMembers returns 403 when a requester tries to assign a title', async () => {
  const response = await handlePatchDepartmentMembers(
    makeRequest(
      'http://localhost/api/projects/project-1/departments/department-1/members',
      'PATCH',
      {
        kind: 'ASSIGN_TITLE',
        userId,
        title: 'Controls Superintendent',
      },
    ),
    { params: Promise.resolve({ projectId, departmentId }) },
    {
      ...makeDeps(makeRepo(), 'PROJECT_ADMIN'),
      resolveActorRole: async () => 'REQUESTER',
    },
  );

  assert.equal(response.status, 403);
});

test('handlePostDepartmentMembers returns 409 when setup is locked after activation', async () => {
  const response = await handlePostDepartmentMembers(
    makeRequest(
      'http://localhost/api/projects/project-1/departments/department-1/members',
      'POST',
      { userId },
    ),
    { params: Promise.resolve({ projectId, departmentId }) },
    {
      ...makeDeps(makeRepo(), 'TENANT_ADMIN'),
      assertProjectSetupMutable: async () => {
        throw new ConflictError('Project setup is locked after activation');
      },
    },
  );

  assert.equal(response.status, 409);
});
