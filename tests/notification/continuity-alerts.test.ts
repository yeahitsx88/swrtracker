import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { Client, Pool } from 'pg';
import type { UUID } from '@/shared/types';
import {
  composeContinuityAlert, runContinuityAlertCycle,
  type ContinuityAlertRepository, type PendingContinuityAlert,
} from '@/modules/notification/application/continuity-alerts';
import { composeEmail, type EmailMessage, type EmailTransport } from '@/modules/notification/application/index';
import { PgContinuityAlertRepository } from '@/modules/notification/infrastructure/continuity-alert.repository';
import { getProjectContinuityHealth } from '@/modules/tenancy/application/continuity-health';
import { ContinuityHealthRepository } from '@/modules/tenancy/infrastructure/continuity-health.repository';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';

const id = () => randomUUID() as UUID;
const acting: PendingContinuityAlert = {
  id: id(), tenantId: id(), projectId: id(), sourceId: id(),
  kind: 'ACTING_CONFIRMATION_OVERDUE', reminderDay: 1,
  recipientEmail: 'admin@example.test', projectName: 'North Plant',
  vacancyRole: null,
};

test('continuity alert email names the 24h grant and 48h crew escalation', () => {
  const grantEmail = composeContinuityAlert(acting);
  assert.match(grantEmail.subject, /Acting Survey Manager/);
  assert.match(grantEmail.text, /24-hour confirmation window/);
  const vacancyEmail = composeContinuityAlert({ ...acting, id: id(),
    kind: 'CREW_VACANCY_OVERDUE', reminderDay: 2, vacancyRole: 'PARTY_CHIEF' });
  assert.match(vacancyEmail.subject, /Party Chief vacancy/);
  assert.match(vacancyEmail.text, /48-hour window/);
  assert.match(vacancyEmail.text, /day 2/);
  assert.throws(() => composeContinuityAlert({ ...acting,
    kind: 'CREW_VACANCY_OVERDUE' }), /role is missing/);
});

test('Instrument Man reassignment notifies the requester with current-crew guidance', () => {
  const message = composeEmail({
    id: id(), recipientUserId: id(), recipientEmail: 'requester@example.test', attempts: 1,
    event: { id: id(), tenantId: id(), ticketId: id(),
      eventType: 'ticket.im_reassigned', payload: {}, ticketNumber: 'FSS-AR-00001',
      requesterId: id(), assignedInstrumentManId: id() },
  });
  assert.match(message.subject, /crew updated/);
  assert.match(message.text, /Instrument Man/);
});

test('continuity alert claims are marked sent only after SMTP accepts them', async () => {
  const calls: string[] = [];
  const repository: ContinuityAlertRepository = {
    async ingestDueAlerts() { calls.push('ingest'); return 2; },
    async claimDeliveries() { calls.push('claim'); return [acting]; },
    async markSent() { calls.push('sent'); },
    async markFailed() { calls.push('failed'); },
  };
  const transport: EmailTransport = {
    async send(message: EmailMessage) {
      calls.push('smtp');
      assert.equal(message.deliveryId, acting.id);
    },
  };
  assert.deepEqual(await runContinuityAlertCycle(repository, transport),
    { ingested: 2, sent: 1, failed: 0 });
  assert.deepEqual(calls, ['ingest', 'claim', 'smtp', 'sent']);
});

test('continuity alert transport failures remain retryable', async () => {
  let failure = '';
  const repository: ContinuityAlertRepository = {
    async ingestDueAlerts() { return 0; },
    async claimDeliveries() { return [acting]; },
    async markSent() { throw new Error('must not mark sent'); },
    async markFailed(_id, error) { failure = error; },
  };
  const transport: EmailTransport = {
    async send() { throw new Error('SMTP unavailable'); },
  };
  assert.deepEqual(await runContinuityAlertCycle(repository, transport),
    { ingested: 0, sent: 0, failed: 1 });
  assert.equal(failure, 'SMTP unavailable');
});

