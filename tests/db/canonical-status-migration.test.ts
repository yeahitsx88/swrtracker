import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { Client } from 'pg';

const migrations = path.join(process.cwd(), 'db', 'migrations');
const migration019 = readFileSync(path.join(migrations,
  '019_canonical_ticket_statuses.sql'), 'utf8');

test('migration 019 rejects ambiguity atomically, maps evidenced legacy states, and reruns',
  { skip: !process.env.DATABASE_URL }, async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const schema = `migration_019_${randomUUID().replaceAll('-', '')}`;
    try {
      await client.query('BEGIN');
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET LOCAL search_path TO "${schema}", public`);
      for (const file of readdirSync(migrations).filter(name =>
        /^0(0[1-9]|1[0-8])_.*\.sql$/.test(name)).sort()) {
        await client.query(readFileSync(path.join(migrations, file), 'utf8'));
      }

      const tenant = randomUUID();
      const company = randomUUID();
      const requester = randomUUID();
      const chief = randomUUID();
      const project = randomUUID();
      const area = randomUUID();
      const subarea = randomUUID();
      await client.query('INSERT INTO tenants(id,name) VALUES ($1,$2)', [tenant, 'Migration fixture']);
      await client.query(`INSERT INTO companies(id,tenant_id,name,type)
        VALUES ($1,$2,'GC','GC')`, [company, tenant]);
      await client.query(`INSERT INTO users(id,tenant_id,company_id,email,password_hash,name)
        VALUES ($1,$3,$4,'requester@example.test','x','Requester'),
               ($2,$3,$4,'chief@example.test','x','Chief')`,
        [requester, chief, tenant, company]);
      await client.query(`INSERT INTO projects(id,tenant_id,name,status)
        VALUES ($1,$2,'Legacy','SETUP')`, [project, tenant]);
      await client.query(`INSERT INTO areas(id,project_id,tenant_id,name,code)
        VALUES ($1,$2,$3,'Area','AR')`, [area, project, tenant]);
      await client.query(`INSERT INTO subareas(id,area_id,project_id,tenant_id,name)
        VALUES ($1,$2,$3,$4,'Subarea')`, [subarea, area, project, tenant]);

      const tickets = Array.from({ length: 5 }, () => randomUUID());
      const statuses = ['CLOSED', 'CANCEL_REQUESTED', 'CANCEL_APPROVED',
        'CANCEL_REJECTED', 'CANCEL_APPROVED'];
      for (let index = 0; index < tickets.length; index += 1) {
        await client.query(`INSERT INTO tickets
          (id,tenant_id,project_id,area_id,subarea_id,company_id,ticket_number,
           requester_id,assigned_party_chief_id,workflow_variant,status,craft,
           description,requested_date,ticket_type,assigned_at,started_at,
           completed_at,closed_at,cancel_reason,cancel_initiated_by,
           cancel_initiated_at,cancel_initiator_role)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'STANDARD_APPROVAL',$10,
                  'SURVEY','Legacy fixture',CURRENT_DATE,'LAYOUT',
                  '2026-01-01 09:00Z',$11,$12,$13,$14,$15,$16,$17)`, [
          tickets[index], tenant, project, area, subarea, company,
          `FSS-AR-${String(index + 1).padStart(5, '0')}`, requester, chief,
          statuses[index],
          index === 0 || index === 3 ? '2026-01-01 10:00Z' : null,
          index === 0 ? '2026-01-01 11:00Z' : null,
          index === 0 ? '2026-01-01 12:00Z' : null,
          index === 1 ? 'Scope changed' : null,
          index === 1 ? chief : null,
          index === 1 ? '2026-01-01 11:00Z' : null,
          index === 1 ? 'PARTY_CHIEF' : null,
        ]);
      }

      const event = async (ticket: number, kind: string, hour: number,
        actor = chief) => client.query(`INSERT INTO ticket_events
          (ticket_id,tenant_id,actor_id,event_type,created_at)
          VALUES ($1,$2,$3,$4,$5)`,
        [tickets[ticket], tenant, actor, kind,
          `2026-01-01 ${String(hour).padStart(2, '0')}:00Z`]);
      await event(0, 'ticket.assigned', 9);
      await event(0, 'ticket.in_progress', 10);
      await event(0, 'ticket.completed', 11);
      await event(0, 'ticket.closed', 12);
      await event(1, 'ticket.assigned', 10);
      await event(1, 'ticket.cancel_requested', 11);
      await event(2, 'ticket.assigned', 10);
      await event(2, 'ticket.cancel_requested', 11, requester);
      await event(2, 'ticket.cancel_approved', 12);
      await event(3, 'ticket.assigned', 9);
      await event(3, 'ticket.in_progress', 10);
      await event(3, 'ticket.cancel_requested', 11);
      await event(3, 'ticket.cancel_rejected', 12, requester);
      await event(4, 'ticket.assigned', 10);
      await event(4, 'ticket.cancel_requested', 11);
      await event(4, 'ticket.cancel_approved', 12, requester);

      await client.query('SAVEPOINT ambiguous');
      await assert.rejects(client.query(migration019),
        /requires manual resolution/);
      await client.query('ROLLBACK TO SAVEPOINT ambiguous');
      const before = await client.query<{ status: string }>(
        'SELECT status FROM tickets WHERE id = $1', [tickets[0]]);
      assert.equal(before.rows[0]?.status, 'CLOSED');

      // An operator explicitly classifies the one unprovable cancellation.
      await client.query(`UPDATE tickets SET status = 'SURVEY_CANCELED',
        canceled_at = '2026-01-01 12:00Z' WHERE id = $1`, [tickets[4]]);
      await event(4, 'ticket.survey_canceled', 13, requester);
      const auditCount = await client.query<{ count: string }>(
        'SELECT count(*) FROM ticket_events');

      await client.query(migration019);
      const after = await client.query<{ status: string; canceled_at: Date | null;
        cancel_initiated_at: Date | null }>(
        'SELECT status,canceled_at,cancel_initiated_at FROM tickets WHERE id = ANY($1) ORDER BY ticket_number',
        [tickets]);
      assert.deepEqual(after.rows.map(row => row.status), [
        'COMPLETED', 'ASSIGNED', 'REQUESTER_CANCELED',
        'IN_PROGRESS', 'SURVEY_CANCELED',
      ]);
      assert.equal(after.rows[1]?.cancel_initiated_at instanceof Date, true);
      assert.equal(after.rows[2]?.canceled_at instanceof Date, true);
      assert.equal(after.rows[3]?.cancel_initiated_at, null);
      // The production runner uses a new transaction for each migration run.
      await client.query('DROP TABLE phase2_status_backfill');
      await client.query(migration019);
      const finalAuditCount = await client.query<{ count: string }>(
        'SELECT count(*) FROM ticket_events');
      assert.equal(finalAuditCount.rows[0]?.count, auditCount.rows[0]?.count);
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });
