import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { ConflictError, ForbiddenError } from '@/shared/errors';
import {
  handleGetDepartments,
  handlePostDepartments,
  type DepartmentsRouteDeps,
} from '@/app/api/projects/[projectId]/departments/route';
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
    findDepartmentById: async () => null,
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

function makeRequest(url: string, method: 'POST' | 'GET', body?: Record<string, unknown>): NextRequest {
  return new NextRequest(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

function makeDeps(repo: ITenancyRepository, actorRole: 'PROJECT_ADMIN' | 'TENANT_ADMIN'): DepartmentsRouteDeps {
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

test('handlePostDepartments creates a department for setup admins', async () => {
  const savedDepartments: Department[] = [];
  const savedTitles: DepartmentTitle[] = [];
  const repo = makeRepo({
    saveDepartment: async (_db, department) => {
      savedDepartments.push(department);
    },
    saveDepartmentTitle: async (_db, title) => {
      savedTitles.push(title);
    },
  });

  const response = await handlePostDepartments(
    makeRequest('http://localhost/api/projects/project-1/departments', 'POST', {
      name: 'Controls',
      managerTitle: 'Controls Manager',
    }),
    { params: Promise.resolve({ projectId }) },
    makeDeps(repo, 'PROJECT_ADMIN'),
  );

  assert.equal(response.status, 201);
  const json = await response.json() as { department: Department };
  assert.equal(json.department.name, 'Controls');
  assert.equal(savedDepartments.length, 1);
  assert.equal(savedTitles.length, 1);
});

test('handleGetDepartments returns the setup department list', async () => {
  const repo = makeRepo({
    listDepartments: async () => ([
      {
        id: 'department-1' as UUID,
        projectId,
        tenantId,
        name: 'Controls',
        managerTitle: 'Controls Manager',
        createdBy: actorId,
        createdAt: new Date('2026-03-04T12:00:00Z'),
      },
    ]),
  });

  const response = await handleGetDepartments(
    makeRequest('http://localhost/api/projects/project-1/departments', 'GET'),
    { params: Promise.resolve({ projectId }) },
    makeDeps(repo, 'TENANT_ADMIN'),
  );

  assert.equal(response.status, 200);
  const json = await response.json() as { departments: Department[] };
  assert.equal(json.departments.length, 1);
  assert.equal(json.departments[0]?.name, 'Controls');
});

test('handleGetDepartments returns 403 when setup role resolution fails', async () => {
  const repo = makeRepo();
  const deps: DepartmentsRouteDeps = {
    ...makeDeps(repo, 'PROJECT_ADMIN'),
    resolveProjectSetupActorRole: async () => {
      throw new ForbiddenError('Only PROJECT_ADMIN or TENANT_ADMIN may manage the AOR setup surface');
    },
  };

  const response = await handleGetDepartments(
    makeRequest('http://localhost/api/projects/project-1/departments', 'GET'),
    { params: Promise.resolve({ projectId }) },
    deps,
  );

  assert.equal(response.status, 403);
});

test('handlePostDepartments returns 409 when setup is locked after activation', async () => {
  const deps: DepartmentsRouteDeps = {
    ...makeDeps(makeRepo(), 'PROJECT_ADMIN'),
    assertProjectSetupMutable: async () => {
      throw new ConflictError('Project setup is locked after activation');
    },
  };

  const response = await handlePostDepartments(
    makeRequest('http://localhost/api/projects/project-1/departments', 'POST', {
      name: 'Controls',
      managerTitle: 'Controls Manager',
    }),
    { params: Promise.resolve({ projectId }) },
    deps,
  );

  assert.equal(response.status, 409);
});
