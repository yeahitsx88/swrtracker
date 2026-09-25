import assert from 'node:assert/strict';
import test from 'node:test';
import { ConflictError, ForbiddenError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ITenancyRepository } from '@/modules/tenancy/application/ports';
import { createProject } from '@/modules/tenancy/application/create-project';
import { createCompany } from '@/modules/tenancy/application/create-company';
import { createAorNode } from '@/modules/tenancy/application/create-aor-node';
import { assignCompanyDomain } from '@/modules/tenancy/application/assign-company-domain';
import { addToWhitelist, removeFromWhitelist } from '@/modules/tenancy/application/whitelist';
import { activateProject } from '@/modules/tenancy/application/activate-project';

const tenantId = '00000000-0000-0000-0000-000000000001' as UUID;
const projectId = '00000000-0000-0000-0000-000000000002' as UUID;
const db: DbClient = { async query() { return { rows: [] }; } };

test('non-admin cannot create shared tenancy resources', async () => {
  let saved = false;
  const repo = {
    saveProject: async () => { saved = true; },
    saveCompany: async () => { saved = true; },
    saveAorNode: async () => { saved = true; },
    findProjectById: async () => ({ id: projectId, tenantId }),
  } as unknown as ITenancyRepository;
  await assert.rejects(createProject(repo, db, {
    tenantId, name: 'Project', crewBuild: 'MEDIUM', actorRole: 'BILLING_VIEWER',
  }), ForbiddenError);
  await assert.rejects(createCompany(repo, db, {
    tenantId, name: 'Subcontractor', type: 'SUBCONTRACTOR', actorRole: 'BILLING_VIEWER',
  }), ForbiddenError);
  await assert.rejects(createAorNode(repo, db, {
    tenantId, projectId, actorId: tenantId, levelId: projectId,
    parentId: null, name: 'Area', code: 'A1', actorRole: 'REQUESTER',
  }), ForbiddenError);
  assert.equal(saved, false);
});

test('authorized project creation starts in SETUP', async () => {
  let savedStatus = '';
  const repo = {
    saveProject: async (_db: DbClient, project: { status: string }) => { savedStatus = project.status; },
  } as unknown as ITenancyRepository;
  const project = await createProject(repo, db, {
    tenantId, name: 'Project', crewBuild: 'MEDIUM', actorRole: 'TENANT_ADMIN',
  });
  assert.equal(project.status, 'SETUP');
  assert.equal(savedStatus, 'SETUP');
});

test('only a tenant admin can bind a company domain and the event follows the write', async () => {
  const writes: string[] = [];
  const repo = {
    assignCompanyDomain: async () => { writes.push('domain'); return true; },
    appendTenantEvent: async () => { writes.push('event'); },
  } as unknown as ITenancyRepository;
  await assert.rejects(assignCompanyDomain(repo, db, {
    tenantId, companyId: projectId, actorId: tenantId,
    actorRole: 'BILLING_VIEWER', domain: 'example.com',
  }), ForbiddenError);
  assert.deepEqual(writes, []);
  const domain = await assignCompanyDomain(repo, db, {
    tenantId, companyId: projectId, actorId: tenantId,
    actorRole: 'TENANT_ADMIN', domain: 'Example.com',
  });
  assert.equal(domain, 'example.com');
  assert.deepEqual(writes, ['domain', 'event']);
});

test('whitelist writes emit tenant events and archived projects reject changes', async () => {
  const writes: string[] = [];
  let status: 'ACTIVE' | 'ARCHIVED' = 'ACTIVE';
  const repo = {
    findProjectById: async () => ({ status }),
    saveWhitelistEntry: async () => { writes.push('insert'); return true; },
    deleteWhitelistEntry: async () => { writes.push('delete'); return true; },
    appendTenantEvent: async () => { writes.push('event'); },
  } as unknown as ITenancyRepository;
  await addToWhitelist(repo, db, {
    tenantId, projectId, email: 'Person@Example.com', addedBy: tenantId,
    actorRole: 'TENANT_ADMIN',
  });
  await removeFromWhitelist(repo, db, {
    tenantId, projectId, email: 'Person@Example.com', actorId: tenantId,
    actorRole: 'TENANT_ADMIN',
  });
  assert.deepEqual(writes, ['insert', 'event', 'delete', 'event']);
  status = 'ARCHIVED';
  await assert.rejects(addToWhitelist(repo, db, {
    tenantId, projectId, email: 'Person@Example.com', addedBy: tenantId,
    actorRole: 'TENANT_ADMIN',
  }), ConflictError);
  assert.equal(writes.length, 4);
});

test('activation requires readiness, explicit warning acknowledgement, and an audit event', async () => {
  const writes: string[] = [];
  const facts = {
    crewBuild: 'FULL' as const, aorLevels: 1, aorNodes: 1,
    surveyManagers: 1, superintendentAorAssignments: 1,
    departments: 0, actingSurveyManagers: 0, allowedDomains: 0,
  };
  const repo = {
    findProjectById: async () => ({ status: 'SETUP' }),
    getProjectReadinessFacts: async () => facts,
    activateProject: async () => { writes.push('activate'); return true; },
    appendTenantEvent: async () => { writes.push('event'); },
  } as unknown as ITenancyRepository;
  const params = {
    tenantId, projectId, actorId: tenantId,
    actorRole: 'PROJECT_ADMIN' as const, acknowledgeWarnings: false,
  };
  await assert.rejects(activateProject(repo, db, params), ConflictError);
  assert.deepEqual(writes, []);
  const result = await activateProject(repo, db, { ...params, acknowledgeWarnings: true });
  assert.equal(result.warnings.length, 3);
  assert.deepEqual(writes, ['activate', 'event']);
  await assert.rejects(activateProject(repo, db, {
    ...params, actorRole: 'VIEWER', acknowledgeWarnings: true,
  }), ForbiddenError);
});
