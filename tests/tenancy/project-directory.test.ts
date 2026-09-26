import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Client } from 'pg';
import type { UUID } from '@/shared/types';
import { listAccessibleProjects } from '@/modules/tenancy/application/project-directory';
import { ProjectDirectoryRepository } from '@/modules/tenancy/infrastructure/project-directory.repository';

test('project directory scopes memberships, tenant administration, lifecycle and pagination',
  { skip: !process.env.DATABASE_URL }, async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect(); await db.query('BEGIN');
  const id = () => randomUUID() as UUID;
  const tenant = id(), foreign = id(), company = id(), user = id(), admin = id();
  const active = id(), archived = id(), setup = id(), hidden = id(), outside = id();
  try {
    await db.query("INSERT INTO tenants(id,name) VALUES($1,'Directory'),($2,'Foreign')", [tenant, foreign]);
    await db.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'GC','GC')", [company, tenant]);
    await db.query(`INSERT INTO users(id,tenant_id,company_id,email,name) VALUES
      ($1,$3,$4,'member@example.test','Member'),($2,$3,$4,'admin@example.test','Admin')`, [user, admin, tenant, company]);
    await db.query(`INSERT INTO projects(id,tenant_id,name,status) VALUES
      ($1,$6,'A','ACTIVE'),($2,$6,'B','ARCHIVED'),($3,$6,'C','SETUP'),
      ($4,$6,'D','ACTIVE'),($5,$7,'E','ACTIVE')`, [active, archived, setup, hidden, outside, tenant, foreign]);
    await db.query(`INSERT INTO project_memberships(project_id,user_id,role) VALUES
      ($1,$4,'REQUESTER'),($2,$4,'REQUESTER'),($3,$4,'PROJECT_ADMIN')`,
      [active, archived, setup, user]);
    await db.query("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'TENANT_ADMIN')", [tenant, admin]);
    const repo = new ProjectDirectoryRepository();
    const params = { tenantId: tenant, userId: user, limit: 2, offset: 0 };
    const first = await listAccessibleProjects(repo, db, params);
    assert.deepEqual(first.projects.map(p => p.id), [active, archived]);
    assert.equal(first.hasMore, true);
    assert.equal(first.canViewAudit, false);
    assert.deepEqual(first.projects[0]!.roles, ['REQUESTER']);
    assert.equal(first.projects[0]!.canRequest, true);
    assert.equal(first.projects[1]!.canRequest, false);
    assert.equal(first.projects[1]!.canViewRequests, true);
    const last = await listAccessibleProjects(repo, db, { ...params, offset: 2 });
    assert.deepEqual(last.projects.map(p => p.id), [setup]);
    assert.equal(last.projects[0]!.canViewRequests, false);
    assert.equal(last.hasMore, false);
    const all = await listAccessibleProjects(repo, db, { ...params, userId: admin, limit: 100 });
    assert.deepEqual(all.projects.map(p => p.id), [active, archived, setup, hidden]);
    assert.ok(all.projects.every(p => !p.canRequest));
    assert.equal(all.canViewAudit, true);
    assert.deepEqual((await listAccessibleProjects(repo, db, { ...params, tenantId: foreign })).projects, []);
    await db.query('DELETE FROM project_memberships WHERE user_id=$1 AND project_id=$2', [user, active]);
    assert.ok((await listAccessibleProjects(repo, db, params)).projects.every(p => p.id !== active));
    await db.query('UPDATE users SET deactivated_at=NOW() WHERE id=$1', [admin]);
    assert.deepEqual((await listAccessibleProjects(repo, db, { ...params, userId: admin })).projects, []);
    for (const overrides of [{ limit: 0 }, { limit: 101 }, { offset: -1 }, { offset: 0.5 }]) {
      await assert.rejects(listAccessibleProjects(repo, db, { ...params, ...overrides }), /Invalid pagination/);
    }
  } finally { await db.query('ROLLBACK'); await db.end(); }
});
