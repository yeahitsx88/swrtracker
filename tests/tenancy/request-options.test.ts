import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Client } from 'pg';
import { NotFoundError } from '@/shared/errors';
import type { UUID } from '@/shared/types';
import { getRequestOptions } from
  '@/modules/tenancy/application/request-options';
import { RequestOptionsRepository } from
  '@/modules/tenancy/infrastructure/request-options.repository';
import { getTicketLabels } from '@/modules/tenancy/application/ticket-labels';
import { TicketLabelsRepository } from '@/modules/tenancy/infrastructure/ticket-labels.repository';

const id = () => randomUUID() as UUID;

test('request options require active requester membership and include only active project choices',
  { skip: !process.env.DATABASE_URL }, async () => {
    const db = new Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    await db.query('BEGIN');
    try {
      const tenant = id(), foreignTenant = id();
      const project = id(), archived = id(), foreignProject = id();
      const company = id(), foreignCompany = id();
      const requester = id(), admin = id(), foreignUser = id();
      const level = id(), root = id(), child = id(), retired = id();
      const department = id(), foreignDepartment = id();
      await db.query("INSERT INTO tenants(id,name) VALUES($1,'Intake'),($2,'Foreign')",
        [tenant, foreignTenant]);
      await db.query(`INSERT INTO companies(id,tenant_id,name,type) VALUES
        ($1,$3,'GC','GC'),($2,$4,'Other GC','GC')`,
        [company, foreignCompany, tenant, foreignTenant]);
      await db.query(`INSERT INTO users(id,tenant_id,company_id,email,password_hash,name)
        VALUES ($1,$4,$5,'intake-requester@example.test','fixture','Requester'),
          ($2,$4,$5,'intake-admin@example.test','fixture','Admin'),
          ($3,$6,$7,'intake-foreign@example.test','fixture','Foreign')`,
        [requester, admin, foreignUser, tenant, company, foreignTenant, foreignCompany]);
      await db.query(`INSERT INTO projects(id,tenant_id,name,status) VALUES
        ($1,$4,'Site A','ACTIVE'),($2,$4,'Old site','ARCHIVED'),
        ($3,$5,'Other site','ACTIVE')`,
        [project, archived, foreignProject, tenant, foreignTenant]);
      await db.query(`INSERT INTO project_memberships(project_id,user_id,role) VALUES
        ($1,$2,'REQUESTER'),($1,$3,'PROJECT_ADMIN'),
        ($4,$2,'REQUESTER'),($5,$6,'REQUESTER')`,
        [project, requester, admin, archived, foreignProject, foreignUser]);
      await db.query("INSERT INTO aor_levels(id,project_id,tenant_id,depth,label) VALUES($1,$2,$3,0,'Area')",
        [level, project, tenant]);
      await db.query(`INSERT INTO aor_nodes(id,project_id,tenant_id,level_id,parent_id,name,code,retired_at)
        VALUES ($1,$4,$5,$6,NULL,'West','WEST',NULL),
          ($2,$4,$5,$6,$1,'Unit 1','UNIT1',NULL),
          ($3,$4,$5,$6,$1,'Old Unit','OLD',NOW())`,
        [root, child, retired, project, tenant, level]);
      await db.query(`INSERT INTO departments(id,project_id,tenant_id,name,manager_title,created_by)
        VALUES($1,$3,$4,'Civil','Civil Manager',$5),
          ($2,$3,$4,'QA','QA Manager',$5)`,
        [department, foreignDepartment, project, tenant, admin]);
      await db.query(`INSERT INTO department_memberships(project_id,tenant_id,user_id,department_id)
        VALUES($1,$2,$3,$4)`, [project, tenant, requester, department]);

      const repo = new RequestOptionsRepository();
      const options = await getRequestOptions(repo, db,
        { tenantId: tenant, projectId: project, requesterId: requester });
      assert.deepEqual(options.project, { id: project, name: 'Site A' });
      assert.equal(options.ownDepartmentId, department);
      assert.deepEqual(options.aorNodes.map(node => [node.id, node.path]), [
        [root, 'West'], [child, 'West / Unit 1'],
      ]);
      assert.deepEqual(options.departments.map(item => item.name), ['Civil', 'QA']);

      const labelRepo = new TicketLabelsRepository();
      const labelContext = { tenantId: tenant, projectId: project, aorNodeId: retired, departmentId: department };
      assert.deepEqual(await getTicketLabels(labelRepo, db, labelContext), {
        projectName: 'Site A', locationName: 'West / Old Unit', departmentName: 'Civil',
        partyChiefName: null, instrumentManName: null,
      });
      const crewContext = { ...labelContext, partyChiefId: admin, instrumentManId: requester };
      const crewLabels = await getTicketLabels(labelRepo, db, crewContext);
      assert.equal(crewLabels.partyChiefName, 'Admin');
      assert.equal(crewLabels.instrumentManName, 'Requester');
      await assert.rejects(getTicketLabels(labelRepo, db, { ...crewContext, partyChiefId: foreignUser }), NotFoundError);
      await assert.rejects(getTicketLabels(labelRepo, db, { ...crewContext, instrumentManId: foreignUser }), NotFoundError);
      await assert.rejects(getTicketLabels(labelRepo, db,
        { ...labelContext, tenantId: foreignTenant }), NotFoundError);
      await assert.rejects(getTicketLabels(labelRepo, db,
        { ...labelContext, projectId: foreignProject }), NotFoundError);

      for (const params of [
        { tenantId: tenant, projectId: project, requesterId: admin },
        { tenantId: tenant, projectId: archived, requesterId: requester },
        { tenantId: foreignTenant, projectId: project, requesterId: requester },
        { tenantId: tenant, projectId: foreignProject, requesterId: requester },
      ]) {
        await assert.rejects(getRequestOptions(repo, db, params), NotFoundError);
      }
      await db.query('UPDATE users SET deactivated_at=NOW() WHERE id=$1', [requester]);
      await assert.rejects(getRequestOptions(repo, db,
        { tenantId: tenant, projectId: project, requesterId: requester }), NotFoundError);
      await db.query("UPDATE projects SET status='ARCHIVED' WHERE id=$1", [project]);
      assert.equal((await getTicketLabels(labelRepo, db, labelContext)).locationName, 'West / Old Unit');
      // Historical assignments retain names after deactivation and project archival.
      assert.equal((await getTicketLabels(labelRepo, db, crewContext)).instrumentManName, 'Requester');
    } finally {
      await db.query('ROLLBACK');
      await db.end();
    }
  });
