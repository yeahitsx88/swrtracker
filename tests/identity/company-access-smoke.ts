import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { Pool } from 'pg';
import { NextRequest } from 'next/server';
import { handlePostRegister } from '@/app/api/auth/register/handler';
import { createUser } from '@/modules/identity/application/create-user';
import { UserRepository } from '@/modules/identity/infrastructure/user.repository';
import { CompanyAccessRepository } from '@/modules/identity/infrastructure/company-access.repository';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { requesterCancel } from '@/modules/ticket/application/requester-cancel';
import { assertAccessAdministrator } from '@/lib/access-administrator';
import { getProjectRole } from '@/lib/get-project-role';
import type { DbClient, UUID } from '@/shared/types';

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

async function transaction<T>(pool: Pool, fn: (db: DbClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  if (process.env.SWR_B1_DISPOSABLE_DB !== '1') {
    throw new Error('SWR_B1_DISPOSABLE_DB=1 is required');
  }
  const pool = new Pool({ connectionString: required('DATABASE_URL') });
  try {
    const { rows: identity } = await pool.query<{ db: string; data_dir: string }>(
      `SELECT current_database() AS db, current_setting('data_directory') AS data_dir`,
    );
    assert.equal(identity[0]?.db, 'swr_b1_test');
    assert.equal(realpathSync(identity[0]!.data_dir), realpathSync(required('SWR_B1_DATA_DIR')));

    const id = Object.fromEntries(
      ['tenant', 'project1', 'project2', 'gc', 'companyA', 'companyB', 'admin', 'projectIT', 'authority',
        'coworker', 'outsider', 'aorLevel1', 'aorLevel2', 'aor1', 'aor2',
        'ownTicket', 'coworkerTicket', 'outsiderTicket', 'project2Ticket', 'project2CoworkerTicket'].map((key) => [key, randomUUID()]),
    ) as Record<string, UUID>;
    const at = (key: string): UUID => {
      const value = id[key];
      if (!value) throw new Error(`Missing fixture ${key}`);
      return value;
    };

    await transaction(pool, async (db) => {
      await db.query('INSERT INTO tenants (id, name) VALUES ($1, $2)', [at('tenant'), 'B1 disposable tenant']);
      for (const [key, name, type] of ([
        ['gc', 'GC', 'GC'], ['companyA', 'Subcontractor A', 'SUBCONTRACTOR'],
        ['companyB', 'Subcontractor B', 'SUBCONTRACTOR'],
      ] as const)) {
        await db.query('INSERT INTO companies (id, tenant_id, name, type) VALUES ($1, $2, $3, $4)',
          [at(key), at('tenant'), name, type]);
      }
      for (const project of ['project1', 'project2']) {
        await db.query('INSERT INTO projects (id, tenant_id, name, status) VALUES ($1, $2, $3, $4)',
          [at(project), at('tenant'), project, 'ACTIVE']);
      }
      for (const [user, company] of ([['admin', 'gc'], ['projectIT', 'gc'], ['coworker', 'companyA'], ['outsider', 'companyB']] as const)) {
        await db.query(
          'INSERT INTO users (id, tenant_id, company_id, email, name, auth_method) VALUES ($1, $2, $3, $4, $5, $6)',
          [at(user), at('tenant'), at(company), `${user}-${at('tenant')}@example.com`, user, 'LOCAL'],
        );
      }
      await db.query('INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES ($1, $2, $3)',
        [at('tenant'), at('admin'), 'TENANT_ADMIN']);
      await db.query('INSERT INTO project_memberships (project_id, user_id, role) VALUES ($1, $2, $3)',
        [at('project1'), at('projectIT'), 'PROJECT_ADMIN']);
      for (const [user, project] of ([['coworker', 'project1'], ['coworker', 'project2'], ['outsider', 'project1']] as const)) {
        await db.query('INSERT INTO project_memberships (project_id, user_id, role) VALUES ($1, $2, $3)',
          [at(project), at(user), 'REQUESTER']);
      }
      for (const [project, level, node] of ([
        ['project1', 'aorLevel1', 'aor1'], ['project2', 'aorLevel2', 'aor2'],
      ] as const)) {
        await db.query('INSERT INTO aor_levels (id, project_id, tenant_id, depth, label) VALUES ($1, $2, $3, 0, $4)',
          [at(level), at(project), at('tenant'), 'AREA']);
        await db.query(
          'INSERT INTO aor_nodes (id, project_id, tenant_id, level_id, name, code) VALUES ($1, $2, $3, $4, $5, $6)',
          [at(node), at(project), at('tenant'), at(level), node, node],
        );
      }
    });

    await assertAccessAdministrator(pool, {
      tenantId: at('tenant'), userId: at('admin'), sessionVersion: 1,
    }, at('project2'));
    await assertAccessAdministrator(pool, {
      tenantId: at('tenant'), userId: at('projectIT'), sessionVersion: 1,
    }, at('project1'));
    await assert.rejects(() => assertAccessAdministrator(pool, {
      tenantId: at('tenant'), userId: at('projectIT'), sessionVersion: 1,
    }, at('project2')));
    await assert.rejects(() => assertAccessAdministrator(pool, {
      tenantId: at('tenant'), userId: at('coworker'), sessionVersion: 1,
    }, at('project1')));
    await pool.query(
      `UPDATE project_memberships SET role = 'SURVEY_MANAGER' WHERE project_id = $1 AND user_id = $2`,
      [at('project1'), at('outsider')],
    );
    await assert.rejects(() => getProjectRole(pool, at('tenant'), at('project1'), at('outsider'), 1));
    await pool.query(
      `UPDATE project_memberships SET role = 'REQUESTER' WHERE project_id = $1 AND user_id = $2`,
      [at('project1'), at('outsider')],
    );

    const accessRepo = new CompanyAccessRepository();
    const invite = await accessRepo.createRequesterInvite(pool, {
      tenantId: at('tenant'), projectId: at('project1'), companyId: at('companyA'),
      email: `authority-${at('tenant')}@example.com`, invitedBy: at('admin'),
      expiresAt: new Date(Date.now() + 86400000),
    });
    assert.ok(invite);

    const registration = (companyId?: UUID) => new NextRequest('http://localhost/api/auth/register', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenantId: at('tenant'), companyId,
        email: `authority-${at('tenant')}@example.com`, password: 'strong-password',
        name: 'Authority', inviteToken: invite.token,
      }),
    });
    const deps = {
      db: pool,
      createRepo: () => new UserRepository(),
      createUser,
      withTransaction: <T>(fn: (db: DbClient) => Promise<T>) => transaction(pool, fn),
    };
    assert.equal((await handlePostRegister(registration(at('companyB')), deps)).status, 400);
    const registered = await handlePostRegister(registration(), deps);
    assert.equal(registered.status, 201);
    const user = (await registered.json() as { user: { id: UUID } }).user;
    id.authority = user.id;
    assert.equal((await handlePostRegister(registration(), deps)).status, 400);
    const { rows: boundUsers } = await pool.query<{ company_id: string }>(
      'SELECT company_id FROM users WHERE tenant_id = $1 AND id = $2', [at('tenant'), at('authority')],
    );
    assert.equal(boundUsers[0]?.company_id, at('companyA'));
    await pool.query('INSERT INTO project_memberships (project_id, user_id, role) VALUES ($1, $2, $3)',
      [at('project2'), at('authority'), 'REQUESTER']);

    await transaction(pool, async (db) => {
      for (const [ticket, project, node, company, requester] of ([
        ['ownTicket', 'project1', 'aor1', 'companyA', 'authority'],
        ['coworkerTicket', 'project1', 'aor1', 'companyA', 'coworker'],
        ['outsiderTicket', 'project1', 'aor1', 'companyB', 'outsider'],
        ['project2Ticket', 'project2', 'aor2', 'companyA', 'authority'],
        ['project2CoworkerTicket', 'project2', 'aor2', 'companyA', 'coworker'],
      ] as const)) {
        await db.query(
          `INSERT INTO tickets
             (id, tenant_id, project_id, aor_node_id, company_id, requester_id,
              workflow_variant, status, craft, description, requested_date, ticket_type)
           VALUES ($1, $2, $3, $4, $5, $6, 'STANDARD_APPROVAL', 'DRAFT', 'Civil', 'B1 fixture', CURRENT_DATE, 'LAYOUT')`,
          [at(ticket), at('tenant'), at(project), at(node), at(company), at(requester)],
        );
      }
    });

    const ticketRepo = new TicketRepository();
    const scope = (projectId = at('project1')) => ({
      actorId: at('authority'), actorRole: 'REQUESTER' as const,
      projectId, companyId: at('companyA'), companyType: 'SUBCONTRACTOR',
    });
    const list = async (projectId: UUID) =>
      (await ticketRepo.list(pool, at('tenant'), {
        projectId, visibility: scope(projectId), limit: 20, offset: 0,
      })).data.map((ticket) => ticket.id);
    assert.deepEqual(await list(at('project1')), [at('ownTicket')]);
    assert.equal(await ticketRepo.hasCompanyAuthority(pool, at('tenant'), at('project1'), at('authority'), at('companyA')), false);

    const grant = await transaction(pool, async (db) => {
      const created = await accessRepo.grantCompanyAuthority(db, {
        tenantId: at('tenant'), projectId: at('project1'), userId: at('authority'), actorId: at('admin'),
      });
      assert.ok(created);
      await accessRepo.appendEvent(db, created, at('admin'), 'COMPANY_AUTHORITY_GRANTED');
      return created;
    });
    assert.equal(await ticketRepo.hasCompanyAuthority(pool, at('tenant'), at('project1'), at('authority'), at('companyA')), true);
    assert.deepEqual(new Set(await list(at('project1'))), new Set([at('ownTicket'), at('coworkerTicket')]));
    assert.deepEqual(await list(at('project2')), [at('project2Ticket')]);
    assert.equal(await ticketRepo.findById(pool, at('tenant'), at('outsiderTicket'), scope()), null);
    assert.equal(await ticketRepo.findById(pool, at('tenant'), at('project2CoworkerTicket'), scope()), null);
    assert.equal((await ticketRepo.findById(pool, at('tenant'), at('coworkerTicket'), scope()))?.id, at('coworkerTicket'));
    await assert.rejects(() => requesterCancel(ticketRepo, pool, {
      tenantId: at('tenant'), ticketId: at('coworkerTicket'), actorId: at('authority'),
      actorRole: 'REQUESTER', visibility: scope(),
    }));

    await transaction(pool, async (db) => {
      const revoked = await accessRepo.revokeCompanyAuthority(db, {
        tenantId: at('tenant'), projectId: at('project1'), grantId: grant.id, actorId: at('admin'),
      });
      assert.ok(revoked);
      await accessRepo.appendEvent(db, revoked, at('admin'), 'COMPANY_AUTHORITY_REVOKED');
    });
    assert.equal(await ticketRepo.hasCompanyAuthority(pool, at('tenant'), at('project1'), at('authority'), at('companyA')), false);
    assert.deepEqual(await list(at('project1')), [at('ownTicket')]);
    console.log('B1 company access smoke passed: invite binding, one-use token, project/company visibility, revocation');
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
