import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Client } from 'pg';
import { ConflictError, ForbiddenError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import { selfRegister } from '@/modules/identity/application/self-register';
import { UserRepository } from '@/modules/identity/infrastructure/user.repository';
import { SelfRegistrationAccessRepository } from '@/modules/tenancy/infrastructure/self-registration.repository';

test('self-registration binds domain, project and company and commits requester membership with its audit',
  { skip: !process.env.DATABASE_URL }, async () => {
    const db = new Client({ connectionString: process.env.DATABASE_URL });
    await db.connect(); await db.query('BEGIN');
    const id = () => randomUUID() as UUID;
    const tenantId = id(), otherTenant = id(), companyId = id(), otherCompany = id();
    const projectId = id(), anotherProject = id(), foreignProject = id(), admin = id();
    try {
      await db.query("INSERT INTO tenants(id,name) VALUES($1,'Registration'),($2,'Foreign')", [tenantId, otherTenant]);
      await db.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'GC','GC'),($3,$4,'Other','GC')",
        [companyId, tenantId, otherCompany, otherTenant]);
      await db.query("INSERT INTO users(id,tenant_id,company_id,email,name) VALUES($1,$2,$3,'admin@example.test','Admin')",
        [admin, tenantId, companyId]);
      await db.query(`INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES
        ($1,$2,'Project','ACTIVE','MEDIUM'),($3,$2,'Another','ACTIVE','MEDIUM'),($4,$5,'Foreign','ACTIVE','MEDIUM')`,
        [projectId, tenantId, anotherProject, foreignProject, otherTenant]);
      await db.query("INSERT INTO allowed_domains(tenant_id,company_id,domain,added_by) VALUES($1,$2,'example.test',$3)",
        [tenantId, companyId, admin]);
      const users = new UserRepository(), access = new SelfRegistrationAccessRepository();
      const params = { tenantId, projectId, email: 'worker@example.test', name: 'Worker', password: 'test-passphrase' };
      for (const overrides of [{ companyId: otherCompany }, { projectId: foreignProject },
        { tenantId: otherTenant }, { email: 'worker@unapproved.test' }]) {
        await assert.rejects(selfRegister(users, access, db, { ...params, ...overrides }), ForbiddenError);
      }
      await db.query('SAVEPOINT ambiguous_domain');
      await db.query("INSERT INTO allowed_domains(tenant_id,company_id,domain,added_by) VALUES($1,$2,'EXAMPLE.TEST',$3)",
        [tenantId, companyId, admin]);
      await assert.rejects(selfRegister(users, access, db, params), ForbiddenError);
      await db.query('ROLLBACK TO SAVEPOINT ambiguous_domain');
      await db.query("INSERT INTO allowed_domains(tenant_id,domain,added_by) VALUES($1,'unbound.test',$2)", [tenantId, admin]);
      await assert.rejects(selfRegister(users, access, db, { ...params, email: 'worker@unbound.test' }), ForbiddenError);
      for (const state of ['SETUP', 'ARCHIVED']) {
        await db.query('UPDATE projects SET status=$3 WHERE id=$1 AND tenant_id=$2', [projectId, tenantId, state]);
        await assert.rejects(selfRegister(users, access, db, params), ForbiddenError);
      }
      await db.query("UPDATE projects SET status='ACTIVE' WHERE id=$1 AND tenant_id=$2", [projectId, tenantId]);
      const user = await selfRegister(users, access, db, params);
      assert.equal(user.companyId, companyId);
      const membership = await db.query('SELECT project_id,role FROM project_memberships WHERE user_id=$1', [user.id]);
      assert.deepEqual(membership.rows, [{ project_id: projectId, role: 'REQUESTER' }]);
      const event = await db.query('SELECT actor_id,payload FROM tenant_events WHERE tenant_id=$1 AND event_type=$2',
        [tenantId, 'user.self_registered']);
      assert.deepEqual(event.rows, [{ actor_id: user.id, payload: { projectId, companyId, domain: 'example.test' } }]);
      await assert.rejects(selfRegister(users, access, db, params), ConflictError);

      await db.query('SAVEPOINT audit_failure');
      let attemptedUser: UUID | undefined;
      const auditFailure: DbClient = { async query(sql, values) {
        if (sql.includes('INSERT INTO users')) attemptedUser = values?.[0] as UUID;
        if (sql.includes('INSERT INTO tenant_events')) return db.query('SELECT 1/0');
        return db.query(sql, values);
      } };
      await assert.rejects(selfRegister(users, access, auditFailure, { ...params, email: 'rollback@example.test' }), /division by zero/);
      await db.query('ROLLBACK TO SAVEPOINT audit_failure');
      assert.ok(attemptedUser);
      assert.equal((await db.query('SELECT id FROM users WHERE tenant_id=$1 AND id=$2', [tenantId, attemptedUser])).rows.length, 0);
      assert.equal((await db.query('SELECT id FROM project_memberships WHERE project_id=$1 AND user_id=$2', [projectId, attemptedUser])).rows.length, 0);
    } finally { await db.query('ROLLBACK'); await db.end(); }
  });
