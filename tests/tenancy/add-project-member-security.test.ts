import test from 'node:test';
import assert from 'node:assert/strict';
import { ForbiddenError } from '@/shared/errors';
import { addProjectMember } from '@/modules/tenancy/application/add-project-member';
import type { ITenancyRepository } from '@/modules/tenancy/application/ports';
import type {
  AorAssignment,
  Department,
  DepartmentTitle,
  Project,
} from '@/modules/tenancy/domain/types';
import type { DbClient, UUID } from '@/shared/types';

const tenantId = 'tenant-1' as UUID;
const projectId = 'project-1' as UUID;
const userId = 'user-1' as UUID;
const db: DbClient = {
  query: async () => ({ rows: [] }),
};

function makeProject(overrides?: Partial<Project>): Project {
  return {
    id: projectId,
    tenantId,
    name: 'Project 1',
    status: 'SETUP',
    crewBuild: 'FULL',
    templateId: null,
    activatedAt: null,
    activatedBy: null,
    archivedAt: null,
    archivedBy: null,
    createdAt: new Date('2026-03-05T00:00:00Z'),
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
    saveProjectTemplate: async () => undefined,
    updateProjectTemplate: async () => undefined,
    findProjectsUsingTemplate: async () => [],
    deleteProjectTemplate: async () => undefined,
    saveTenantMembership: async () => undefined,
    deleteTenantMembership: async () => undefined,
    saveAorLevel: async () => undefined,
    findAorLevelById: async () => null,
    findAorLevelByDepth: async () => null,
    saveAorNode: async () => undefined,
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
    saveArea: async () => undefined,
    findAreaById: async () => null,
    saveSubarea: async () => undefined,
    saveMembership: async () => undefined,
    saveWhitelistEntry: async () => undefined,
    deleteWhitelistEntry: async () => undefined,
    isEmailWhitelisted: async () => false,
    ...overrides,
  };
}

test('addProjectMember rejects cross-tenant project membership mutations', async () => {
  const repo = makeRepo({
    findProjectById: async () => null,
  });

  await assert.rejects(
    () =>
      addProjectMember(repo, db, {
        tenantId,
        projectId,
        userId,
        role: 'REQUESTER',
        actorRole: 'TENANT_ADMIN',
      }),
    (err: unknown) =>
      err instanceof ForbiddenError &&
      err.code === 'SEC_TENANT_BOUNDARY_VIOLATION',
  );
});

test('addProjectMember rejects non-tenant-admin actors', async () => {
  const repo = makeRepo();

  await assert.rejects(
    () =>
      addProjectMember(repo, db, {
        tenantId,
        projectId,
        userId,
        role: 'REQUESTER',
        actorRole: 'REQUESTER',
      }),
    ForbiddenError,
  );
});

test('addProjectMember increments target session version on role updates', async () => {
  let bumped = false;
  let savedTenantId: UUID | null = null;

  const repo = makeRepo({
    saveMembership: async (_db, membership) => {
      savedTenantId = membership.tenantId;
    },
    bumpUserSessionVersion: async () => {
      bumped = true;
    },
  });

  await addProjectMember(repo, db, {
    tenantId,
    projectId,
    userId,
    role: 'REQUESTER',
    actorRole: 'TENANT_ADMIN',
  });

  assert.equal(savedTenantId, tenantId);
  assert.equal(bumped, true);
});

test('addProjectMember surfaces repository tenant-boundary violations', async () => {
  const repo = makeRepo({
    saveMembership: async () => {
      throw new ForbiddenError(
        'Project membership mutation violates tenant boundary',
        'SEC_TENANT_BOUNDARY_VIOLATION',
      );
    },
  });

  await assert.rejects(
    () =>
      addProjectMember(repo, db, {
        tenantId,
        projectId,
        userId,
        role: 'REQUESTER',
        actorRole: 'TENANT_ADMIN',
      }),
    (err: unknown) =>
      err instanceof ForbiddenError &&
      err.code === 'SEC_TENANT_BOUNDARY_VIOLATION',
  );
});
