import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Client } from 'pg';
import type { UUID } from '@/shared/types';
import { createDepartment } from '@/modules/tenancy/application/create-department';
import {
  addDepartmentMember, addDepartmentTitle, assignDepartmentTitle,
} from '@/modules/tenancy/application/manage-department';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';

const id = () => randomUUID() as UUID;

test('PostgreSQL department setup binds project, title, AOR scope, and audit event',
  { skip: !process.env.DATABASE_URL }, async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query('BEGIN');
    try {
      const tenantId = id();
      const projectId = id();
      const companyId = id();
      const adminId = id();
      const managerId = id();
      const memberId = id();
      const levelId = id();
      const nodeId = id();
      await client.query('INSERT INTO tenants (id, name) VALUES ($1, $2)',
        [tenantId, 'Department setup test']);
      await client.query(
        "INSERT INTO companies (id, tenant_id, name, type) VALUES ($1,$2,'GC','GC')",
        [companyId, tenantId]);
      await client.query(
        `INSERT INTO users (id, tenant_id, company_id, email, password_hash, name)
         VALUES ($1,$4,$5,'department-admin@example.com','fixture','Admin'),
                ($2,$4,$5,'department-manager@example.com','fixture','Manager'),
                ($3,$4,$5,'department-member@example.com','fixture','Member')`,
        [adminId, managerId, memberId, tenantId, companyId]);
      await client.query(
        "INSERT INTO projects (id, tenant_id, name, status, crew_build) VALUES ($1,$2,'Project','SETUP','MEDIUM')",
        [projectId, tenantId]);
      await client.query(
        "INSERT INTO aor_levels (id, project_id, tenant_id, depth, label) VALUES ($1,$2,$3,0,'UNIT')",
        [levelId, projectId, tenantId]);
      await client.query(
        "INSERT INTO aor_nodes (id, project_id, tenant_id, level_id, name, code) VALUES ($1,$2,$3,$4,'Unit One','U1')",
        [nodeId, projectId, tenantId, levelId]);
      await client.query(
        `INSERT INTO project_memberships (project_id, user_id, role) VALUES
         ($1,$2,'PROJECT_ADMIN'), ($1,$3,'DEPARTMENT_MANAGER'), ($1,$4,'REQUESTER')`,
        [projectId, adminId, managerId, memberId]);

      const department = await createDepartment(new TenancyRepository(), client, {
        tenantId, projectId, actorId: adminId, actorRole: 'PROJECT_ADMIN',
        name: 'Civil', managerTitle: 'Civil Manager', aorNodeIds: [nodeId],
      });
      const repo = new TenancyRepository();
      for (const userId of [managerId, memberId]) {
        await addDepartmentMember(repo, client, {
          tenantId, projectId, departmentId: department.id,
          actorId: adminId, actorRole: 'PROJECT_ADMIN', userId,
        });
      }
      await assignDepartmentTitle(repo, client, {
        tenantId, projectId, departmentId: department.id,
        actorId: adminId, actorRole: 'PROJECT_ADMIN',
        userId: managerId, title: 'Civil Manager',
      });
      await addDepartmentTitle(repo, client, {
        tenantId, projectId, departmentId: department.id,
        actorId: managerId, actorRole: 'DEPARTMENT_MANAGER',
        title: 'Civil Superintendent', defaultPriority: 'MED_HIGH',
        assignmentLayer: 'MANAGER',
      });
      await assignDepartmentTitle(repo, client, {
        tenantId, projectId, departmentId: department.id,
        actorId: managerId, actorRole: 'DEPARTMENT_MANAGER',
        userId: memberId, title: 'Civil Superintendent',
      });
      const { rows } = await client.query<{
        title: string; default_priority: string; assignment_layer: string;
        aor_node_id: UUID; event_type: string;
      }>(
        `SELECT dt.title, dt.default_priority, dt.assignment_layer,
                aa.aor_node_id, te.event_type
         FROM departments d
         JOIN department_titles dt ON dt.department_id=d.id AND dt.tenant_id=d.tenant_id
         JOIN aor_assignments aa ON aa.department_id=d.id AND aa.tenant_id=d.tenant_id
         JOIN tenant_events te ON te.tenant_id=d.tenant_id
           AND te.event_type='department.created'
         WHERE d.id=$1 AND d.project_id=$2 AND d.tenant_id=$3
           AND dt.title='Civil Manager'`,
        [department.id, projectId, tenantId]);
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.title, 'Civil Manager');
      assert.equal(rows[0]?.default_priority, 'MED_HIGH');
      assert.equal(rows[0]?.assignment_layer, 'MANAGER');
      assert.equal(rows[0]?.aor_node_id, nodeId);
      assert.equal(rows[0]?.event_type, 'department.created');
      const { rows: members } = await client.query<{ user_id: UUID; title: string }>(
        `SELECT user_id, title FROM department_memberships
         WHERE tenant_id=$1 AND project_id=$2 AND department_id=$3
         ORDER BY title`, [tenantId, projectId, department.id]);
      assert.equal(members.length, 2);
      assert.ok(members.some((m) => m.user_id === managerId && m.title === 'Civil Manager'));
      assert.ok(members.some((m) => m.user_id === memberId && m.title === 'Civil Superintendent'));
      const { rows: eventRows } = await client.query<{ event_type: string }>(
        `SELECT event_type FROM tenant_events WHERE tenant_id=$1
         AND event_type LIKE 'department.%'`, [tenantId]);
      assert.equal(eventRows.filter((e) => e.event_type === 'department.member_added').length, 2);
      assert.equal(eventRows.filter((e) => e.event_type === 'department.title_assigned').length, 2);
      assert.equal(eventRows.filter((e) => e.event_type === 'department.title_catalog_updated').length, 1);
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });
