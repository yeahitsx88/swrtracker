import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { ForbiddenError } from '@/shared/errors';
import { createArea } from '@/modules/tenancy/application/create-area';
import { createCompany as createCompanyUseCase } from '@/modules/tenancy/application/create-company';
import { createProject as createProjectUseCase } from '@/modules/tenancy/application/create-project';
import { createSubarea } from '@/modules/tenancy/application/create-subarea';
import { addProjectMember } from '@/modules/tenancy/application/add-project-member';
import { addToWhitelist, removeFromWhitelist } from '@/modules/tenancy/application/whitelist';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import {
  createArea as createAreaFixture,
  createCompany,
  createProject,
  createSubarea as createSubareaFixture,
  createTenant,
  createUser,
} from '../setup/fixtures';
import { query } from '../setup/db';
import { resetDatabase } from '../setup/migrate';

const repo = new TenancyRepository();

beforeEach(async () => {
  await resetDatabase();
});

test('tenant admin can create project, company, area, subarea, member, and whitelist entries', async () => {
  const tenant = await createTenant();
  const company = await createCompany({ tenantId: tenant.id });
  const project = await createProject({ tenantId: tenant.id });
  const adminUser = await createUser({ tenantId: tenant.id, companyId: company.id });
  const targetUser = await createUser({ tenantId: tenant.id, companyId: company.id });

  const createdProject = await createProjectUseCase(repo, { query }, {
    tenantId: tenant.id,
    name: 'Admin Project',
    actorRole: 'TENANT_ADMIN',
  });
  assert.equal(createdProject.name, 'Admin Project');

  const createdCompany = await createCompanyUseCase(repo, { query }, {
    tenantId: tenant.id,
    name: 'Admin Company',
    type: 'SUBCONTRACTOR',
    actorRole: 'TENANT_ADMIN',
  });
  assert.equal(createdCompany.type, 'SUBCONTRACTOR');

  const createdArea = await createArea(repo, { query }, {
    tenantId: tenant.id,
    projectId: project.id,
    name: 'Unit 9',
    code: 'u9',
    actorRole: 'TENANT_ADMIN',
  });
  assert.equal(createdArea.code, 'U9');

  const createdSubarea = await createSubarea(repo, { query }, {
    tenantId: tenant.id,
    projectId: project.id,
    areaId: createdArea.id,
    name: 'Unit 9A',
    actorRole: 'TENANT_ADMIN',
  });
  assert.equal(createdSubarea.areaId, createdArea.id);

  await assert.doesNotReject(() =>
    addProjectMember(repo, { query }, {
      tenantId: tenant.id,
      projectId: project.id,
      userId: targetUser.id,
      role: 'AREA_VIEWER',
      actorRole: 'TENANT_ADMIN',
    }),
  );

  const { rows: membershipRows } = await query<{ role: string }>(
    `SELECT role FROM project_memberships
     WHERE project_id = $1 AND user_id = $2`,
    [project.id, targetUser.id],
  );
  assert.equal(membershipRows[0]?.role, 'AREA_VIEWER');

  const whitelistEntry = await addToWhitelist(repo, { query }, {
    tenantId: tenant.id,
    projectId: project.id,
    email: 'vip@example.com',
    addedBy: adminUser.id,
    actorRole: 'TENANT_ADMIN',
  });
  assert.equal(whitelistEntry.email, 'vip@example.com');

  await removeFromWhitelist(repo, { query }, {
    tenantId: tenant.id,
    projectId: project.id,
    email: 'vip@example.com',
    actorRole: 'TENANT_ADMIN',
  });

  const { rows: whitelistRows } = await query<{ email: string }>(
    `SELECT email FROM priority_whitelist
     WHERE tenant_id = $1 AND project_id = $2`,
    [tenant.id, project.id],
  );
  assert.equal(whitelistRows.length, 0);
});

test('non-admin tenant roles and null role are rejected for admin tenancy actions', async () => {
  const tenant = await createTenant();
  const company = await createCompany({ tenantId: tenant.id });
  const project = await createProject({ tenantId: tenant.id });
  const area = await createAreaFixture({ tenantId: tenant.id, projectId: project.id });
  const targetUser = await createUser({ tenantId: tenant.id, companyId: company.id });

  await assert.rejects(
    () => createProjectUseCase(repo, { query }, {
      tenantId: tenant.id,
      name: 'Blocked Project',
      actorRole: 'BILLING_VIEWER',
    }),
    ForbiddenError,
  );
  await assert.rejects(
    () => createCompanyUseCase(repo, { query }, {
      tenantId: tenant.id,
      name: 'Blocked Company',
      type: 'GC',
      actorRole: null,
    }),
    ForbiddenError,
  );
  await assert.rejects(
    () => createArea(repo, { query }, {
      tenantId: tenant.id,
      projectId: project.id,
      name: 'Blocked Area',
      code: 'BA',
      actorRole: 'BILLING_VIEWER',
    }),
    ForbiddenError,
  );
  await assert.rejects(
    () => createSubarea(repo, { query }, {
      tenantId: tenant.id,
      projectId: project.id,
      areaId: area.id,
      name: 'Blocked Subarea',
      actorRole: null,
    }),
    ForbiddenError,
  );
  await assert.rejects(
    () => addProjectMember(repo, { query }, {
      tenantId: tenant.id,
      projectId: project.id,
      userId: targetUser.id,
      role: 'REQUESTER',
      actorRole: 'BILLING_VIEWER',
    }),
    ForbiddenError,
  );
  await assert.rejects(
    () => addToWhitelist(repo, { query }, {
      tenantId: tenant.id,
      projectId: project.id,
      email: 'blocked@example.com',
      addedBy: targetUser.id,
      actorRole: null,
    }),
    ForbiddenError,
  );
});
