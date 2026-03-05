import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { ConflictError, ForbiddenError } from '@/shared/errors';
import {
  activateProject,
  type ActivateProjectResult,
} from '@/modules/tenancy/application/activate-project';
import { archiveProject } from '@/modules/tenancy/application/archive-project';
import type {
  ITenancyRepository,
  ProjectActivationReadinessSnapshot,
} from '@/modules/tenancy/application/ports';
import {
  handlePostProjectActivation,
  type ProjectActivationRouteDeps,
} from '@/app/api/projects/[projectId]/activate/handler';
import {
  handlePostProjectArchive,
  type ProjectArchiveRouteDeps,
} from '@/app/api/projects/[projectId]/archive/handler';
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
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import type { DbClient, UUID } from '@/shared/types';

const tenantId = 'tenant-1' as UUID;
const projectId = 'project-1' as UUID;
const actorId = 'user-admin' as UUID;

function makeProject(overrides?: Partial<Project>): Project {
  return {
    id: projectId,
    tenantId,
    name: 'Project',
    status: 'SETUP',
    crewBuild: 'FULL',
    templateId: null,
    createdAt: new Date('2026-03-04T12:00:00Z'),
    activatedAt: null,
    activatedBy: null,
    archivedAt: null,
    archivedBy: null,
    ...overrides,
  };
}

function makeReadiness(
  overrides?: Partial<ProjectActivationReadinessSnapshot>,
): ProjectActivationReadinessSnapshot {
  return {
    aorLevelsCount: 1,
    aorNodesCount: 1,
    surveyManagerCount: 1,
    superintendentAorAssignmentCount: 1,
    departmentsCount: 1,
    actingSurveyManagerCount: 1,
    allowedDomainsCount: 1,
    ...overrides,
  };
}

function makeRepo(overrides?: Partial<ITenancyRepository>): ITenancyRepository {
  return {
    saveTenant: async () => undefined,
    saveCompany: async () => undefined,
    saveProject: async () => undefined,
    findProjectById: async () => makeProject(),
    getProjectActivationReadiness: async () => makeReadiness(),
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

function makeActivationRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost/api/projects/${projectId}/activate`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function makeDeps(repo: ITenancyRepository): ProjectActivationRouteDeps {
  return {
    requireAuth: () => ({
      tenantId,
      userId: actorId,
      sessionVersion: 1,
    }),
    resolveProjectSetupActorRole: async () => 'PROJECT_ADMIN',
    createRepo: () => repo,
    withTransaction: async (fn) => fn(db),
  };
}

function makeArchiveRequest(): NextRequest {
  return new NextRequest(`http://localhost/api/projects/${projectId}/archive`, {
    method: 'POST',
  });
}

function makeArchiveDeps(
  repo: ITenancyRepository,
  tenantRole: 'TENANT_ADMIN' | null = 'TENANT_ADMIN',
): ProjectArchiveRouteDeps {
  return {
    requireAuth: () => ({
      tenantId,
      userId: actorId,
      sessionVersion: 1,
    }),
    getTenantRole: async () => tenantRole,
    createRepo: () => repo,
    withTransaction: async (fn) => fn(db),
  };
}

test('activateProject blocks FULL build activation without a superintendent AOR assignment', async () => {
  let markedActive = false;
  const repo = makeRepo({
    getProjectActivationReadiness: async () => makeReadiness({
      superintendentAorAssignmentCount: 0,
    }),
    markProjectActive: async () => {
      markedActive = true;
    },
  });

  const result = await activateProject(repo, db, {
    tenantId,
    projectId,
    actorId,
    actorRole: 'PROJECT_ADMIN',
  });

  if (result.outcome !== 'BLOCKED') {
    assert.fail('expected activation to be blocked');
  }
  assert.equal(result.reason, 'HARD_FAILURES');
  assert.equal(
    result.readiness.hardFailures.some((check) => check.code === 'SURVEY_SUPERINTENDENT_AOR_ASSIGNMENT'),
    true,
  );
  assert.equal(markedActive, false);
});

test('activateProject requires warning acknowledgement before activating', async () => {
  const repo = makeRepo({
    getProjectActivationReadiness: async () => makeReadiness({
      departmentsCount: 0,
      actingSurveyManagerCount: 0,
      allowedDomainsCount: 0,
    }),
  });

  const result = await activateProject(repo, db, {
    tenantId,
    projectId,
    actorId,
    actorRole: 'TENANT_ADMIN',
  });

  if (result.outcome !== 'BLOCKED') {
    assert.fail('expected activation warnings to block without acknowledgement');
  }
  assert.equal(result.reason, 'WARNINGS_ACK_REQUIRED');
  assert.deepEqual(
    result.readiness.warnings.map((check) => check.code).sort(),
    ['ACTING_SURVEY_MANAGER', 'ALLOWED_DOMAINS', 'DEPARTMENTS'],
  );
});

