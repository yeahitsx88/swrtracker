import test from 'node:test';
import assert from 'node:assert/strict';
import { ConflictError, ForbiddenError } from '@/shared/errors';
import {
  createProjectTemplate,
  deleteProjectTemplate,
  updateProjectTemplate,
} from '@/modules/tenancy/application/project-templates';
import type { ITenancyRepository } from '@/modules/tenancy/application/ports';
import type { AorAssignment, Department, DepartmentTitle } from '@/modules/tenancy/domain/types';
import type { DbClient, UUID } from '@/shared/types';

const tenantId = 'tenant-1' as UUID;
const actorId = 'user-1' as UUID;

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

const db: DbClient = {
  query: async () => ({ rows: [] }),
};

test('createProjectTemplate persists a tenant-admin template', async () => {
  const saved: Array<{ name: string; crewBuild: string }> = [];
  const repo = makeRepo({
    saveProjectTemplate: async (_db, template) => {
      saved.push({ name: template.name, crewBuild: template.crewBuild });
    },
  });

  const template = await createProjectTemplate(repo, db, {
    tenantId,
    actorId,
    actorRole: 'TENANT_ADMIN',
    name: 'Large Energy',
    crewBuild: 'FULL',
    aorDepth: 2,
    aorLevelLabels: ['UNIT', 'CWA'],
    disciplineGroups: ['QA/QC', 'Safety'],
  });

  assert.equal(template.name, 'Large Energy');
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0], { name: 'Large Energy', crewBuild: 'FULL' });
});

test('updateProjectTemplate edits an existing tenant-admin template', async () => {
  const updated: string[] = [];
  const repo = makeRepo({
    findProjectTemplateById: async () => ({
      id: 'template-1' as UUID,
      tenantId,
      name: 'Old Name',
      crewBuild: 'FULL',
      aorDepth: 2,
      aorLevelLabels: ['UNIT', 'CWA'],
      disciplineGroups: ['QA/QC'],
      createdBy: actorId,
      createdAt: new Date('2026-03-04T12:00:00Z'),
    }),
    updateProjectTemplate: async (_db, template) => {
      updated.push(template.name);
    },
  });

  const template = await updateProjectTemplate(repo, db, {
    tenantId,
    templateId: 'template-1' as UUID,
    actorRole: 'TENANT_ADMIN',
    name: 'New Name',
    crewBuild: 'SLIM',
    aorDepth: 1,
    aorLevelLabels: ['AREA'],
    disciplineGroups: ['Controls'],
  });

  assert.equal(template.name, 'New Name');
  assert.equal(template.crewBuild, 'SLIM');
  assert.deepEqual(updated, ['New Name']);
});

test('deleteProjectTemplate rejects deletion when projects still reference the template', async () => {
  const repo = makeRepo({
    findProjectTemplateById: async () => ({
      id: 'template-1' as UUID,
      tenantId,
      name: 'Large Energy',
      crewBuild: 'FULL',
      aorDepth: 2,
      aorLevelLabels: ['UNIT', 'CWA'],
      disciplineGroups: ['QA/QC'],
      createdBy: actorId,
      createdAt: new Date('2026-03-04T12:00:00Z'),
    }),
    findProjectsUsingTemplate: async () => [
      { id: 'project-1' as UUID, name: 'Project One' },
    ],
  });

  await assert.rejects(
    () => deleteProjectTemplate(repo, db, {
      tenantId,
      templateId: 'template-1' as UUID,
      actorRole: 'TENANT_ADMIN',
    }),
    ConflictError,
  );
});

test('createProjectTemplate rejects non-tenant-admin actors', async () => {
  const repo = makeRepo();

  await assert.rejects(
    () => createProjectTemplate(repo, db, {
      tenantId,
      actorId,
      actorRole: null,
      name: 'Large Energy',
      crewBuild: 'FULL',
      aorDepth: 2,
      aorLevelLabels: ['UNIT', 'CWA'],
      disciplineGroups: ['QA/QC'],
    }),
    ForbiddenError,
  );
});
