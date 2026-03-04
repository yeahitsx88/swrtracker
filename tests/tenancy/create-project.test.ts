import test from 'node:test';
import assert from 'node:assert/strict';
import { ForbiddenError, ValidationError } from '@/shared/errors';
import { createProject } from '@/modules/tenancy/application/create-project';
import type { ITenancyRepository } from '@/modules/tenancy/application/ports';
import type {
  AorAssignment,
  Department,
  DepartmentTitle,
  ProjectTemplate,
  TenantMembership,
} from '@/modules/tenancy/domain/types';
import type { DbClient, UUID } from '@/shared/types';

const tenantId = 'tenant-1' as UUID;

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

const db: DbClient = {
  query: async () => ({ rows: [] }),
};

test('createProject requires TENANT_ADMIN', async () => {
  const repo = makeRepo();

  await assert.rejects(
    () => createProject(repo, db, {
      tenantId,
      name: 'Phase 2 Project',
      actorRole: null,
      crewBuild: 'FULL',
    }),
    ForbiddenError,
  );
});

test('createProject creates projects in SETUP status with an explicit crew build', async () => {
  const saved: Array<{ status: string; name: string; crewBuild: string; templateId: UUID | null }> = [];
  const repo = makeRepo({
    saveProject: async (_db, project) => {
      saved.push({
        status: project.status,
        name: project.name,
        crewBuild: project.crewBuild,
        templateId: project.templateId,
      });
    },
  });

  const project = await createProject(repo, db, {
    tenantId,
    name: 'Phase 2 Project',
    actorRole: 'TENANT_ADMIN',
    crewBuild: 'MEDIUM',
  });

  assert.equal(project.status, 'SETUP');
  assert.equal(project.crewBuild, 'MEDIUM');
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0], {
    status: 'SETUP',
    name: 'Phase 2 Project',
    crewBuild: 'MEDIUM',
    templateId: null,
  });
});

test('createProject derives crewBuild from the selected template', async () => {
  const repo = makeRepo({
    findProjectTemplateById: async () => ({
      id: 'template-1' as UUID,
      tenantId,
      name: 'Large Energy',
      crewBuild: 'FULL',
      aorDepth: 2,
      aorLevelLabels: ['UNIT', 'CWA'],
      disciplineGroups: ['SURVEY'],
      createdBy: 'user-1' as UUID,
      createdAt: new Date('2026-03-04T12:00:00Z'),
    }),
  });

  const project = await createProject(repo, db, {
    tenantId,
    name: 'Template Project',
    actorRole: 'TENANT_ADMIN',
    templateId: 'template-1' as UUID,
  });

  assert.equal(project.crewBuild, 'FULL');
  assert.equal(project.templateId, 'template-1');
});

test('createProject rejects a crewBuild that conflicts with the selected template', async () => {
  const repo = makeRepo({
    findProjectTemplateById: async () => ({
      id: 'template-1' as UUID,
      tenantId,
      name: 'Large Energy',
      crewBuild: 'FULL',
      aorDepth: 2,
      aorLevelLabels: ['UNIT', 'CWA'],
      disciplineGroups: ['SURVEY'],
      createdBy: 'user-1' as UUID,
      createdAt: new Date('2026-03-04T12:00:00Z'),
    }),
  });

  await assert.rejects(
    () => createProject(repo, db, {
      tenantId,
      name: 'Template Project',
      actorRole: 'TENANT_ADMIN',
      crewBuild: 'SLIM',
      templateId: 'template-1' as UUID,
    }),
    ValidationError,
  );
});
