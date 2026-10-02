import test from 'node:test';
import assert from 'node:assert/strict';
import { ForbiddenError } from '@/shared/errors';
import {
  removeTenantMembership,
  upsertTenantMembership,
} from '@/modules/tenancy/application/tenant-memberships';
import type { ITenancyRepository } from '@/modules/tenancy/application/ports';
import type { AorAssignment, Department, DepartmentTitle } from '@/modules/tenancy/domain/types';
import type { DbClient, UUID } from '@/shared/types';

const tenantId = 'tenant-1' as UUID;
const userId = 'user-1' as UUID;

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
  query: async<T extends object>(sql:string) => ({ rows:
    sql.includes('transaction_id')?[{transaction_id:'ordinary-membership-test'}] as T[]:
    sql.includes('FROM tenants')?[{id:tenantId}] as T[]:[] }),
};

test('upsertTenantMembership stores a tenant role for TENANT_ADMIN', async () => {
  const saved: string[] = [];
  const repo = makeRepo({
    saveTenantMembership: async (_db, membership) => {
      saved.push(membership.role);
    },
  });

  const membership = await upsertTenantMembership(repo, db, {
    tenantId,
    userId,
    role: 'BILLING_VIEWER',
    actorRole: 'TENANT_ADMIN',
  });

  assert.equal(membership.role, 'BILLING_VIEWER');
  assert.deepEqual(saved, ['BILLING_VIEWER']);
});

test('removeTenantMembership deletes a tenant role for TENANT_ADMIN', async () => {
  const removed: UUID[] = [];
  const repo = makeRepo({
    deleteTenantMembership: async (_db, _tenantId, targetUserId) => {
      removed.push(targetUserId);
    },
  });

  await removeTenantMembership(repo, db, {
    tenantId,
    userId,
    actorRole: 'TENANT_ADMIN',
  });

  assert.deepEqual(removed, [userId]);
});

test('upsertTenantMembership rejects non-tenant-admin actors', async () => {
  const repo = makeRepo();

  await assert.rejects(
    () => upsertTenantMembership(repo, db, {
      tenantId,
      userId,
      role: 'TENANT_ADMIN',
      actorRole: null,
    }),
    ForbiddenError,
  );
});

test('last eligible Central IT role cannot be removed or demoted',async()=>{
 let writes=0;
 const repo=makeRepo({saveTenantMembership:async()=>{writes++;},deleteTenantMembership:async()=>{writes++;}});
 const held:DbClient={query:async<T extends object>(sql:string)=>{
  if(sql.includes('transaction_id'))return{rows:[{transaction_id:'continuity-test'}] as T[]};
  if(sql.includes('FROM tenants'))return{rows:[{id:tenantId}] as T[]};
  return{rows:[{user_id:userId}] as T[]};
 }};
 await assert.rejects(upsertTenantMembership(repo,held,{tenantId,userId,role:'BILLING_VIEWER',actorRole:'TENANT_ADMIN'}),{type:'ConflictError'});
 await assert.rejects(removeTenantMembership(repo,held,{tenantId,userId,actorRole:'TENANT_ADMIN'}),{type:'ConflictError'});
 assert.equal(writes,0);
});