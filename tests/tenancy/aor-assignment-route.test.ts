import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { ConflictError, ForbiddenError } from '@/shared/errors';
import {
  handleDeleteAorAssignments,
  handlePostAorAssignments,
  type AorAssignmentsRouteDeps,
} from '@/app/api/projects/[projectId]/aor/assignments/handler';
import type { ITenancyRepository } from '@/modules/tenancy/application/ports';
import type {
  AorAssignment,
  AorLevel,
  AorNode,
  Area,
  Department,
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
const actorId = 'user-admin' as UUID;
const aorNodeId = 'node-1' as UUID;
const departmentId = 'department-1' as UUID;
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

function makeNode(): AorNode {
  return {
    id: aorNodeId,
    projectId,
    tenantId,
    levelId: 'level-1' as UUID,
    parentId: null,
    name: 'Unit 1',
    code: 'U1',
    createdAt: new Date('2026-03-04T12:00:00Z'),
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
    findAorNodeById: async () => makeNode(),
    saveAorAssignment: async (_db: DbClient, _assignment: AorAssignment) => undefined,
    findAorAssignmentById: async () => null,
    deactivateAorAssignment: async () => undefined,
    findDepartmentById: async () => ({
      id: departmentId,
      projectId,
      tenantId,
      name: 'QA/QC',
      managerTitle: 'QA/QC Manager',
      createdBy: actorId,
      createdAt: new Date('2026-03-04T12:00:00Z'),
    }),
    saveDepartment: async (_db: DbClient, _department: Department) => undefined,
    listDepartments: async () => [],
    saveDepartmentTitle: async (_db: DbClient, _title: DepartmentTitle) => undefined,
    upsertDepartmentTitle: async (_db: DbClient, _title: DepartmentTitle) => undefined,
    listDepartmentTitles: async () => [],
    findDepartmentTitleByName: async () => null,
    saveDepartmentMembership: async () => undefined,
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

function makeRequest(url: string, method: 'POST' | 'DELETE', body: Record<string, unknown>): NextRequest {
  return new NextRequest(url, {
    method,
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function makeDeps(repo: ITenancyRepository, actorRole: 'PROJECT_ADMIN' | 'TENANT_ADMIN'): AorAssignmentsRouteDeps {
  const db: DbClient = {
    query: async () => ({ rows: [] }),
  };

  return {
    requireAuth: () => ({
      tenantId,
      userId: actorId,
    }),
    resolveProjectSetupActorRole: async () => actorRole,
    assertProjectSetupMutable: async () => undefined,
    createRepo: () => repo,
    withTransaction: async (fn) => fn(db),
  };
}

test('handlePostAorAssignments creates a user-scoped assignment for setup admins', async () => {
  const saved: AorAssignment[] = [];
  const repo = makeRepo({
    saveAorAssignment: async (_db, assignment) => {
      saved.push(assignment);
    },
  });

  const response = await handlePostAorAssignments(
    makeRequest('http://localhost/api/projects/project-1/aor/assignments', 'POST', {
      kind: 'USER',
      userId,
      aorNodeId,
    }),
    { params: Promise.resolve({ projectId }) },
    makeDeps(repo, 'PROJECT_ADMIN'),
  );

  assert.equal(response.status, 201);
  const json = await response.json() as { assignment: AorAssignment };
  assert.equal(json.assignment.userId, userId);
  assert.equal(saved.length, 1);
});

test('handleDeleteAorAssignments deactivates a department-scoped assignment', async () => {
  const deactivated: UUID[] = [];
  const assignmentId = 'assignment-1' as UUID;
  const repo = makeRepo({
    findAorAssignmentById: async () => ({
      id: assignmentId,
      projectId,
      tenantId,
      userId: null,
      aorNodeId,
      departmentId,
      deactivatedAt: null,
      createdAt: new Date('2026-03-04T12:00:00Z'),
    }),
    deactivateAorAssignment: async (_db, _tenantId, targetId) => {
      deactivated.push(targetId);
    },
  });

  const response = await handleDeleteAorAssignments(
    makeRequest('http://localhost/api/projects/project-1/aor/assignments', 'DELETE', {
      kind: 'DEPARTMENT',
      assignmentId,
    }),
    { params: Promise.resolve({ projectId }) },
    makeDeps(repo, 'TENANT_ADMIN'),
  );

  assert.equal(response.status, 200);
  const json = await response.json() as { assignment: AorAssignment };
  assert.equal(json.assignment.id, assignmentId);
  assert.deepEqual(deactivated, [assignmentId]);
});

test('handlePostAorAssignments returns 403 when setup role resolution fails', async () => {
  const repo = makeRepo();
  const deps: AorAssignmentsRouteDeps = {
    ...makeDeps(repo, 'PROJECT_ADMIN'),
    resolveProjectSetupActorRole: async () => {
      throw new ForbiddenError('Only PROJECT_ADMIN or TENANT_ADMIN may manage the AOR setup surface');
    },
  };

  const response = await handlePostAorAssignments(
    makeRequest('http://localhost/api/projects/project-1/aor/assignments', 'POST', {
      kind: 'USER',
      userId,
      aorNodeId,
    }),
    { params: Promise.resolve({ projectId }) },
    deps,
  );

  assert.equal(response.status, 403);
});

test('handlePostAorAssignments returns 409 when setup mutations are attempted after activation', async () => {
  const deps: AorAssignmentsRouteDeps = {
    ...makeDeps(makeRepo(), 'PROJECT_ADMIN'),
    assertProjectSetupMutable: async () => {
      throw new ConflictError('Project setup is locked after activation');
    },
  };

  const response = await handlePostAorAssignments(
    makeRequest('http://localhost/api/projects/project-1/aor/assignments', 'POST', {
      kind: 'USER',
      userId,
      aorNodeId,
    }),
    { params: Promise.resolve({ projectId }) },
    deps,
  );

  assert.equal(response.status, 409);
});
