import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { ForbiddenError } from '@/shared/errors';
import { getProjectRole } from '@/lib/get-project-role';
import { getTenantRole } from '@/lib/get-tenant-role';
import {
  addProjectMembership,
  createCompany,
  createProject,
  createTenant,
  createTenantMembership,
  createUser,
} from '../setup/fixtures';
import { resetDatabase } from '../setup/migrate';
import { query } from '../setup/db';

beforeEach(async () => {
  await resetDatabase();
});

test('tenant roles resolve separately from project roles', async () => {
  const tenant = await createTenant();
  const company = await createCompany({ tenantId: tenant.id });
  const project = await createProject({ tenantId: tenant.id });
  const adminUser = await createUser({ tenantId: tenant.id, companyId: company.id });
  const requesterUser = await createUser({ tenantId: tenant.id, companyId: company.id });

  await createTenantMembership({
    tenantId: tenant.id,
    userId: adminUser.id,
    role: 'TENANT_ADMIN',
  });
  await addProjectMembership({
    projectId: project.id,
    userId: requesterUser.id,
    role: 'REQUESTER',
  });

  const adminTenantRole = await getTenantRole({ query }, tenant.id, adminUser.id);
  const requesterTenantRole = await getTenantRole({ query }, tenant.id, requesterUser.id);
  const requesterProjectRole = await getProjectRole({ query }, tenant.id, project.id, requesterUser.id);

  assert.equal(adminTenantRole, 'TENANT_ADMIN');
  assert.equal(requesterTenantRole, null);
  assert.equal(requesterProjectRole, 'REQUESTER');
  await assert.rejects(
    () => getProjectRole({ query }, tenant.id, project.id, adminUser.id),
    ForbiddenError,
  );
});

test('billing viewer resolves as tenant-only role', async () => {
  const tenant = await createTenant();
  const company = await createCompany({ tenantId: tenant.id });
  const billingViewer = await createUser({ tenantId: tenant.id, companyId: company.id });

  await createTenantMembership({
    tenantId: tenant.id,
    userId: billingViewer.id,
    role: 'BILLING_VIEWER',
  });

  const role = await getTenantRole({ query }, tenant.id, billingViewer.id);
  assert.equal(role, 'BILLING_VIEWER');
});
