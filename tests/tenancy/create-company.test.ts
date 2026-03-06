import test from 'node:test';
import assert from 'node:assert/strict';
import { ForbiddenError, ValidationError } from '@/shared/errors';
import { createCompany } from '@/modules/tenancy/application/create-company';
import type { ITenancyRepository } from '@/modules/tenancy/application/ports';
import type { Company } from '@/modules/tenancy/domain/types';
import type { DbClient, UUID } from '@/shared/types';

const tenantId = 'tenant-1' as UUID;
const db: DbClient = { query: async () => ({ rows: [] }) };

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
    saveAorAssignment: async () => undefined,
    findAorAssignmentById: async () => null,
    deactivateAorAssignment: async () => undefined,
    findDepartmentById: async () => null,
    saveDepartment: async () => undefined,
    listDepartments: async () => [],
    saveDepartmentTitle: async () => undefined,
    upsertDepartmentTitle: async () => undefined,
    listDepartmentTitles: async () => [],
    findDepartmentTitleByName: async () => null,
    saveDepartmentMembership: async () => undefined,
    findDepartmentMembershipByUser: async () => null,
    updateDepartmentMembership: async () => undefined,
    saveArea: async () => undefined,
    findAreaById: async () => null,
    saveSubarea: async () => undefined,
    saveMembership: async () => undefined,
    bumpUserSessionVersion: async () => undefined,
    saveWhitelistEntry: async () => undefined,
    deleteWhitelistEntry: async () => undefined,
    isEmailWhitelisted: async () => false,
    ...overrides,
  };
}

test('createCompany requires TENANT_ADMIN', async () => {
  await assert.rejects(
    () => createCompany(makeRepo(), db, {
      tenantId,
      name: 'GC Prime',
      type: 'GC',
      actorRole: null,
    }),
    ForbiddenError,
  );
});

test('createCompany validates the company name', async () => {
  await assert.rejects(
    () => createCompany(makeRepo(), db, {
      tenantId,
      name: '   ',
      type: 'GC',
      actorRole: 'TENANT_ADMIN',
    }),
    ValidationError,
  );
});

test('createCompany persists a tenant-scoped company for TENANT_ADMIN', async () => {
  const saved: Company[] = [];
  const repo = makeRepo({
    saveCompany: async (_db, company) => {
      saved.push(company);
    },
  });

  const company = await createCompany(repo, db, {
    tenantId,
    name: '  GC Prime  ',
    type: 'GC',
    actorRole: 'TENANT_ADMIN',
  });

  assert.equal(saved.length, 1);
  assert.equal(saved[0]?.name, 'GC Prime');
  assert.equal(company.tenantId, tenantId);
});
