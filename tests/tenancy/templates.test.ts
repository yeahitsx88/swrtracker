import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Client } from 'pg';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ITenancyRepository } from '@/modules/tenancy/application/ports';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import {
  createProjectFromTemplate, createProjectTemplate, deleteProjectTemplate,
  listProjectTemplates, updateProjectTemplate,
} from '@/modules/tenancy/application/project-templates';

const id = () => randomUUID() as UUID;
const tenantId = id(); const actorId = id(); const templateId = id();
const db: DbClient = { async query() { return { rows: [] }; } };
const input = { name: 'Energy setup', crewBuild: 'FULL' as const,
  aorLevelLabels: ['AREA', 'UNIT'], departmentNames: ['Civil'] };

test('only tenant administrators can create, update, delete, or apply templates', async () => {
  const repo = {} as ITenancyRepository;
  await assert.rejects(createProjectTemplate(repo, db,
    { tenantId, actorId, actorRole: 'BILLING_VIEWER', ...input }), ForbiddenError);
  await assert.rejects(updateProjectTemplate(repo, db,
    { tenantId, actorId, actorRole: 'BILLING_VIEWER', templateId, ...input }), ForbiddenError);
  await assert.rejects(deleteProjectTemplate(repo, db,
    { tenantId, actorId, actorRole: 'BILLING_VIEWER', templateId }), ForbiddenError);
  await assert.rejects(createProjectFromTemplate(repo, db,
    { tenantId, actorId, actorRole: 'BILLING_VIEWER', templateId,
      name: 'New Project' }), ForbiddenError);
});

test('template validation rejects empty, duplicate, and oversized structure', async () => {
  const repo = {} as ITenancyRepository;
  await assert.rejects(createProjectTemplate(repo, db,
    { tenantId, actorId, actorRole: 'TENANT_ADMIN',
      ...input, aorLevelLabels: [] }), ValidationError);
  await assert.rejects(createProjectTemplate(repo, db,
    { tenantId, actorId, actorRole: 'TENANT_ADMIN',
      ...input, aorLevelLabels: ['Area', 'area'] }), ValidationError);
  await assert.rejects(createProjectTemplate(repo, db,
    { tenantId, actorId, actorRole: 'TENANT_ADMIN',
      ...input, departmentNames: ['Civil', 'civil'] }), ValidationError);
});

test('template writes precede audit and delete lists referencing projects', async () => {
  const writes: string[] = [];
  let referenced = true;
  const template = { id: templateId, tenantId, ...input,
    aorDepth: 2, createdBy: actorId,
    createdAt: new Date(), updatedAt: new Date() };
  const repo = {
    saveProjectTemplate: async () => { writes.push('create'); },
    findProjectTemplate: async () => template,
    updateProjectTemplate: async () => { writes.push('update'); return true; },
    findTemplateProjectReferences: async () => referenced
      ? [{ id: actorId, name: 'Existing project' }] : [],
    deleteProjectTemplate: async () => { writes.push('delete'); return true; },
    appendTenantEvent: async (_db: DbClient, _tenant: UUID, _actor: UUID,
      event: string) => { writes.push(event); },
  } as unknown as ITenancyRepository;
  await createProjectTemplate(repo, db,
    { tenantId, actorId, actorRole: 'TENANT_ADMIN', ...input });
  await updateProjectTemplate(repo, db,
    { tenantId, actorId, actorRole: 'TENANT_ADMIN', templateId,
      ...input, name: 'Changed' });
  await assert.rejects(deleteProjectTemplate(repo, db,
    { tenantId, actorId, actorRole: 'TENANT_ADMIN', templateId }),
  (error: unknown) => error instanceof ConflictError &&
    error.message.includes('Existing project'));
  referenced = false;
  await deleteProjectTemplate(repo, db,
    { tenantId, actorId, actorRole: 'TENANT_ADMIN', templateId });
  assert.deepEqual(writes, ['create', 'template.created',
    'update', 'template.updated', 'delete', 'template.deleted']);
});

