import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Client } from 'pg';
import { ConflictError, ForbiddenError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ITenancyRepository } from '@/modules/tenancy/application/ports';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import { addProjectMember } from '@/modules/tenancy/application/add-project-member';
import { addToWhitelist } from '@/modules/tenancy/application/whitelist';
import { setCrewRoster } from '@/modules/tenancy/application/aor-operations';

const id = () => randomUUID() as UUID;
const tenantId = id(); const projectId = id(); const userId = id();
const actorId = id();
const db: DbClient = { async query() { return { rows: [] }; } };

test('PROJECT_ADMIN may add project members only during SETUP', async () => {
  let status: 'SETUP' | 'ACTIVE' | 'ARCHIVED' = 'SETUP';
  const writes: string[] = [];
  const repo = {
    findProjectById: async () => ({ status }),
    saveMembership: async () => { writes.push('membership'); },
  } as unknown as ITenancyRepository;
  const params = { tenantId, projectId, userId,
    actorRole: 'PROJECT_ADMIN' as const, role: 'REQUESTER' as const };
  await addProjectMember(repo, db, params);
  status = 'ACTIVE';
  await assert.rejects(addProjectMember(repo, db, params), ForbiddenError);
  await addProjectMember(repo, db,
    { ...params, actorRole: 'TENANT_ADMIN' });
  status = 'ARCHIVED';
  await assert.rejects(addProjectMember(repo, db,
    { ...params, actorRole: 'TENANT_ADMIN' }), ConflictError);
  assert.deepEqual(writes, ['membership', 'membership']);
});

test('PROJECT_ADMIN whitelist delegation expires on activation', async () => {
  let status: 'SETUP' | 'ACTIVE' = 'SETUP';
  const writes: string[] = [];
  const repo = {
    findProjectById: async () => ({ status }),
    saveWhitelistEntry: async () => { writes.push('whitelist'); return true; },
    appendTenantEvent: async () => { writes.push('event'); },
  } as unknown as ITenancyRepository;
  const params = { tenantId, projectId, addedBy: actorId,
    actorRole: 'PROJECT_ADMIN' as const, email: 'test@example.com' };
  await addToWhitelist(repo, db, params);
  status = 'ACTIVE';
  await assert.rejects(addToWhitelist(repo, db, params), ForbiddenError);
  assert.deepEqual(writes, ['whitelist', 'event']);
});

test('Survey Manager can seed a SETUP roster; PROJECT_ADMIN cannot', async () => {
  const writes: string[] = [];
  const repo = {
    lockProjectById: async () => ({ status: 'SETUP' }),
    findCrewRoster: async () => null,
    saveCrewRoster: async () => { writes.push('roster'); return id(); },
    appendTenantEvent: async () => { writes.push('event'); },
  } as unknown as ITenancyRepository;
  const params = { tenantId, projectId, actorId,
    partyChiefId: id(), instrumentManId: id() };
  await assert.rejects(setCrewRoster(repo, db,
    { ...params, actorRole: 'PROJECT_ADMIN' }), ForbiddenError);
  await setCrewRoster(repo, db,
    { ...params, actorRole: 'SURVEY_MANAGER' });
  assert.deepEqual(writes, ['roster', 'event']);
});

test('PostgreSQL SETUP delegation, roster seeding, and duplicate member protection',
  { skip: !process.env.DATABASE_URL }, async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query('BEGIN');
    try {
      const t = id(); const p = id(); const c = id();
      const admin = id(); const manager = id(); const chief = id();
      const instrument = id(); const requester = id(); const viewer = id();
      await client.query('INSERT INTO tenants (id,name) VALUES ($1,$2)', [t, 'Setup delegation']);
      await client.query(
        "INSERT INTO companies (id,tenant_id,name,type) VALUES ($1,$2,'GC','GC')",
        [c, t]);
      await client.query(
        `INSERT INTO users (id,tenant_id,company_id,email,password_hash,name) VALUES
         ($1,$7,$8,'setup-admin@example.com','fixture','Admin'),
         ($2,$7,$8,'setup-manager@example.com','fixture','Manager'),
         ($3,$7,$8,'setup-chief@example.com','fixture','Chief'),
         ($4,$7,$8,'setup-im@example.com','fixture','Instrument'),
         ($5,$7,$8,'setup-requester@example.com','fixture','Requester'),
         ($6,$7,$8,'setup-viewer@example.com','fixture','Viewer')`,
        [admin, manager, chief, instrument, requester, viewer, t, c]);
      await client.query(
        "INSERT INTO projects (id,tenant_id,name,status,crew_build) VALUES ($1,$2,'Setup','SETUP','MEDIUM')",
        [p, t]);
      await client.query(
        `INSERT INTO project_memberships (project_id,user_id,role) VALUES
         ($1,$2,'PROJECT_ADMIN'),($1,$3,'SURVEY_MANAGER'),
         ($1,$4,'PARTY_CHIEF'),($1,$5,'INSTRUMENT_MAN')`,
        [p, admin, manager, chief, instrument]);
      const repo = new TenancyRepository();
      await addProjectMember(repo, client, { tenantId: t, projectId: p,
        userId: requester, actorRole: 'PROJECT_ADMIN', role: 'REQUESTER' });
      await assert.rejects(addProjectMember(repo, client, { tenantId: t,
        projectId: p, userId: manager, actorRole: 'PROJECT_ADMIN',
        role: 'REQUESTER' }), ConflictError);
      const { rows: managerMembership } = await client.query<{ role: string }>(
        'SELECT role FROM project_memberships WHERE project_id=$1 AND user_id=$2',
        [p, manager]);
      assert.equal(managerMembership[0]?.role, 'SURVEY_MANAGER');
      await addToWhitelist(repo, client,
        { tenantId: t, projectId: p, addedBy: admin,
          actorRole: 'PROJECT_ADMIN', email: 'priority@example.com' });
      const rosterId = await setCrewRoster(repo, client,
        { tenantId: t, projectId: p, actorId: manager,
          actorRole: 'SURVEY_MANAGER',
          partyChiefId: chief, instrumentManId: instrument });
      assert.ok(rosterId);
      await client.query("UPDATE projects SET status='ACTIVE' WHERE id=$1 AND tenant_id=$2",
        [p, t]);
      await assert.rejects(addProjectMember(repo, client,
        { tenantId: t, projectId: p, userId: viewer,
          actorRole: 'PROJECT_ADMIN', role: 'VIEWER' }), ForbiddenError);
      await assert.rejects(addToWhitelist(repo, client,
        { tenantId: t, projectId: p, addedBy: admin,
          actorRole: 'PROJECT_ADMIN', email: 'after@example.com' }), ForbiddenError);
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });
