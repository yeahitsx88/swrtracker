import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { Client } from 'pg';
import { ConflictError, ForbiddenError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { Invite } from '@/modules/identity/domain/invite';
import type { InviteRepositoryPort, ProjectState } from '@/modules/identity/application/invite-ports';
import type { IUserRepository } from '@/modules/identity/application/ports';
import { acceptInvite, cancelInvite, inspectInvite, listInvites,
  createInvite } from '@/modules/identity/application/invites';
import { POST, PUT } from '@/app/api/invites/route';
import { InviteRepository } from '@/modules/identity/infrastructure/invite.repository';
import { UserRepository } from '@/modules/identity/infrastructure/user.repository';

const tenantId = '00000000-0000-0000-0000-000000000001' as UUID;
const projectId = '00000000-0000-0000-0000-000000000002' as UUID;
const companyId = '00000000-0000-0000-0000-000000000003' as UUID;
const actorId = '00000000-0000-0000-0000-000000000004' as UUID;
const userId = '00000000-0000-0000-0000-000000000005' as UUID;
const token = '00000000-0000-0000-0000-000000000006' as UUID;
const db: DbClient = { async query() { return { rows: [] }; } };

function invite(overrides: Partial<Invite> = {}): Invite {
  return {
    id: '00000000-0000-0000-0000-000000000007' as UUID,
    tenantId, projectId, companyId, email: 'worker@example.com', role: 'REQUESTER',
    token, invitedBy: actorId, acceptedAt: null,
    expiresAt: new Date(Date.now() + 3600000), canceledAt: null,
    canceledBy: null, createdAt: new Date(), ...overrides,
  };
}

class FakeRepo implements InviteRepositoryPort {
  state: ProjectState = 'SETUP';
  allowed = true;
  companyValid = true;
  duplicate = false;
  current: Invite | null = invite();
  saved: Invite | null = null;
  actions: string[] = [];
  events: Array<{ type: string; payload: Record<string, unknown> }> = [];
  async projectState(): Promise<ProjectState> { return this.state; }
  async canManage(): Promise<boolean> { return this.allowed; }
  async companyBelongsToTenant(): Promise<boolean> { return this.companyValid; }
  async lockEmail(): Promise<void> { this.actions.push('lock'); }
  async activeForEmail(): Promise<boolean> { return this.duplicate; }
  async save(_db: DbClient, value: Invite): Promise<void> {
    this.saved = value; this.actions.push('save');
  }
  async list(): Promise<Invite[]> { return this.current ? [this.current] : []; }
  async count(): Promise<number> { return this.current ? 1 : 0; }
  async findByIdForUpdate(): Promise<Invite | null> { return this.current; }
  async findByTokenForUpdate(): Promise<Invite | null> { return this.current; }
  async markCanceled(): Promise<void> { this.actions.push('cancel'); }
  async markAccepted(): Promise<void> { this.actions.push('accept'); }
  async addMembership(): Promise<void> { this.actions.push('membership'); }
  async appendEvent(_db: DbClient, _tenantId: UUID, _actorId: UUID,
    type: string, payload: Record<string, unknown>): Promise<void> {
    this.events.push({ type, payload }); this.actions.push('event');
  }
  async hasExpirationEvent(): Promise<boolean> { return false; }
}

const send = (repo: FakeRepo) => createInvite(repo, db, {
  tenantId, projectId, companyId, actorId, email: 'worker@example.com', role: 'REQUESTER',
});

test('sending a bound invite records its audit event after persistence without leaking token', async () => {
  const repo = new FakeRepo();
  const issued = await send(repo);
  assert.equal(issued.companyId, companyId);
  assert.deepEqual(repo.actions, ['lock', 'save', 'event']);
  assert.equal(repo.events[0]?.type, 'invite.sent');
  assert.equal(JSON.stringify(repo.events).includes(issued.token), false);
});

test('invite management enforces company, duplicate, and setup-only delegation', async () => {
  const repo = new FakeRepo();
  repo.companyValid = false;
  await assert.rejects(send(repo), ValidationError);
  repo.companyValid = true;
  repo.duplicate = true;
  await assert.rejects(send(repo), ConflictError);
  repo.duplicate = false;
  repo.state = 'ACTIVE'; repo.allowed = false;
  await assert.rejects(send(repo), ForbiddenError);
  repo.state = 'ARCHIVED'; repo.allowed = true;
  await assert.rejects(send(repo), ConflictError);
});

test('list and cancel hide token and cancellation records original role and email', async () => {
  const repo = new FakeRepo();
  const listed = await listInvites(repo, db, {
    tenantId, projectId, actorId, limit: 25, offset: 0,
  });
  assert.equal(listed.total, 1);
  assert.equal('token' in listed.data[0]!, false);
  await cancelInvite(repo, db, { tenantId, projectId, inviteId: invite().id, actorId });
  assert.deepEqual(repo.actions, ['cancel', 'event']);
  assert.equal(repo.events[0]?.type, 'invite.canceled');
  assert.equal(repo.events[0]?.payload.originalEmail, 'worker@example.com');
  assert.equal(JSON.stringify(repo.events).includes(token), false);
});

test('expired invite creates one expiration audit event and cannot be accepted', async () => {
  const repo = new FakeRepo();
  repo.current = invite({ expiresAt: new Date(Date.now() - 3600000) });
  const info = await inspectInvite(repo, db, token);
  assert.equal(info.status, 'EXPIRED');
  assert.equal('token' in info, false);
  assert.equal(repo.events[0]?.type, 'invite.expired');
  assert.deepEqual(await acceptInvite(repo, {} as IUserRepository, db, { token }),
    { status: 'EXPIRED' });
  assert.equal(repo.actions.includes('membership'), false);
});

test('accepted and legacy unbound invites cannot be reused', async () => {
  const repo = new FakeRepo();
  repo.current = invite({ acceptedAt: new Date() });
  await assert.rejects(acceptInvite(repo, {} as IUserRepository, db, { token }), ConflictError);
  repo.current = invite({ companyId: null });
  await assert.rejects(acceptInvite(repo, {} as IUserRepository, db, { token }), ConflictError);
});

test('acceptance binds the signed-in user to invitation email and company', async () => {
  const repo = new FakeRepo();
  const users = { findById: async () => ({
    id: userId, tenantId, companyId, email: 'worker@example.com', name: 'Worker',
    authMethod: 'LOCAL' as const, createdAt: new Date(),
  }) } as unknown as IUserRepository;
  const result = await acceptInvite(repo, users, db, { token, authenticatedUserId: userId });
  assert.deepEqual(result, { status: 'ACCEPTED', userId });
  assert.deepEqual(repo.actions, ['membership', 'accept', 'event']);
  assert.equal(repo.events[0]?.type, 'invite.accepted');
  const wrongCompany = { findById: async () => ({
    id: userId, tenantId, companyId: actorId, email: 'worker@example.com',
  }) } as unknown as IUserRepository;
  await assert.rejects(acceptInvite(new FakeRepo(), wrongCompany, db,
    { token, authenticatedUserId: userId }), ForbiddenError);
});

test('malformed invite requests are rejected before database access', async () => {
  const post = await POST(new NextRequest('http://localhost/api/invites', {
    method: 'POST', body: JSON.stringify({ projectId, companyId, email: 'bad', role: 'REQUESTER' }),
  }));
  assert.equal(post.status, 401);
  const put = await PUT(new NextRequest('http://localhost/api/invites', {
    method: 'PUT', body: JSON.stringify({ token, name: 'Worker', password: 'short' }),
  }));
  assert.equal(put.status, 400);
});

test('PostgreSQL invite issue, scope, single-use acceptance, and audit stay atomic',
  { skip: !process.env.INVITE_TEST_DATABASE_URL }, async () => {
    const client = new Client({ connectionString: process.env.INVITE_TEST_DATABASE_URL });
    await client.connect();
    await client.query('BEGIN');
    const next = () => randomUUID() as UUID;
    const tenant = next();
    const foreignTenant = next();
    const project = next();
    const company = next();
    const foreignCompany = next();
    const admin = next();
    const worker = next();
    const foreignUser = next();
    try {
      await client.query(`INSERT INTO tenants (id,name) VALUES
        ($1,'Invite tenant'),($2,'Foreign tenant')`, [tenant, foreignTenant]);
      await client.query(`INSERT INTO companies (id,tenant_id,name,type) VALUES
        ($1,$3,'GC','GC'),($2,$4,'Foreign','GC')`,
      [company, foreignCompany, tenant, foreignTenant]);
      await client.query(`INSERT INTO users
        (id,tenant_id,company_id,email,password_hash,name) VALUES
        ($1,$4,$5,'admin@site.example','fixture','Admin'),
        ($2,$4,$5,'worker@site.example','fixture','Worker'),
        ($3,$6,$7,'foreign@site.example','fixture','Foreign')`,
      [admin, worker, foreignUser, tenant, company, foreignTenant, foreignCompany]);
      await client.query(`INSERT INTO projects (id,tenant_id,name,status,crew_build)
        VALUES ($1,$2,'Invite project','SETUP','MEDIUM')`, [project, tenant]);
      await client.query(`INSERT INTO project_memberships (project_id,user_id,role)
        VALUES ($1,$2,'PROJECT_ADMIN')`, [project, admin]);
      const repo = new InviteRepository();
      await assert.rejects(createInvite(repo, client, {
        tenantId: tenant, projectId: project, companyId: foreignCompany,
        actorId: admin, email: 'new@site.example', role: 'REQUESTER',
      }), ValidationError);
      const created = await createInvite(repo, client, {
        tenantId: tenant, projectId: project, companyId: company,
        actorId: admin, email: 'worker@site.example', role: 'REQUESTER',
      });
      assert.equal(created.companyId, company);
      const inspected = await inspectInvite(repo, client, created.token);
      assert.equal(inspected.status, 'PENDING');
      assert.equal('token' in inspected, false);
      const accepted = await acceptInvite(repo, new UserRepository(), client,
        { token: created.token, authenticatedUserId: worker });
      assert.deepEqual(accepted, { status: 'ACCEPTED', userId: worker });
      await assert.rejects(acceptInvite(repo, new UserRepository(), client,
        { token: created.token, authenticatedUserId: worker }), ConflictError);
      const eventRows = await client.query<{ event_type: string; payload: Record<string, unknown> }>(
        `SELECT event_type, payload FROM tenant_events WHERE tenant_id = $1
         AND event_type LIKE 'invite.%' ORDER BY created_at`, [tenant]);
      assert.deepEqual(eventRows.rows.map(row => row.event_type),
        ['invite.sent', 'invite.accepted']);
      assert.equal(JSON.stringify(eventRows.rows).includes(created.token), false);
      await client.query(`UPDATE projects SET status = 'ACTIVE' WHERE id = $1`, [project]);
      await assert.rejects(createInvite(repo, client, {
        tenantId: tenant, projectId: project, companyId: company,
        actorId: admin, email: 'other@site.example', role: 'REQUESTER',
      }), ForbiddenError);
      await assert.rejects(acceptInvite(repo, new UserRepository(), client,
        { token: created.token, authenticatedUserId: foreignUser }), ConflictError);
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });
