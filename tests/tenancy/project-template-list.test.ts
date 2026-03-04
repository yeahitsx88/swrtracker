import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '@/shared/errors';
import { listProjectTemplates } from '@/modules/tenancy/application/list-project-templates';
import type {
  ITenancyRepository,
  ProjectTemplateListItem,
} from '@/modules/tenancy/application/ports';
import {
  handleGetProjectTemplates,
  type ProjectTemplatesRouteDeps,
} from '@/app/api/project-templates/route';
import type {
  AorAssignment,
  AorLevel,
  AorNode,
  Area,
  Department,
  DepartmentMembership,
  DepartmentTitle,
  PriorityWhitelistEntry,
  ProjectTemplate,
  Subarea,
  TenantMembership,
} from '@/modules/tenancy/domain/types';
import type { DbClient, UUID } from '@/shared/types';

const tenantId = 'tenant-1' as UUID;
const actorId = 'user-1' as UUID;

function makeTemplateListItem(
  overrides?: Partial<ProjectTemplateListItem>,
): ProjectTemplateListItem {
  return {
    id: 'template-1' as UUID,
    name: 'Large Energy',
    crewBuild: 'FULL',
    aorDepth: 4,
    aorLevelCount: 4,
    disciplineGroupCount: 3,
    usageCount: 2,
    createdAt: new Date('2026-03-04T12:00:00Z'),
    ...overrides,
  };
}

function makeRepo(overrides?: Partial<ITenancyRepository>): ITenancyRepository {
  return {
    saveTenant: async () => undefined,
    saveCompany: async () => undefined,
    saveProject: async () => undefined,
    findProjectById: async () => null,
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

function makeDeps(
  repo: ITenancyRepository,
  actorRole: 'TENANT_ADMIN' | null,
): ProjectTemplatesRouteDeps {
  return {
    requireAuth: () => ({
      tenantId,
      userId: actorId,
    }),
    getTenantRole: async () => actorRole,
    createRepo: () => repo,
  };
}

test('listProjectTemplates returns tenant template summaries with usage counts', async () => {
  const repo = makeRepo({
    listProjectTemplates: async () => [
      makeTemplateListItem(),
      makeTemplateListItem({
        id: 'template-2' as UUID,
        name: 'Commercial Lot',
        crewBuild: 'SLIM',
        aorDepth: 1,
        aorLevelCount: 1,
        disciplineGroupCount: 1,
        usageCount: 0,
      }),
    ],
  });

  const templates = await listProjectTemplates(repo, db, {
    tenantId,
    actorRole: 'TENANT_ADMIN',
  });

  assert.equal(templates.length, 2);
  assert.equal(templates[0]?.usageCount, 2);
  assert.equal(templates[1]?.disciplineGroupCount, 1);
});

test('listProjectTemplates rejects non-tenant-admin actors', async () => {
  await assert.rejects(
    () => listProjectTemplates(makeRepo(), db, {
      tenantId,
      actorRole: null,
    }),
    ForbiddenError,
  );
});

test('handleGetProjectTemplates returns the template list for tenant admins', async () => {
  const repo = makeRepo({
    listProjectTemplates: async () => [
      makeTemplateListItem(),
    ],
  });

  const response = await handleGetProjectTemplates(
    new NextRequest('http://localhost/api/project-templates', { method: 'GET' }),
    makeDeps(repo, 'TENANT_ADMIN'),
  );

  assert.equal(response.status, 200);
  const json = await response.json() as { templates: ProjectTemplateListItem[] };
  assert.equal(json.templates.length, 1);
  assert.equal(json.templates[0]?.aorLevelCount, 4);
  assert.equal(json.templates[0]?.usageCount, 2);
});

test('handleGetProjectTemplates returns 403 for non-tenant-admin actors', async () => {
  const response = await handleGetProjectTemplates(
    new NextRequest('http://localhost/api/project-templates', { method: 'GET' }),
    makeDeps(makeRepo(), null),
  );

  assert.equal(response.status, 403);
});
