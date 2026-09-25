import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Client } from 'pg';
import type { UUID } from '@/shared/types';
import { deactivateUser, reactivateUser, changeProjectMembership } from
  '@/modules/identity/application/user-lifecycle';
import { UserLifecycleRepository } from
  '@/modules/identity/infrastructure/user-lifecycle.repository';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import type { ITenancyRepository } from '@/modules/tenancy/application/ports';
import { NextRequest } from 'next/server';
import { requireAuth, signToken } from '@/lib/auth';
import { getPool } from '@/lib/db';

const id = () => randomUUID() as UUID;

test('Survey Manager removal block commits an audit event without deactivation', async () => {
  const tenantId = id(), userId = id(), actorId = id(), projectId = id();
  const writes: string[] = [];
  const repo = {
    lockUser: async () => ({ deactivatedAt: null }),
  } as unknown as UserLifecycleRepository;
  const tenancy = {
    listSurveyManagerRemovalProjects: async () => [{ id: projectId,
      name: 'North', hasOtherManager: false, hasActingCoverage: false }],
    appendTenantEvent: async (_db: unknown, _tenantId: UUID,
      _actorId: UUID, eventType: string) => { writes.push(eventType); },
  } as unknown as ITenancyRepository;
  const db = { async query() { return { rows: [] }; } };
  const result = await deactivateUser(repo, tenancy, db, {
    tenantId, userId, actorId, actorRole: 'TENANT_ADMIN',
  });
  assert.equal(result.deactivated, false);
  assert.deepEqual(writes, ['user.removal_blocked']);
});

test('Survey Manager role change is blocked before membership mutation', async () => {
  const tenantId = id(), userId = id(), actorId = id(), projectId = id();
  const writes: string[] = [];
  const repo = { lockProjectMembership: async () => ({ role: 'SURVEY_MANAGER',
    projectStatus: 'ACTIVE' }) } as unknown as UserLifecycleRepository;
  const tenancy = { listSurveyManagerRemovalProjects: async () => [{
    id: projectId, name: 'North', hasOtherManager: false,
    hasActingCoverage: false,
  }], appendTenantEvent: async (_db: unknown, _tenant: UUID,
    _actor: UUID, event: string) => { writes.push(event); },
  } as unknown as ITenancyRepository;
  const db = { async query() { return { rows: [] }; } };
  const result = await changeProjectMembership(repo, tenancy, db, {
    tenantId, projectId, userId, actorId, actorRole: 'TENANT_ADMIN',
    newRole: 'VIEWER',
  });
  assert.equal(result.changed, false);
  assert.deepEqual(result.blockedProjects?.map(project => project.id), [projectId]);
  assert.deepEqual(writes, ['user.removal_blocked']);
});

