import test from 'node:test';
import assert from 'node:assert/strict';
import { ConflictError, ForbiddenError, ValidationError } from '@/shared/errors';
import { createAorLevel } from '@/modules/tenancy/application/create-aor-level';
import { createAorNode } from '@/modules/tenancy/application/create-aor-node';
import type { ITenancyRepository } from '@/modules/tenancy/application/ports';
import type {
  AorAssignment,
  AorLevel,
  AorNode,
  Project,
  Area,
  Department,
  DepartmentTitle,
  Subarea,
  PriorityWhitelistEntry,
  ProjectTemplate,
  TenantMembership,
} from '@/modules/tenancy/domain/types';
import type { DbClient, UUID } from '@/shared/types';

const tenantId = 'tenant-1' as UUID;
const projectId = 'project-1' as UUID;

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

test('createAorLevel creates a project AOR level for PROJECT_ADMIN', async () => {
  const saved: AorLevel[] = [];
  const repo = makeRepo({
    saveAorLevel: async (_db, level) => {
      saved.push(level);
    },
  });

  const level = await createAorLevel(repo, db, {
    tenantId,
    projectId,
    depth: 0,
    label: 'UNIT',
    actorRole: 'PROJECT_ADMIN',
  });

  assert.equal(level.depth, 0);
  assert.equal(level.label, 'UNIT');
  assert.equal(saved.length, 1);
  assert.equal(saved[0]?.label, 'UNIT');
});

test('createAorLevel rejects duplicate depths within the same project', async () => {
  const repo = makeRepo({
    findAorLevelByDepth: async () => ({
      id: 'level-1' as UUID,
      projectId,
      tenantId,
      depth: 0,
      label: 'UNIT',
      createdAt: new Date('2026-03-04T12:00:00Z'),
    }),
  });

  await assert.rejects(
    () => createAorLevel(repo, db, {
      tenantId,
      projectId,
      depth: 0,
      label: 'CWA',
      actorRole: 'PROJECT_ADMIN',
    }),
    ConflictError,
  );
});

test('createAorNode creates a child node when the parent is one level above', async () => {
  const saved: AorNode[] = [];
  const repo = makeRepo({
    findAorLevelById: async (_db, _tenantId, levelId) => {
      if (levelId === ('level-2' as UUID)) {
        return {
          id: levelId,
          projectId,
          tenantId,
          depth: 1,
          label: 'CWA',
          createdAt: new Date('2026-03-04T12:00:00Z'),
        };
      }

      return {
        id: 'level-1' as UUID,
        projectId,
        tenantId,
        depth: 0,
        label: 'UNIT',
        createdAt: new Date('2026-03-04T12:00:00Z'),
      };
    },
    findAorNodeById: async () => ({
      id: 'parent-1' as UUID,
      projectId,
      tenantId,
      levelId: 'level-1' as UUID,
      parentId: null,
      name: 'Unit 1',
      code: 'U1',
      createdAt: new Date('2026-03-04T12:00:00Z'),
    }),
    saveAorNode: async (_db, node) => {
      saved.push(node);
    },
  });

  const node = await createAorNode(repo, db, {
    tenantId,
    projectId,
    levelId: 'level-2' as UUID,
    parentId: 'parent-1' as UUID,
    name: 'CWA-1100',
    code: 'CWA1100',
    actorRole: 'PROJECT_ADMIN',
  });

  assert.equal(node.parentId, 'parent-1');
  assert.equal(node.code, 'CWA1100');
  assert.equal(saved.length, 1);
});

test('createAorNode rejects a parent that is not one level above', async () => {
  const repo = makeRepo({
    findAorLevelById: async (_db, _tenantId, levelId) => {
      if (levelId === ('level-2' as UUID)) {
        return {
          id: levelId,
          projectId,
          tenantId,
          depth: 2,
          label: 'IWP',
          createdAt: new Date('2026-03-04T12:00:00Z'),
        };
      }

      return {
        id: 'level-0' as UUID,
        projectId,
        tenantId,
        depth: 0,
        label: 'AREA',
        createdAt: new Date('2026-03-04T12:00:00Z'),
      };
    },
    findAorNodeById: async () => ({
      id: 'parent-1' as UUID,
      projectId,
      tenantId,
      levelId: 'level-0' as UUID,
      parentId: null,
      name: 'Area 1',
      code: 'A1',
      createdAt: new Date('2026-03-04T12:00:00Z'),
    }),
  });

  await assert.rejects(
    () => createAorNode(repo, db, {
      tenantId,
      projectId,
      levelId: 'level-2' as UUID,
      parentId: 'parent-1' as UUID,
      name: 'IWP-1',
      code: 'IWP1',
      actorRole: 'PROJECT_ADMIN',
    }),
    ValidationError,
  );
});

test('createAorLevel rejects non-admin actors', async () => {
  const repo = makeRepo();

  await assert.rejects(
    () => createAorLevel(repo, db, {
      tenantId,
      projectId,
      depth: 0,
      label: 'UNIT',
      actorRole: 'REQUESTER' as never,
    }),
    ForbiddenError,
  );
});

test('createAorLevel allows TENANT_ADMIN actors', async () => {
  const saved: AorLevel[] = [];
  const repo = makeRepo({
    saveAorLevel: async (_db, level) => {
      saved.push(level);
    },
  });

  const level = await createAorLevel(repo, db, {
    tenantId,
    projectId,
    depth: 1,
    label: 'CWA',
    actorRole: 'TENANT_ADMIN',
  });

  assert.equal(level.label, 'CWA');
  assert.equal(saved.length, 1);
});