test('PostgreSQL continuity outbox dedupes by day and skips resolved grants',
  { skip: !process.env.DATABASE_URL }, async () => {
    const setup = new Client({ connectionString: process.env.DATABASE_URL });
    const schema = `continuity_alert_${randomUUID().replaceAll('-', '')}`;
    const now = new Date();
    let pool: Pool | undefined;
    await setup.connect();
    try {
      await setup.query(`CREATE SCHEMA "${schema}"`);
      await setup.query(`SET search_path TO "${schema}", public`);
      const directory = path.join(process.cwd(), 'db', 'migrations');
      for (const file of readdirSync(directory).filter(name =>
        /^0(0[1-9]|1[0-9]|20)_.*\.sql$/.test(name)).sort()) {
        await setup.query(readFileSync(path.join(directory, file), 'utf8'));
      }

      const tenant = id();
      const company = id();
      const tenantAdmin = id();
      const projectAdmin = id();
      const chief = id();
      const missingIm = id();
      const project = id();
      const grant = id();
      const vacancyEvent = id();
      await setup.query(`INSERT INTO tenants(id,name) VALUES ($1,'Tenant')`, [tenant]);
      await setup.query(`INSERT INTO companies(id,tenant_id,name,type)
        VALUES ($1,$2,'GC','GC')`, [company, tenant]);
      await setup.query(`INSERT INTO users
        (id,tenant_id,company_id,email,password_hash,name,deactivated_at) VALUES
        ($1,$5,$6,'tenant-admin@example.test','x','Tenant Admin',NULL),
        ($2,$5,$6,'project-admin@example.test','x','Project Admin',NULL),
        ($3,$5,$6,'chief@example.test','x','Chief',NULL),
        ($4,$5,$6,'im@example.test','x','IM',$7)`,
        [tenantAdmin, projectAdmin, chief, missingIm, tenant, company,
          new Date(now.getTime() - 49 * 3600_000)]);
      await setup.query(`INSERT INTO projects(id,tenant_id,name,status)
        VALUES ($1,$2,'North Plant','ACTIVE')`, [project, tenant]);
      await setup.query(`INSERT INTO tenant_memberships(tenant_id,user_id,role)
        VALUES ($1,$2,'TENANT_ADMIN')`, [tenant, tenantAdmin]);
      await setup.query(`INSERT INTO project_memberships(project_id,user_id,role)
        VALUES ($1,$2,'PROJECT_ADMIN'),($1,$3,'PARTY_CHIEF'),
               ($1,$4,'INSTRUMENT_MAN')`, [project, projectAdmin, chief, missingIm]);
      await setup.query(`INSERT INTO acting_grants
        (id,tenant_id,project_id,user_id,role,scope,trigger,granted_by,
         granted_reason,created_at)
        VALUES ($1,$2,$3,$4,'SURVEY_MANAGER',$5,'VACANCY','SYSTEM',
                'Vacancy',$6)`, [grant, tenant, project, chief,
          JSON.stringify({ projectId: project, actions: ['manage_workflow'] }),
          new Date(now.getTime() - 25 * 3600_000)]);
      await setup.query(`INSERT INTO crew_rosters
        (project_id,tenant_id,party_chief_id,instrument_man_id)
        VALUES ($1,$2,$3,$4)`, [project, tenant, chief, missingIm]);
      await setup.query(`INSERT INTO tenant_events
        (id,tenant_id,actor_id,event_type,payload,created_at)
        VALUES ($1,$2,$3,'user.deactivated',$4,$5)`, [
        vacancyEvent, tenant, tenantAdmin, JSON.stringify({ userId: missingIm }),
        new Date(now.getTime() - 49 * 3600_000),
      ]);

      pool = new Pool({ connectionString: process.env.DATABASE_URL,
        options: `-c search_path=${schema},public` });
      const activeProjects = await pool.query<{ count: string }>(
        `SELECT count(*) FROM projects WHERE status='ACTIVE'`);
      assert.equal(activeProjects.rows[0]?.count, '1');
      const healthClient = await pool.connect();
      const health = await getProjectContinuityHealth(new TenancyRepository(),
        new ContinuityHealthRepository(), healthClient,
        { tenantId: tenant, projectId: project, actorRole: 'TENANT_ADMIN' }, now);
      healthClient.release();
      assert.equal(health.activeGrants.length, 1);
      assert.equal(health.crewVacancies.length, 1);
      assert.equal(health.activeGrants[0]?.confirmationOverdue, true);
      assert.equal(health.crewVacancies[0]?.escalationDue, true);
      const repository = new PgContinuityAlertRepository(pool);
      assert.equal(await repository.ingestDueAlerts(50, now), 4);
      assert.equal(await repository.ingestDueAlerts(50, now), 0);
      const firstDay = await repository.claimDeliveries(50, now);
      assert.equal(firstDay.length, 4);
      assert.deepEqual(new Set(firstDay.map(item => item.kind)),
        new Set(['ACTING_CONFIRMATION_OVERDUE', 'CREW_VACANCY_OVERDUE']));
      for (const delivery of firstDay) await repository.markSent(delivery.id);

      const tomorrow = new Date(now.getTime() + 24 * 3600_000);
      assert.equal(await repository.ingestDueAlerts(50, tomorrow), 4);
      await setup.query(`UPDATE acting_grants SET confirmed_at=$2,
        confirmed_by=$3 WHERE id=$1`, [grant, tomorrow, tenantAdmin]);
      const secondDay = await repository.claimDeliveries(50, tomorrow);
      assert.equal(secondDay.length, 2);
      assert.ok(secondDay.every(item => item.kind === 'CREW_VACANCY_OVERDUE'));
      const skipped = await setup.query<{ count: string }>(
        `SELECT count(*) FROM continuity_alert_deliveries
         WHERE status='SKIPPED' AND alert_kind='ACTING_CONFIRMATION_OVERDUE'`);
      assert.equal(skipped.rows[0]?.count, '2');
    } finally {
      if (pool) await pool.end();
      await setup.query('SET search_path TO public');
      await setup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await setup.end();
    }
  });
