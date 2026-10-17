import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { Pool, type PoolClient } from 'pg';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import type { UUID } from '@/shared/types';

const EXPECTED_DATABASE = 'swr_history_compat_test';
const FIXTURE_AFTER_MIGRATION = '021_identity_tenant_boundary_hardening.sql';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function applyMigration(client: PoolClient, directory: string, filename: string): Promise<void> {
  const sql = await readFile(path.join(directory, filename), 'utf8');
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [filename]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function insertHistoricalFixture(client: PoolClient): Promise<Record<string, UUID>> {
  const ids = Object.fromEntries(
    ['tenant', 'project', 'gcCompany', 'subcontractor', 'requester', 'surveyLead', 'level', 'aor', 'department',
      'rejected', 'fieldCanceled', 'resubmitted', 'attachment']
      .map((key) => [key, randomUUID()]),
  ) as Record<string, UUID>;
  const id = (key: string): UUID => ids[key]!;

  await client.query('BEGIN');
  try {
    await client.query("INSERT INTO tenants (id, name) VALUES ($1, 'Historical compatibility tenant')", [id('tenant')]);
    await client.query(
      `INSERT INTO companies (id, tenant_id, name, type)
       VALUES ($1, $2, 'Legacy general contractor', 'GC'),
              ($3, $2, 'Legacy subcontractor', 'SUBCONTRACTOR')`,
      [id('gcCompany'), id('tenant'), id('subcontractor')],
    );
    await client.query(
      "INSERT INTO projects (id, tenant_id, name, status) VALUES ($1, $2, 'Historical Amelia', 'ACTIVE')",
      [id('project'), id('tenant')],
    );
    await client.query(
      `INSERT INTO users (id, tenant_id, company_id, email, name, auth_method)
       VALUES ($1, $2, $3, 'requester@history.invalid', 'Historical Requester', 'LOCAL'),
              ($4, $2, $5, 'lead@history.invalid', 'Historical Survey Lead', 'LOCAL')`,
      [id('requester'), id('tenant'), id('subcontractor'), id('surveyLead'), id('gcCompany')],
    );
    await client.query(
      `INSERT INTO project_memberships (project_id, user_id, role)
       VALUES ($1, $2, 'REQUESTER'), ($1, $3, 'SURVEY_MANAGER')`,
      [id('project'), id('requester'), id('surveyLead')],
    );
    await client.query(
      "INSERT INTO aor_levels (id, project_id, tenant_id, depth, label) VALUES ($1, $2, $3, 0, 'Area')",
      [id('level'), id('project'), id('tenant')],
    );
    await client.query(
      "INSERT INTO aor_nodes (id, project_id, tenant_id, level_id, name, code) VALUES ($1, $2, $3, $4, 'Legacy Area', 'LEG')",
      [id('aor'), id('project'), id('tenant'), id('level')],
    );
    await client.query(
      `INSERT INTO departments (id, project_id, tenant_id, name, manager_title, created_by)
       VALUES ($1, $2, $3, 'Legacy Construction', 'Manager', $4)`,
      [id('department'), id('project'), id('tenant'), id('surveyLead')],
    );

    const ticketSql = `INSERT INTO tickets (
      id, tenant_id, project_id, aor_node_id, department_id, company_id,
      ticket_number, ticket_type, requester_id, survey_lead_id, workflow_variant,
      status, craft, description, requested_date, submitted_at, closed_at,
      rejection_reason, parent_ticket_id, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, 'LAYOUT', $8, $9, 'STANDARD_APPROVAL',
      $10, 'Civil', $11, $12::date, $13::timestamptz, $14::timestamptz,
      $15, $16, $17::timestamptz, $18::timestamptz
    )`;
    const common = [id('tenant'), id('project'), id('aor'), id('department'), id('subcontractor')];
    await client.query(ticketSql, [
      id('rejected'), ...common, 'FSS-LEG-00001', id('requester'), id('surveyLead'), 'REJECTED',
      'Legacy rejected request', '2025-01-15', '2025-01-10T14:00:00Z', '2025-01-10T15:00:00Z',
      'Insufficient control information', null, '2025-01-09T13:00:00Z', '2025-01-10T15:00:00Z',
    ]);
    await client.query(ticketSql, [
      id('fieldCanceled'), ...common, 'FSS-LEG-00002', id('requester'), id('surveyLead'), 'FIELD_CANCELED',
      'Legacy field canceled request', '2025-01-16', '2025-01-11T14:00:00Z', '2025-01-12T17:00:00Z',
      null, null, '2025-01-10T13:00:00Z', '2025-01-12T17:00:00Z',
    ]);
    await client.query(ticketSql, [
      id('resubmitted'), ...common, 'FSS-LEG-00003', id('requester'), id('surveyLead'), 'SUBMITTED',
      'Legacy linked resubmission', '2025-01-18', '2025-01-13T14:00:00Z', null,
      null, id('rejected'), '2025-01-13T13:00:00Z', '2025-01-13T14:00:00Z',
    ]);
    await client.query(
      `INSERT INTO attachments
        (id, ticket_id, tenant_id, uploaded_by, filename, mime_type, storage_key, size_bytes, created_at)
       VALUES ($1, $2, $3, $4, 'legacy-layout.pdf', 'application/pdf', 'legacy/object/key', 2048,
               '2025-01-09T13:30:00Z')`,
      [id('attachment'), id('rejected'), id('tenant'), id('requester')],
    );
    await client.query('COMMIT');
    return ids;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function historicalSnapshot(client: PoolClient, tenantId: UUID): Promise<unknown[]> {
  const { rows } = await client.query(
    `SELECT id, ticket_number, status, description, requested_date::text, submitted_at::text,
            closed_at::text, rejection_reason, parent_ticket_id, created_at::text, updated_at::text
     FROM tickets WHERE tenant_id = $1 ORDER BY ticket_number`,
    [tenantId],
  );
  return rows;
}

async function main(): Promise<void> {
  if (process.env.SWR_HISTORY_COMPAT_DISPOSABLE_DB !== '1') {
    throw new Error('SWR_HISTORY_COMPAT_DISPOSABLE_DB=1 is required');
  }

  const pool = new Pool({ connectionString: required('DATABASE_URL') });
  const client = await pool.connect();
  try {
    const { rows: identity } = await client.query<{ db: string; data_dir: string }>(
      `SELECT current_database() AS db, current_setting('data_directory') AS data_dir`,
    );
    assert.equal(identity[0]?.db, EXPECTED_DATABASE);
    assert.equal(
      realpathSync(identity[0]!.data_dir),
      realpathSync(required('SWR_HISTORY_COMPAT_DATA_DIR')),
      'database must be hosted by the declared disposable PostgreSQL cluster',
    );
    const { rows: existing } = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM pg_tables WHERE schemaname = 'public'`,
    );
    assert.equal(existing[0]?.count, '0', 'historical compatibility smoke requires an empty disposable database');

    const migrationsDir = path.join(process.cwd(), 'db', 'migrations');
    const migrations = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();
    assert.equal(migrations.length, 23, 'expected migrations 001 through 023');
    assert.equal(migrations[0]?.slice(0, 3), '001');
    assert.equal(migrations.at(-1)?.slice(0, 3), '023');
    await client.query(`CREATE TABLE _migrations (
      id SERIAL PRIMARY KEY, filename TEXT NOT NULL UNIQUE, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

    let ids: Record<string, UUID> | undefined;
    let before: unknown[] | undefined;
    for (const migration of migrations) {
      await applyMigration(client, migrationsDir, migration);
      if (migration === FIXTURE_AFTER_MIGRATION) {
        ids = await insertHistoricalFixture(client);
        before = await historicalSnapshot(client, ids.tenant!);
      }
    }
    assert.ok(ids && before, 'historical fixture insertion point was not reached');
    const id = (key: string): UUID => ids![key]!;

    assert.deepEqual(await historicalSnapshot(client, id('tenant')), before,
      'migrations 022-023 must not reinterpret historical ticket fields');

    const { rows: attachmentRows } = await client.query<{
      filename: string; purpose: string; return_cycle: number; content_sha256: string | null;
    }>(
      `SELECT filename, purpose, return_cycle, content_sha256 FROM attachments WHERE id = $1`,
      [id('attachment')],
    );
    assert.deepEqual(attachmentRows[0], {
      filename: 'legacy-layout.pdf', purpose: 'REQUEST_INSTRUCTION', return_cycle: 0, content_sha256: null,
    });

    const { rows: additiveRows } = await client.query<{
      id: string; first_submitted_at: Date | null; original_requested_date: string; return_cycle: number;
      field_validation_reviewer_id: string | null;
    }>(
      `SELECT id, first_submitted_at, original_requested_date::text, return_cycle, field_validation_reviewer_id
       FROM tickets WHERE tenant_id = $1 ORDER BY ticket_number`,
      [id('tenant')],
    );
    assert.equal(additiveRows.length, 3);
    assert.ok(additiveRows.every((row) => row.return_cycle === 0 && row.field_validation_reviewer_id === null));
    assert.ok(additiveRows.every((row) => row.first_submitted_at instanceof Date));
    assert.deepEqual(additiveRows.map((row) => row.original_requested_date), ['2025-01-15', '2025-01-16', '2025-01-18']);

    const { rows: noSyntheticHistory } = await client.query<{ returns: number; assignments: number; notifications: number }>(
      `SELECT (SELECT COUNT(*)::int FROM ticket_return_cycles) AS returns,
              (SELECT COUNT(*)::int FROM ticket_assignment_history) AS assignments,
              (SELECT COUNT(*)::int FROM notification_outbox) AS notifications`,
    );
    assert.deepEqual(noSyntheticHistory[0], { returns: 0, assignments: 0, notifications: 0 });

    const repository = new TicketRepository();
    const surveyVisibility = {
      actorId: id('surveyLead'), actorRole: 'SURVEY_MANAGER' as const,
      projectId: id('project'), companyId: id('gcCompany'), companyType: 'GC',
    };
    const requesterVisibility = {
      actorId: id('requester'), actorRole: 'REQUESTER' as const,
      projectId: id('project'), companyId: id('subcontractor'), companyType: 'SUBCONTRACTOR',
    };
    const rejected = await repository.findById(client, id('tenant'), id('rejected'), surveyVisibility);
    const canceled = await repository.findById(client, id('tenant'), id('fieldCanceled'), requesterVisibility);
    const linked = await repository.findById(client, id('tenant'), id('resubmitted'), requesterVisibility);
    assert.equal(rejected?.status, 'REJECTED');
    assert.equal(rejected?.rejectionReason, 'Insufficient control information');
    assert.equal(canceled?.status, 'FIELD_CANCELED');
    assert.equal(linked?.status, 'SUBMITTED');
    assert.equal(linked?.parentTicketId, id('rejected'));
    const visible = await repository.list(client, id('tenant'), {
      projectId: id('project'), visibility: surveyVisibility, limit: 10, offset: 0,
    });
    assert.equal(visible.total, 3);
    assert.deepEqual(new Set(visible.data.map((ticket) => ticket.status)), new Set(['REJECTED', 'FIELD_CANCELED', 'SUBMITTED']));

    console.log('Historical compatibility smoke passed: legacy states, parent linkage, attachment defaults, and visibility survived migrations 001-023');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
