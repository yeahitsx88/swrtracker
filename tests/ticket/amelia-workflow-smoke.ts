import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { Pool } from 'pg';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { createTicket } from '@/modules/ticket/application/create-ticket';
import { submitTicket } from '@/modules/ticket/application/submit-ticket';
import { approveTicket } from '@/modules/ticket/application/approve-ticket';
import { assignTicket } from '@/modules/ticket/application/assign-ticket';
import { startTicket } from '@/modules/ticket/application/start-ticket';
import { reportFieldInability } from '@/modules/ticket/application/field-inability';
import { returnTicketForCorrection } from '@/modules/ticket/application/return-ticket-for-correction';
import { reviseNeedBy } from '@/modules/ticket/application/revise-need-by';
import { revisePriority } from '@/modules/ticket/application/revise-priority';
import { completeTicket } from '@/modules/ticket/application/complete-ticket';
import { updateRequesterTicket } from '@/modules/ticket/application/update-requester-ticket';
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
  if (process.env.SWR_B2_DISPOSABLE_DB !== '1') throw new Error('SWR_B2_DISPOSABLE_DB=1 is required');
  const pool = new Pool({ connectionString: required('DATABASE_URL') });
  try {
    const { rows: identity } = await pool.query<{ db: string; data_dir: string }>(
      `SELECT current_database() AS db, current_setting('data_directory') AS data_dir`,
    );
    assert.equal(identity[0]?.db, 'swr_b2_test');
    assert.equal(realpathSync(identity[0]!.data_dir), realpathSync(required('SWR_B2_DATA_DIR')));

    const ids = Object.fromEntries(
      ['tenant', 'project', 'gc', 'subco', 'manager', 'requester', 'pc', 'im', 'level', 'aor', 'department']
        .map((key) => [key, randomUUID()]),
    ) as Record<string, UUID>;
    const id = (key: string): UUID => ids[key]!;

    await transaction(pool, async (db) => {
      await db.query('INSERT INTO tenants (id, name) VALUES ($1, $2)', [id('tenant'), 'B2 disposable tenant']);
      await db.query("INSERT INTO companies (id, tenant_id, name, type) VALUES ($1, $2, 'GC', 'GC'), ($3, $2, 'Subco', 'SUBCONTRACTOR')",
        [id('gc'), id('tenant'), id('subco')]);
      await db.query("INSERT INTO projects (id, tenant_id, name, status) VALUES ($1, $2, 'Amelia', 'ACTIVE')",
        [id('project'), id('tenant')]);
      for (const [user, company] of [['manager', 'gc'], ['requester', 'subco'], ['pc', 'gc'], ['im', 'gc']] as const) {
        await db.query(
          `INSERT INTO users (id, tenant_id, company_id, email, name, auth_method)
           VALUES ($1, $2, $3, $4, $5, 'LOCAL')`,
          [id(user), id('tenant'), id(company), `${user}-${id('tenant')}@example.com`, user],
        );
      }
      for (const [user, role] of [['manager', 'SURVEY_MANAGER'], ['requester', 'REQUESTER'], ['pc', 'PARTY_CHIEF'], ['im', 'INSTRUMENT_MAN']] as const) {
        await db.query('INSERT INTO project_memberships (project_id, user_id, role) VALUES ($1, $2, $3)',
          [id('project'), id(user), role]);
      }
      await db.query("INSERT INTO aor_levels (id, project_id, tenant_id, depth, label) VALUES ($1, $2, $3, 0, 'Area')",
        [id('level'), id('project'), id('tenant')]);
      await db.query("INSERT INTO aor_nodes (id, project_id, tenant_id, level_id, name, code) VALUES ($1, $2, $3, $4, 'Area 1', 'A1')",
        [id('aor'), id('project'), id('tenant'), id('level')]);
      await db.query(
        "INSERT INTO departments (id, tenant_id, project_id, name, manager_title, created_by) VALUES ($1, $2, $3, 'Construction', 'Construction Manager', $4)",
        [id('department'), id('tenant'), id('project'), id('manager')],
      );
    });

    const repo = new TicketRepository();
    const created = await transaction(pool, (db) => createTicket(repo, db, {
      tenantId: id('tenant'),
      projectId: id('project'),
      aorNodeId: id('aor'),
      departmentId: id('department'),
      companyId: id('subco'),
      requesterId: id('requester'),
      ticketType: 'LAYOUT',
      workflowVariant: 'STANDARD_APPROVAL',
      craft: 'Civil',
      description: 'B2 lifecycle smoke',
      requestedDate: new Date(Date.now() + 4 * 86400000),
    }));
    const submit = () => transaction(pool, (db) => submitTicket(repo, db, {
      tenantId: id('tenant'), ticketId: created.id, actorId: id('requester'), actorRole: 'REQUESTER',
      departmentId: id('department'),
    }));
    const firstSubmitted = await submit();
    const durableNumber = firstSubmitted.ticketNumber;
    const firstSubmittedAt = firstSubmitted.firstSubmittedAt;
    await transaction(pool, (db) => approveTicket(repo, db, {
      tenantId: id('tenant'), ticketId: created.id, actorId: id('manager'), actorRole: 'SURVEY_MANAGER',
    }));
    const pcOnly = await transaction(pool, (db) => assignTicket(repo, db, {
      tenantId: id('tenant'), ticketId: created.id, actorId: id('manager'), actorRole: 'SURVEY_MANAGER',
      assignedPartyChiefId: id('pc'), assignedInstrumentManId: null, surveyLeadId: id('manager'),
    }));
    assert.equal(pcOnly.status, 'APPROVED');
    await transaction(pool, (db) => assignTicket(repo, db, {
      tenantId: id('tenant'), ticketId: created.id, actorId: id('pc'), actorRole: 'PARTY_CHIEF',
      assignedPartyChiefId: id('pc'), assignedInstrumentManId: id('im'), surveyLeadId: id('manager'),
    }));
    await transaction(pool, (db) => startTicket(repo, db, {
      tenantId: id('tenant'), ticketId: created.id, actorId: id('im'), actorRole: 'INSTRUMENT_MAN',
    }));
    const pending = await transaction(pool, (db) => reportFieldInability(repo, db, {
      tenantId: id('tenant'), ticketId: created.id, actorId: id('im'), actorRole: 'INSTRUMENT_MAN',
      reason: 'Control unavailable',
    }));
    assert.equal(pending.fieldValidationReviewerId, id('pc'));
    await transaction(pool, (db) => returnTicketForCorrection(repo, db, {
      tenantId: id('tenant'), ticketId: created.id, actorId: id('pc'), actorRole: 'PARTY_CHIEF',
      reason: 'Provide revised control', origin: 'FIELD_INABILITY',
    }));
    await transaction(pool, (db) => updateRequesterTicket(repo, db, {
      tenantId: id('tenant'), ticketId: created.id, actorId: id('requester'), actorRole: 'REQUESTER',
      changes: { description: 'B2 lifecycle smoke with revised control' },
    }));
    const resubmitted = await submit();
    assert.equal(resubmitted.ticketNumber, durableNumber);
    assert.equal(resubmitted.firstSubmittedAt?.getTime(), firstSubmittedAt?.getTime());
    assert.equal(resubmitted.returnCycle, 1);
    await transaction(pool, (db) => approveTicket(repo, db, {
      tenantId: id('tenant'), ticketId: created.id, actorId: id('manager'), actorRole: 'SURVEY_MANAGER',
    }));
    await transaction(pool, (db) => revisePriority(repo, db, {
      tenantId: id('tenant'), ticketId: created.id, actorId: id('manager'), actorRole: 'SURVEY_MANAGER',
      priority: 'HIGH', reason: 'Coordinate urgent civil hold point',
    }));
    await transaction(pool, (db) => reviseNeedBy(repo, db, {
      tenantId: id('tenant'), ticketId: created.id, actorId: id('manager'), actorRole: 'SURVEY_MANAGER',
      requestedDate: new Date(Date.now() + 6 * 86400000), reason: 'Requester coordination changed',
    }));
    await transaction(pool, (db) => assignTicket(repo, db, {
      tenantId: id('tenant'), ticketId: created.id, actorId: id('manager'), actorRole: 'SURVEY_MANAGER',
      assignedPartyChiefId: null, assignedInstrumentManId: id('im'), surveyLeadId: id('manager'),
    }));
    await transaction(pool, (db) => startTicket(repo, db, {
      tenantId: id('tenant'), ticketId: created.id, actorId: id('im'), actorRole: 'INSTRUMENT_MAN',
    }));
    const completed = await transaction(pool, (db) => completeTicket(repo, db, {
      tenantId: id('tenant'), ticketId: created.id, actorId: id('im'), actorRole: 'INSTRUMENT_MAN',
    }));
    assert.equal(completed.status, 'COMPLETED');

    const { rows: proof } = await pool.query<{
      status: string; return_cycles: string; assignments: string; need_by_revisions: string; notifications: string;
    }>(
      `SELECT t.status,
         (SELECT COUNT(*) FROM ticket_return_cycles r WHERE r.ticket_id = t.id) AS return_cycles,
         (SELECT COUNT(*) FROM ticket_assignment_history a WHERE a.ticket_id = t.id) AS assignments,
         (SELECT COUNT(*) FROM ticket_need_by_revisions n WHERE n.ticket_id = t.id) AS need_by_revisions,
         (SELECT COUNT(*) FROM notification_outbox o WHERE o.ticket_id = t.id) AS notifications
       FROM tickets t WHERE t.id = $1 AND t.tenant_id = $2`,
      [created.id, id('tenant')],
    );
    assert.deepEqual(proof[0], {
      status: 'COMPLETED', return_cycles: '1', assignments: '3', need_by_revisions: '1', notifications: '12',
    });
    console.log('B2 Amelia workflow smoke passed: optional PC, direct IM, return/resubmit, priority, Need-By, completion');
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
