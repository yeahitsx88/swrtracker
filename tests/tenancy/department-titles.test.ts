import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { ConflictError, ForbiddenError, ValidationError } from '@/shared/errors';
import { listDepartmentTitles } from '@/modules/tenancy/application/list-department-titles';
import { upsertDepartmentTitle } from '@/modules/tenancy/application/upsert-department-title';
import {
  handleGetDepartmentTitles,
  handlePostDepartmentTitles,
  type DepartmentTitlesRouteDeps,
} from '@/app/api/projects/[projectId]/departments/[departmentId]/titles/handler';
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
const departmentId = 'department-1' as UUID;

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

function makeDepartment(): Department {
  return {
    id: departmentId,
    projectId,
    tenantId,
    name: 'Controls',
    managerTitle: 'Controls Manager',
    createdBy: actorId,
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
    findDepartmentById: async () => makeDepartment(),
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

const db: DbClient = {
  query: async () => ({ rows: [] }),
};

function makeRequest(url: string, method: 'POST' | 'GET', body?: Record<string, unknown>): NextRequest {
  return new NextRequest(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

function makeDeps(
  repo: ITenancyRepository,
  actorRole: 'PROJECT_ADMIN' | 'TENANT_ADMIN',
): DepartmentTitlesRouteDeps {
  return {
    requireAuth: () => ({
      tenantId,
      userId: actorId,
      sessionVersion: 1,
    }),
    resolveProjectSetupActorRole: async () => actorRole,
    assertProjectSetupMutable: async () => undefined,
    createRepo: () => repo,
    withTransaction: async (fn) => fn(db),
  };
}

test('upsertDepartmentTitle validates priority and persists the department title', async () => {
  const savedTitles: DepartmentTitle[] = [];
  const repo = makeRepo({
    upsertDepartmentTitle: async (_db, title) => {
      savedTitles.push(title);
    },
  });

  const title = await upsertDepartmentTitle(repo, db, {
    tenantId,
    projectId,
    departmentId,
    title: 'Controls Superintendent',
    defaultPriority: 'MEDIUM',
    assignmentLayer: 'SUPERINTENDENT',
    actorRole: 'PROJECT_ADMIN',
  });

  assert.equal(title.title, 'Controls Superintendent');
  assert.equal(title.defaultPriority, 'MEDIUM');
  assert.equal(title.assignmentLayer, 'SUPERINTENDENT');
  assert.equal(savedTitles.length, 1);
});

test('upsertDepartmentTitle rejects invalid default priority', async () => {
  const repo = makeRepo();

  await assert.rejects(
    () => upsertDepartmentTitle(repo, db, {
      tenantId,
      projectId,
      departmentId,
      title: 'Controls Superintendent',
      defaultPriority: 'URGENT' as never,
      assignmentLayer: 'SUPERINTENDENT',
      actorRole: 'PROJECT_ADMIN',
    }),
    ValidationError,
  );
});

test('listDepartmentTitles returns the department title catalog', async () => {
  const repo = makeRepo({
    listDepartmentTitles: async () => ([
      {
        id: 'title-1' as UUID,
        tenantId,
        departmentId,
        title: 'Controls Manager',
        defaultPriority: 'MED_HIGH',
        assignmentLayer: 'MANAGER',
        createdAt: new Date('2026-03-04T12:00:00Z'),
      },
      {
        id: 'title-2' as UUID,
        tenantId,
        departmentId,
        title: 'Controls Superintendent',
        defaultPriority: 'MEDIUM',
        assignmentLayer: 'SUPERINTENDENT',
        createdAt: new Date('2026-03-04T12:00:00Z'),
      },
    ]),
  });

  const titles = await listDepartmentTitles(repo, db, {
    tenantId,
    projectId,
    departmentId,
    actorRole: 'TENANT_ADMIN',
  });

  assert.equal(titles.length, 2);
  assert.equal(titles[0]?.title, 'Controls Manager');
});

test('handlePostDepartmentTitles upserts a department title for setup admins', async () => {
  const savedTitles: DepartmentTitle[] = [];
  const repo = makeRepo({
    upsertDepartmentTitle: async (_db, title) => {
      savedTitles.push(title);
    },
  });

  const response = await handlePostDepartmentTitles(
    makeRequest(
      'http://localhost/api/projects/project-1/departments/department-1/titles',
      'POST',
      {
        title: 'Controls Superintendent',
        defaultPriority: 'MEDIUM',
        assignmentLayer: 'SUPERINTENDENT',
      },
    ),
    { params: Promise.resolve({ projectId, departmentId }) },
    makeDeps(repo, 'PROJECT_ADMIN'),
  );

  assert.equal(response.status, 201);
  const json = await response.json() as { title: DepartmentTitle };
  assert.equal(json.title.title, 'Controls Superintendent');
  assert.equal(savedTitles.length, 1);
});

test('handleGetDepartmentTitles returns the department title catalog', async () => {
  const repo = makeRepo({
    listDepartmentTitles: async () => ([
      {
        id: 'title-1' as UUID,
        tenantId,
        departmentId,
        title: 'Controls Manager',
        defaultPriority: 'MED_HIGH',
        assignmentLayer: 'MANAGER',
        createdAt: new Date('2026-03-04T12:00:00Z'),
      },
    ]),
  });

  const response = await handleGetDepartmentTitles(
    makeRequest(
      'http://localhost/api/projects/project-1/departments/department-1/titles',
      'GET',
    ),
    { params: Promise.resolve({ projectId, departmentId }) },
    makeDeps(repo, 'TENANT_ADMIN'),
  );

  assert.equal(response.status, 200);
  const json = await response.json() as { titles: DepartmentTitle[] };
  assert.equal(json.titles.length, 1);
  assert.equal(json.titles[0]?.title, 'Controls Manager');
});

test('handleGetDepartmentTitles returns 403 when setup role resolution fails', async () => {
  const deps: DepartmentTitlesRouteDeps = {
    ...makeDeps(makeRepo(), 'PROJECT_ADMIN'),
    resolveProjectSetupActorRole: async () => {
      throw new ForbiddenError('Only PROJECT_ADMIN or TENANT_ADMIN may manage the AOR setup surface');
    },
  };

  const response = await handleGetDepartmentTitles(
    makeRequest(
      'http://localhost/api/projects/project-1/departments/department-1/titles',
      'GET',
    ),
    { params: Promise.resolve({ projectId, departmentId }) },
    deps,
  );

  assert.equal(response.status, 403);
});

test('handlePostDepartmentTitles returns 409 when setup is locked after activation', async () => {
  const deps: DepartmentTitlesRouteDeps = {
    ...makeDeps(makeRepo(), 'PROJECT_ADMIN'),
    assertProjectSetupMutable: async () => {
      throw new ConflictError('Project setup is locked after activation');
    },
  };

  const response = await handlePostDepartmentTitles(
    makeRequest('http://localhost/api/projects/project-1/departments/department-1/titles', 'POST', {
      title: 'Controls Superintendent',
      defaultPriority: 'MEDIUM',
      assignmentLayer: 'SUPERINTENDENT',
    }),
    { params: Promise.resolve({ projectId, departmentId }) },
    deps,
  );

  assert.equal(response.status, 409);
});