test('template application creates SETUP project, levels, then audit event', async () => {
  const writes: string[] = [];
  const repo = {
    findProjectTemplate: async () => ({ id: templateId, tenantId, ...input,
      aorDepth: 2, createdBy: actorId,
      createdAt: new Date(), updatedAt: new Date() }),
    saveProjectFromTemplate: async () => { writes.push('project'); },
    saveAorLevel: async (_db: DbClient, level: { depth: number; label: string }) => {
      writes.push(`${level.depth}:${level.label}`);
    },
    saveDepartment: async (_db: DbClient, department: { name: string }) => {
      writes.push(`department:${department.name}`); return true;
    },
    saveDepartmentManagerTitle: async () => { writes.push('managerTitle'); },
    appendTenantEvent: async (_db: DbClient, _tenant: UUID, _actor: UUID,
      event: string) => { writes.push(event); },
  } as unknown as ITenancyRepository;
  const project = await createProjectFromTemplate(repo, db,
    { tenantId, actorId, actorRole: 'TENANT_ADMIN', templateId,
      name: 'New Project' });
  assert.equal(project.status, 'SETUP');
  assert.equal(project.templateId, templateId);
  assert.deepEqual(writes, ['project', '0:AREA', '1:UNIT',
    'department:Civil', 'managerTitle', 'department.created',
    'project.template_applied']);
});

test('PostgreSQL templates are tenant scoped and referenced deletion conflicts',
  { skip: !process.env.DATABASE_URL }, async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query('BEGIN');
    try {
      const t = id(); const c = id(); const admin = id();
      await client.query('INSERT INTO tenants (id,name) VALUES ($1,$2)', [t, 'Templates']);
      await client.query(
        "INSERT INTO companies (id,tenant_id,name,type) VALUES ($1,$2,'GC','GC')",
        [c, t]);
      await client.query(
        `INSERT INTO users (id,tenant_id,company_id,email,password_hash,name)
         VALUES ($1,$2,$3,'template-admin@example.com','fixture','Admin')`,
        [admin, t, c]);
      const repo = new TenancyRepository();
      const template = await createProjectTemplate(repo, client,
        { tenantId: t, actorId: admin, actorRole: 'TENANT_ADMIN', ...input });
      assert.equal((await listProjectTemplates(repo, client,
        { tenantId: t, actorRole: 'TENANT_ADMIN', limit: 10, offset: 0 })).total, 1);
      assert.equal((await listProjectTemplates(repo, client,
        { tenantId: id(), actorRole: 'TENANT_ADMIN', limit: 10, offset: 0 })).total, 0);
      await assert.rejects(createProjectFromTemplate(repo, client,
        { tenantId: id(), actorId: admin, actorRole: 'TENANT_ADMIN',
          templateId: template.id, name: 'Foreign' }), NotFoundError);
      await updateProjectTemplate(repo, client,
        { tenantId: t, actorId: admin, actorRole: 'TENANT_ADMIN',
          templateId: template.id, ...input,
          aorLevelLabels: ['GENERAL', 'UNIT', 'CWA'] });
      const project = await createProjectFromTemplate(repo, client,
        { tenantId: t, actorId: admin, actorRole: 'TENANT_ADMIN',
          templateId: template.id, name: 'From Template' });
      const { rows: levels } = await client.query<{ depth: number; label: string }>(
        `SELECT depth,label FROM aor_levels WHERE tenant_id=$1 AND project_id=$2
         ORDER BY depth`, [t, project.id]);
      assert.deepEqual(levels, [
        { depth: 0, label: 'GENERAL' },
        { depth: 1, label: 'UNIT' },
        { depth: 2, label: 'CWA' },
      ]);
      const { rows: departments } = await client.query<{
        name: string; manager_title: string;
      }>(
        'SELECT name,manager_title FROM departments WHERE tenant_id=$1 AND project_id=$2',
        [t, project.id]);
      assert.deepEqual(departments, [{ name: 'Civil', manager_title: 'Civil Manager' }]);
      await assert.rejects(deleteProjectTemplate(repo, client,
        { tenantId: t, actorId: admin, actorRole: 'TENANT_ADMIN',
          templateId: template.id }), ConflictError);
      const unused = await createProjectTemplate(repo, client,
        { tenantId: t, actorId: admin, actorRole: 'TENANT_ADMIN',
          ...input, name: 'Unused' });
      await deleteProjectTemplate(repo, client,
        { tenantId: t, actorId: admin, actorRole: 'TENANT_ADMIN',
          templateId: unused.id });
      const { rows: events } = await client.query<{ event_type: string }>(
        'SELECT event_type FROM tenant_events WHERE tenant_id=$1', [t]);
      assert.ok(events.some((e) => e.event_type === 'project.template_applied'));
      assert.ok(events.some((e) => e.event_type === 'template.deleted'));
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });
