import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Client } from 'pg';

const sql = readFileSync('db/migrations/022_company_lifecycle_schema.sql', 'utf8');

test('company lifecycle migration defaults existing companies active and isolates project links',
  { skip: !process.env.DATABASE_URL }, async () => {
    const db = new Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    await db.query('BEGIN');
    try {
      const tenant = randomUUID(), otherTenant = randomUUID();
      const project = randomUUID(), otherProject = randomUUID();
      const company = randomUUID(), otherCompany = randomUUID();
      await db.query("INSERT INTO tenants(id,name) VALUES($1,'Lifecycle'),($2,'Other')",
        [tenant, otherTenant]);
      await db.query("INSERT INTO projects(id,tenant_id,name,status) VALUES($1,$2,'Site','SETUP'),($3,$4,'Other site','SETUP')",
        [project, tenant, otherProject, otherTenant]);
      await db.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'Vendor','SUBCONTRACTOR'),($3,$4,'Other vendor','SUBCONTRACTOR')",
        [company, tenant, otherCompany, otherTenant]);

      await db.query(sql);
      const { rows: companies } = await db.query<{ status: string }>(
        'SELECT status FROM companies WHERE id=$1', [company]);
      assert.equal(companies[0]?.status, 'ACTIVE');
      await db.query('INSERT INTO project_companies(tenant_id,project_id,company_id) VALUES($1,$2,$3)',
        [tenant, project, company]);
      await db.query("UPDATE companies SET status='INACTIVE' WHERE id=$1", [company]);

      await db.query('SAVEPOINT invalid_status');
      await assert.rejects(db.query("UPDATE companies SET status='UNKNOWN' WHERE id=$1", [company]),
        /companies_status_check/);
      await db.query('ROLLBACK TO SAVEPOINT invalid_status');

      await db.query('SAVEPOINT duplicate_link');
      await assert.rejects(db.query('INSERT INTO project_companies(tenant_id,project_id,company_id) VALUES($1,$2,$3)',
        [tenant, project, company]), /unique/);
      await db.query('ROLLBACK TO SAVEPOINT duplicate_link');

      await db.query('SAVEPOINT other_company');
      await assert.rejects(db.query('INSERT INTO project_companies(tenant_id,project_id,company_id) VALUES($1,$2,$3)',
        [tenant, project, otherCompany]), /foreign key/);
      await db.query('ROLLBACK TO SAVEPOINT other_company');

      await db.query('SAVEPOINT other_project');
      await assert.rejects(db.query('INSERT INTO project_companies(tenant_id,project_id,company_id) VALUES($1,$2,$3)',
        [tenant, otherProject, company]), /foreign key/);
      await db.query('ROLLBACK TO SAVEPOINT other_project');

      await db.query(sql);
      const { rows: links } = await db.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM project_companies WHERE tenant_id=$1', [tenant]);
      assert.equal(links[0]?.count, '1');
    } finally {
      await db.query('ROLLBACK');
      await db.end();
    }
  });