test('PostgreSQL session version rejects old tokens after deactivation and reactivation',
  { skip: !process.env.DATABASE_URL }, async () => {
    const db = new Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    const tenantId = id(), companyId = id(), userId = id();
    const priorSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'local-test-secret-for-session-invalidation';
    const requestFor = (version: number) => new NextRequest('http://localhost/api/tickets', {
      headers: { cookie: `swr_session=${signToken(userId, tenantId, version)}` },
    });
    try {
      await db.query('INSERT INTO tenants(id,name) VALUES($1,$2)', [tenantId, 'Sessions']);
      await db.query(`INSERT INTO companies(id,tenant_id,name,type)
        VALUES($1,$2,'GC','GC')`, [companyId, tenantId]);
      await db.query(`INSERT INTO users(id,tenant_id,company_id,email,
        password_hash,name) VALUES($1,$2,$3,$4,'fixture','User')`,
      [userId, tenantId, companyId, `${userId}@sessions.test`]);
      assert.equal((await requireAuth(requestFor(0))).userId, userId);
      await db.query('UPDATE users SET session_version=1 WHERE id=$1', [userId]);
      await assert.rejects(requireAuth(requestFor(0)));
      assert.equal((await requireAuth(requestFor(1))).userId, userId);
      await db.query('UPDATE users SET deactivated_at=NOW() WHERE id=$1', [userId]);
      await assert.rejects(requireAuth(requestFor(1)));
      await db.query(`UPDATE users SET deactivated_at=NULL,session_version=2
        WHERE id=$1`, [userId]);
      await assert.rejects(requireAuth(requestFor(1)));
      assert.equal((await requireAuth(requestFor(2))).userId, userId);
    } finally {
      await db.query('DELETE FROM users WHERE id=$1', [userId]);
      await db.query('DELETE FROM companies WHERE id=$1', [companyId]);
      await db.query('DELETE FROM tenants WHERE id=$1', [tenantId]);
      await db.end();
      await getPool().end();
      if (priorSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = priorSecret;
    }
  });
test('PostgreSQL user deactivation invalidates sessions and retains soft-deleted drafts',
  { skip: !process.env.DATABASE_URL }, async () => {
    const db = new Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    await db.query('BEGIN');
    try {
      const tenantId = id(), companyId = id(), actorId = id(), userId = id();
      const projectId = id(), draftId = id();
      await db.query('INSERT INTO tenants(id,name) VALUES($1,$2)', [tenantId, 'Lifecycle']);
      await db.query(`INSERT INTO companies(id,tenant_id,name,type)
        VALUES($1,$2,'GC','GC')`, [companyId, tenantId]);
      for (const [idValue, email] of [[actorId, 'admin'], [userId, 'user']]) {
        await db.query(`INSERT INTO users(id,tenant_id,company_id,email,
          password_hash,name) VALUES($1,$2,$3,$4,'fixture','User')`,
        [idValue, tenantId, companyId, `${email}@lifecycle.test`]);
      }
      await db.query(`INSERT INTO projects(id,tenant_id,name,status,crew_build)
        VALUES($1,$2,'Project','ACTIVE','SLIM')`, [projectId, tenantId]);
      await db.query(`INSERT INTO project_memberships(project_id,user_id,role)
        VALUES($1,$2,'REQUESTER')`, [projectId, userId]);
      await db.query(`INSERT INTO tickets(id,tenant_id,project_id,company_id,
        requester_id,workflow_variant,status)
        VALUES($1,$2,$3,$4,$5,'STANDARD_APPROVAL','DRAFT')`,
      [draftId, tenantId, projectId, companyId, userId]);
      const repo = new UserLifecycleRepository();
      const result = await deactivateUser(repo, new TenancyRepository(), db, {
        tenantId, userId, actorId, actorRole: 'TENANT_ADMIN',
      });
      assert.deepEqual(result, { deactivated: true, draftCount: 1,
        orphanedTicketCount: 0 });
      const { rows: after } = await db.query<{
        session_version: number; deactivated_at: Date;
      }>('SELECT session_version,deactivated_at FROM users WHERE id=$1', [userId]);
      assert.equal(after[0]?.session_version, 1);
      assert.ok(after[0]?.deactivated_at);
      const { rows: draft } = await db.query<{ draft_deleted_reason: string }>(
        'SELECT draft_deleted_reason FROM tickets WHERE id=$1', [draftId]);
      assert.equal(draft[0]?.draft_deleted_reason, 'USER_DEACTIVATED');
      await reactivateUser(repo, db, { tenantId, userId, actorId,
        actorRole: 'TENANT_ADMIN' });
      const { rows: restored } = await db.query<{
        session_version: number; deactivated_at: Date | null;
      }>('SELECT session_version,deactivated_at FROM users WHERE id=$1', [userId]);
      assert.equal(restored[0]?.session_version, 2);
      assert.equal(restored[0]?.deactivated_at, null);
      const changed = await changeProjectMembership(repo, new TenancyRepository(), db, {
        tenantId, projectId, userId, actorId,
        actorRole: 'TENANT_ADMIN', newRole: 'VIEWER',
      });
      assert.equal(changed.changed, true);
      const { rows: membership } = await db.query<{ role: string }>(
        'SELECT role FROM project_memberships WHERE project_id=$1 AND user_id=$2',
        [projectId, userId]);
      assert.equal(membership[0]?.role, 'VIEWER');
      const removed = await changeProjectMembership(repo, new TenancyRepository(), db, {
        tenantId, projectId, userId, actorId,
        actorRole: 'TENANT_ADMIN', newRole: null,
      });
      assert.equal(removed.changed, true);
      const { rows: missingMembership } = await db.query(
        'SELECT id FROM project_memberships WHERE project_id=$1 AND user_id=$2',
        [projectId, userId]);
      assert.equal(missingMembership.length, 0);
      const { rows: events } = await db.query<{ event_type: string }>(
        'SELECT event_type FROM ticket_events WHERE ticket_id=$1', [draftId]);
      assert.deepEqual(events.map(event => event.event_type), ['ticket.draft_deleted']);
    } finally {
      await db.query('ROLLBACK');
      await db.end();
    }
  });