test('activateProject marks the project ACTIVE and stamps activation metadata once warnings are acknowledged', async () => {
  const activations: Array<{ activatedAt: Date; activatedBy: UUID }> = [];
  const repo = makeRepo({
    getProjectActivationReadiness: async () => makeReadiness({
      departmentsCount: 0,
    }),
    markProjectActive: async (_db, _tenantId, _projectId, activatedAt, activatedBy) => {
      activations.push({ activatedAt, activatedBy });
    },
  });

  const result = await activateProject(repo, db, {
    tenantId,
    projectId,
    actorId,
    actorRole: 'PROJECT_ADMIN',
    acknowledgeWarnings: true,
  });

  if (result.outcome !== 'ACTIVATED') {
    assert.fail('expected activation to succeed');
  }
  assert.equal(result.project.status, 'ACTIVE');
  assert.equal(result.project.activatedBy, actorId);
  assert.ok(result.project.activatedAt instanceof Date);
  assert.equal(result.warningsAcknowledged, true);
  assert.equal(activations.length, 1);
  assert.equal(activations[0]?.activatedBy, actorId);
});

test('handlePostProjectActivation returns blocked readiness details when warnings are unacknowledged', async () => {
  const repo = makeRepo({
    getProjectActivationReadiness: async () => makeReadiness({
      departmentsCount: 0,
    }),
  });

  const response = await handlePostProjectActivation(
    makeActivationRequest({}),
    { params: Promise.resolve({ projectId }) },
    makeDeps(repo),
  );

  assert.equal(response.status, 409);
  const json = await response.json() as {
    reason: string;
    readiness: Extract<ActivateProjectResult, { outcome: 'BLOCKED' }>['readiness'];
  };
  assert.equal(json.reason, 'WARNINGS_ACK_REQUIRED');
  assert.equal(json.readiness.warnings.some((check) => check.code === 'DEPARTMENTS'), true);
});

test('handlePostProjectActivation returns 403 when setup role resolution fails', async () => {
  const deps: ProjectActivationRouteDeps = {
    ...makeDeps(makeRepo()),
    resolveProjectSetupActorRole: async () => {
      throw new ForbiddenError('Only PROJECT_ADMIN or TENANT_ADMIN may manage the AOR setup surface');
    },
  };

  const response = await handlePostProjectActivation(
    makeActivationRequest({}),
    { params: Promise.resolve({ projectId }) },
    deps,
  );

  assert.equal(response.status, 403);
});

test('archiveProject requires TENANT_ADMIN', async () => {
  const repo = makeRepo({
    findProjectById: async () => makeProject({ status: 'ACTIVE' }),
  });

  await assert.rejects(
    () => archiveProject(repo, db, {
      tenantId,
      projectId,
      actorId,
      actorRole: null,
    }),
    ForbiddenError,
  );
});

test('archiveProject rejects non-ACTIVE projects', async () => {
  const repo = makeRepo({
    findProjectById: async () => makeProject({ status: 'SETUP' }),
  });

  await assert.rejects(
    () => archiveProject(repo, db, {
      tenantId,
      projectId,
      actorId,
      actorRole: 'TENANT_ADMIN',
    }),
    ConflictError,
  );
});

test('archiveProject marks the project ARCHIVED and stamps archive metadata', async () => {
  const archives: Array<{ archivedAt: Date; archivedBy: UUID }> = [];
  const repo = makeRepo({
    findProjectById: async () => makeProject({ status: 'ACTIVE' }),
    markProjectArchived: async (_db, _tenantId, _projectId, archivedAt, archivedBy) => {
      archives.push({ archivedAt, archivedBy });
    },
  });

  const project = await archiveProject(repo, db, {
    tenantId,
    projectId,
    actorId,
    actorRole: 'TENANT_ADMIN',
  });

  assert.equal(project.status, 'ARCHIVED');
  assert.equal(project.archivedBy, actorId);
  assert.ok(project.archivedAt instanceof Date);
  assert.equal(archives.length, 1);
  assert.equal(archives[0]?.archivedBy, actorId);
});

test('handlePostProjectArchive returns 403 when the actor is not a tenant admin', async () => {
  const response = await handlePostProjectArchive(
    makeArchiveRequest(),
    { params: Promise.resolve({ projectId }) },
    makeArchiveDeps(makeRepo({
      findProjectById: async () => makeProject({ status: 'ACTIVE' }),
    }), null),
  );

  assert.equal(response.status, 403);
});

test('handlePostProjectArchive archives an active project for tenant admins', async () => {
  const repo = makeRepo({
    findProjectById: async () => makeProject({ status: 'ACTIVE' }),
  });

  const response = await handlePostProjectArchive(
    makeArchiveRequest(),
    { params: Promise.resolve({ projectId }) },
    makeArchiveDeps(repo),
  );

  assert.equal(response.status, 200);
  const json = await response.json() as { project: Project };
  assert.equal(json.project.status, 'ARCHIVED');
  assert.equal(json.project.archivedBy, actorId);
});

test('TenancyRepository blocks archived project setup writes', async () => {
  const calls: string[] = [];
  const repo = new TenancyRepository();
  const archivedDb: DbClient = {
    query: async <T extends object = Record<string, unknown>>(sql: string) => {
      calls.push(sql);
      if (/SELECT status\s+FROM projects/.test(sql)) {
        return { rows: [{ status: 'ARCHIVED' }] as T[] };
      }
      return { rows: [] as T[] };
    },
  };

  await assert.rejects(
    () => repo.saveDepartment(archivedDb, {
      id: 'department-1' as UUID,
      projectId,
      tenantId,
      name: 'Controls',
      managerTitle: 'Controls Manager',
      createdBy: actorId,
      createdAt: new Date('2026-03-04T12:00:00Z'),
    }),
    ConflictError,
  );

  assert.equal(calls.length, 1);
  assert.match(calls[0] ?? '', /SELECT status\s+FROM projects/);
});
