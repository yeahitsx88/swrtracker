/**
 * One-time operator bootstrap for an empty tenant. This is deliberately a CLI,
 * not a public API route. DATABASE_URL and the BOOTSTRAP_* values are supplied
 * by the operator; the password is never printed.
 */
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import type { UUID } from '@/shared/types';
import { createTenant } from '@/modules/tenancy/application/create-tenant';
import { createUser } from '@/modules/identity/application/create-user';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import { UserRepository } from '@/modules/identity/infrastructure/user.repository';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main(): Promise<void> {
  const connectionString = required('DATABASE_URL');
  const tenantName = required('BOOTSTRAP_TENANT_NAME');
  const companyName = required('BOOTSTRAP_COMPANY_NAME');
  const adminName = required('BOOTSTRAP_ADMIN_NAME');
  const email = required('BOOTSTRAP_ADMIN_EMAIL').toLowerCase();
  // Passwords are opaque secrets: trimming changes the credential being stored.
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!password) throw new Error('BOOTSTRAP_ADMIN_PASSWORD is required');
  if (tenantName.length > 200 || companyName.length > 200 || adminName.length > 200 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
      password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('Bootstrap names, email, or password failed validation');
  }

  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query('BEGIN');
    const tenant = await createTenant(new TenancyRepository(), client, { name: tenantName });
    const companyId = randomUUID() as UUID;
    await client.query(
      `INSERT INTO companies (id, tenant_id, name, type) VALUES ($1, $2, $3, 'GC')`,
      [companyId, tenant.id, companyName],
    );
    const admin = await createUser(new UserRepository(), client, {
      tenantId: tenant.id, companyId, email, password, name: adminName,
    });
    await client.query(
      `INSERT INTO tenant_memberships (tenant_id, user_id, role)
       VALUES ($1, $2, 'TENANT_ADMIN')`,
      [tenant.id, admin.id],
    );
    await client.query('COMMIT');
    process.stdout.write(JSON.stringify({
      tenantId: tenant.id, companyId, adminUserId: admin.id,
    }) + '\n');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
