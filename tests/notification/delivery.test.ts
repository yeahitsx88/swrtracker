import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import type { UUID } from '../../src/shared/types';
import {
  composeEmail, runNotificationCycle,
  type EmailMessage, type EmailTransport,
  type NotificationRepository, type PendingDelivery,
} from '../../src/modules/notification/application/index';
import { smtpConfigFromEnv } from '../../src/modules/notification/infrastructure/index';
import { PgNotificationRepository } from '../../src/modules/notification/infrastructure/notification.repository';
import { PgInviteDeliveryRepository } from '../../src/modules/notification/infrastructure/invite-delivery.repository';
import { composeInviteEmail, inviteBaseUrlFromEnv, runInviteDeliveryCycle }
  from '../../src/modules/notification/application/invite-delivery';

const id = (value: string) => value as UUID;

function delivery(eventType: string, recipientUserId = id('recipient')): PendingDelivery {
  return {
    id: id('delivery'),
    recipientUserId,
    recipientEmail: 'recipient@example.com',
    attempts: 1,
    event: {
      id: id('event'), tenantId: id('tenant'), ticketId: id('ticket'),
      eventType, payload: { priorStatus: 'IN_PROGRESS' },
      ticketNumber: 'FSS-U1-0001', requesterId: id('requester'),
      assignedInstrumentManId: id('instrument'),
    },
  };
}

test('survey cancellation gives the assigned Instrument Man an explicit stop-work instruction', () => {
  const instrument = composeEmail(delivery('ticket.survey_canceled', id('instrument')));
  const requester = composeEmail(delivery('ticket.survey_canceled', id('requester')));
  assert.match(instrument.text, /^Stop work/);
  assert.doesNotMatch(requester.text, /Stop work/);
  assert.doesNotMatch(requester.subject, /PENDING_PC_APPROVAL/);
});

test('help-flag claim and orphaned-assignment emails give supervisors an action', () => {
  assert.match(composeEmail(delivery('help_flag.ticket_claimed')).text,
    /current crew assignment/);
  assert.match(composeEmail(delivery('ticket.assignment_orphaned')).text,
    /assign an active crew/);
  assert.match(composeEmail(delivery('approver.timeout_warning_sent')).text,
    /18 hours/);
  assert.match(composeEmail(delivery('approver.timeout_unlocked')).text,
    /24 hours/);
  assert.match(composeEmail(delivery('ticket.pc_approval_stuck')).text,
    /more than four hours/);
});

test('successful delivery is marked sent only after transport resolves', async () => {
  const calls: string[] = [];
  const repository: NotificationRepository = {
    ingestEvents: async () => { calls.push('ingest'); return 1; },
    claimDeliveries: async () => { calls.push('claim'); return [delivery('ticket.assigned')]; },
    markSent: async () => { calls.push('sent'); },
    markFailed: async () => { calls.push('failed'); },
  };
  const transport: EmailTransport = {
    send: async (message: EmailMessage) => {
      assert.equal(message.deliveryId, id('delivery'));
      calls.push('send');
    },
  };
  assert.deepEqual(await runNotificationCycle(repository, transport),
    { ingested: 1, sent: 1, failed: 0 });
  assert.deepEqual(calls, ['ingest', 'claim', 'send', 'sent']);
});

test('transport failure remains retryable and is never recorded as sent', async () => {
  const calls: string[] = [];
  const repository: NotificationRepository = {
    ingestEvents: async () => 1,
    claimDeliveries: async () => [delivery('ticket.field_canceled')],
    markSent: async () => { calls.push('sent'); },
    markFailed: async (_id, error) => { assert.match(error, /unavailable/); calls.push('failed'); },
  };
  const transport: EmailTransport = { send: async () => { throw new Error('SMTP unavailable'); } };
  assert.deepEqual(await runNotificationCycle(repository, transport),
    { ingested: 1, sent: 0, failed: 1 });
  assert.deepEqual(calls, ['failed']);
});

test('queued ticket email is skipped after the recipient loses project membership', async () => {
  const queries: string[] = [];
  const pool = { async query(sql: string) {
    queries.push(sql);
    if (sql.includes('WITH ready AS')) return { rows: [{
      delivery_id: id('delivery'), tenant_id: id('tenant'),
      recipient_user_id: id('recipient'), attempts: 1,
      email: 'former@example.com', id: id('event'), ticket_id: id('ticket'),
      event_type: 'ticket.assigned', payload: {}, ticket_number: 'FSS-U1-0001',
      requester_id: id('requester'), assigned_instrument_man_id: null,
    }] };
    if (sql.includes('SELECT project_id FROM tickets')) {
      return { rows: [{ project_id: id('project') }] };
    }
    return { rows: [] };
  } } as unknown as Pool;
  const repository = new PgNotificationRepository(pool);
  assert.deepEqual(await repository.claimDeliveries(1), []);
  assert.equal(queries.some(sql => sql.includes("SET status = 'SKIPPED'") &&
    sql.includes("WHERE id = $1 AND status = 'SENDING'")), true);
});

test('delivery visibility lookup errors keep the claim retryable', async () => {
  const queries: string[] = [];
  const pool = { async query(sql: string) {
    queries.push(sql);
    if (sql.includes('WITH ready AS')) return { rows: [{
      delivery_id: id('delivery'), tenant_id: id('tenant'),
      recipient_user_id: id('recipient'), attempts: 1,
      email: 'recipient@example.com', id: id('event'), ticket_id: id('ticket'),
      event_type: 'ticket.assigned', payload: {}, ticket_number: 'FSS-U1-0001',
      requester_id: id('requester'), assigned_instrument_man_id: null,
    }] };
    if (sql.includes('SELECT project_id FROM tickets')) throw new Error('database unavailable');
    return { rows: [] };
  } } as unknown as Pool;
  await assert.rejects(new PgNotificationRepository(pool).claimDeliveries(1),
    /database unavailable/);
  assert.equal(queries.some(sql => sql.includes("SET status = 'SKIPPED'") &&
    sql.includes("WHERE id = $1 AND status = 'SENDING'")), false);
});

test('SMTP configuration requires a secure transport configuration', () => {
  assert.throws(() => smtpConfigFromEnv({ NODE_ENV: 'test', SMTP_HOST: 'mail.example.com' }), /SMTP_HOST/);
  assert.deepEqual(smtpConfigFromEnv({
    NODE_ENV: 'test', SMTP_HOST: 'mail.example.com', SMTP_PORT: '465', SMTP_USER: 'user',
    SMTP_PASSWORD: 'secret', SMTP_FROM: 'notify@example.com',
  }), {
    host: 'mail.example.com', port: 465, user: 'user', password: 'secret',
    from: 'notify@example.com',
  });
});

test('invitation email uses an HTTPS bearer link and only marks sent after acceptance', async () => {
  const base = inviteBaseUrlFromEnv({ NODE_ENV: 'test',
    INVITE_BASE_URL: 'https://example.com/invite' });
  const pending = {
    id: id('delivery'), tenantId: id('tenant'), inviteId: id('invite'),
    recipientEmail: 'invitee@example.com', token: id('secret-token'),
    projectName: 'Project A', expiresAt: new Date('2026-10-01T00:00:00Z'), attempts: 1,
  };
  const message = composeInviteEmail(pending, base);
  assert.match(message.text, /https:\/\/example.com\/invite\?token=secret-token/);
  assert.doesNotMatch(message.subject, /secret-token/);
  const actions: string[] = [];
  const repository = {
    ingestEvents: async () => 1,
    claimDeliveries: async () => [pending],
    markSent: async () => { actions.push('sent'); },
    markFailed: async () => { actions.push('failed'); },
  };
  const transport = { send: async () => { actions.push('smtp'); } };
  assert.deepEqual(await runInviteDeliveryCycle(repository, transport, base),
    { ingested: 1, sent: 1, failed: 0 });
  assert.deepEqual(actions, ['smtp', 'sent']);
  assert.throws(() => inviteBaseUrlFromEnv({ NODE_ENV: 'test',
    INVITE_BASE_URL: 'http://example.com/invite' }), /HTTPS/);
});

test('PostgreSQL outbox resolves recipients within tenant and checkpoints each event once',
  { skip: !process.env.NOTIFICATION_TEST_DATABASE_URL }, async () => {
    const pool = new Pool({ connectionString: process.env.NOTIFICATION_TEST_DATABASE_URL });
    const next = () => randomUUID() as UUID;
    const tenantId = next();
    const otherTenantId = next();
    const companyId = next();
    const otherCompanyId = next();
    const requesterId = next();
    const chiefId = next();
    const instrumentId = next();
    const foreignId = next();
    const managerId = next();
    const actingManagerId = next();
    const projectId = next();
    const levelId = next();
    const nodeId = next();
    const ticketId = next();
    try {
      await pool.query(`INSERT INTO tenants (id, name) VALUES ($1, 'Notification fixture'),
        ($2, 'Foreign fixture')`, [tenantId, otherTenantId]);
      await pool.query(`INSERT INTO companies (id, tenant_id, name, type) VALUES
        ($1,$3,'GC','GC'),($2,$4,'Foreign','GC')`,
      [companyId, otherCompanyId, tenantId, otherTenantId]);
      await pool.query(`INSERT INTO users (id, tenant_id, company_id, email, password_hash, name)
        VALUES ($1,$5,$6,'requester@example.com','fixture','Requester'),
               ($2,$5,$6,'chief@example.com','fixture','Chief'),
               ($3,$5,$6,'im@example.com','fixture','Instrument'),
               ($4,$7,$8,'foreign@example.com','fixture','Foreign')`,
      [requesterId, chiefId, instrumentId, foreignId, tenantId, companyId,
        otherTenantId, otherCompanyId]);
      await pool.query(`INSERT INTO projects (id, tenant_id, name, status, crew_build)
        VALUES ($1,$2,'Notification project','ACTIVE','MEDIUM')`, [projectId, tenantId]);
      await pool.query(`INSERT INTO users
        (id, tenant_id, company_id, email, password_hash, name)
        VALUES ($1,$2,$3,'manager@example.com','fixture','Survey Manager')`,
      [managerId, tenantId, companyId]);
      await pool.query(`INSERT INTO project_memberships (project_id,user_id,role)
        VALUES ($1,$2,'SURVEY_MANAGER'),($1,$3,'REQUESTER'),
               ($1,$4,'PARTY_CHIEF'),($1,$5,'INSTRUMENT_MAN')`,
      [projectId, managerId, requesterId, chiefId, instrumentId]);
      await pool.query(`INSERT INTO users
        (id, tenant_id, company_id, email, password_hash, name)
        VALUES ($1,$2,$3,'acting@example.com','fixture','Acting Manager')`,
      [actingManagerId, tenantId, companyId]);
      await pool.query(`INSERT INTO acting_grants
        (tenant_id,project_id,user_id,role,scope,trigger,cascade_level,granted_by,granted_reason)
        VALUES ($1,$2,$3,'SURVEY_MANAGER','{}'::jsonb,'VACANCY',1,'SYSTEM','Fixture')`,
      [tenantId, projectId, actingManagerId]);
      await pool.query(`INSERT INTO aor_levels (id, project_id, tenant_id, depth, label)
        VALUES ($1,$2,$3,0,'Area')`, [levelId, projectId, tenantId]);
      await pool.query(`INSERT INTO aor_nodes (id, project_id, tenant_id, level_id, name, code)
        VALUES ($1,$2,$3,$4,'Area','A1')`, [nodeId, projectId, tenantId, levelId]);
      await pool.query(`INSERT INTO tickets
        (id, tenant_id, project_id, aor_node_id, company_id, ticket_number,
         requester_id, assigned_party_chief_id, assigned_instrument_man_id,
         workflow_variant, status, craft, description, requested_date, ticket_type)
        VALUES ($1,$2,$3,$4,$5,'FSS-A1-0001',$6,$7,$8,
          'DIRECT_ASSIGNMENT','IN_PROGRESS','Pipe','Fixture','2026-10-01','LAYOUT')`,
      [ticketId, tenantId, projectId, nodeId, companyId,
        requesterId, chiefId, instrumentId]);
      const assignedId = next();
      const canceledId = next();
      await pool.query(`INSERT INTO ticket_events
        (id, ticket_id, tenant_id, actor_id, event_type, payload) VALUES
        ($1,$3,$4,$5,'ticket.assigned',$6::jsonb),
        ($2,$3,$4,$5,'ticket.survey_canceled',$7::jsonb)`,
      [assignedId, canceledId, ticketId, tenantId, requesterId,
        JSON.stringify({ assignedPartyChiefId: chiefId, assignedInstrumentManId: foreignId }),
        JSON.stringify({ priorStatus: 'IN_PROGRESS' })]);

      const repository = new PgNotificationRepository(pool);
      assert.equal(await repository.ingestEvents(10), 2);
      assert.equal(await repository.ingestEvents(10), 0);
      const claimed = await repository.claimDeliveries(10);
      const deliveries = claimed.filter(row => row.event.tenantId === tenantId);
      assert.equal(deliveries.length, 4);
      assert.equal(deliveries.some(row => row.recipientUserId === foreignId), false);
      assert.equal(deliveries.some(row => row.recipientUserId === instrumentId &&
        row.event.eventType === 'ticket.survey_canceled'), true);
      const first = deliveries.find(row => row.event.eventType === 'ticket.assigned' &&
        row.recipientUserId === requesterId);
      const stopWork = deliveries.find(row => row.event.eventType === 'ticket.survey_canceled' &&
        row.recipientUserId === instrumentId);
      assert.ok(first);
      assert.ok(stopWork);
      await repository.markFailed(first.id, 'SMTP unavailable');
      const retry = await pool.query<{ status: string; attempts: number }>(
        'SELECT status, attempts FROM notification_deliveries WHERE id = $1', [first.id]);
      assert.deepEqual(retry.rows[0], { status: 'PENDING', attempts: 1 });
      const chiefDelivery = deliveries.find(row => row.recipientUserId === chiefId);
      assert.ok(chiefDelivery);
      await repository.markFailed(chiefDelivery.id, 'SMTP unavailable');
      await pool.query('DELETE FROM project_memberships WHERE project_id=$1 AND user_id=$2',
        [projectId, chiefId]);
      await pool.query(`UPDATE notification_deliveries SET next_attempt_at=NOW()
        WHERE id=$1`, [chiefDelivery.id]);
      const afterRemoval = await repository.claimDeliveries(10);
      assert.equal(afterRemoval.some(row => row.id === chiefDelivery.id), false);
      const skipped = await pool.query<{ status: string }>(
        'SELECT status FROM notification_deliveries WHERE id=$1', [chiefDelivery.id]);
      assert.equal(skipped.rows[0]?.status, 'SKIPPED');
      await pool.query(`INSERT INTO project_memberships (project_id,user_id,role)
        VALUES ($1,$2,'PARTY_CHIEF')`, [projectId, chiefId]);
      await repository.markSent(stopWork.id);
      const sent = await pool.query<{ status: string }>(
        'SELECT status FROM notification_deliveries WHERE id = $1', [stopWork.id]);
      assert.equal(sent.rows[0]?.status, 'SENT');
      const stopEvent = await pool.query<{ payload: { recipientUserId: string; priorStatus: string } }>(
        `SELECT payload FROM ticket_events WHERE ticket_id = $1 AND tenant_id = $2
         AND event_type = 'ticket.im_stop_work_notified'`, [ticketId, tenantId]);
      assert.equal(stopEvent.rows.length, 1);
      assert.equal(stopEvent.rows[0]?.payload.recipientUserId, instrumentId);
      assert.equal(stopEvent.rows[0]?.payload.priorStatus, 'IN_PROGRESS');

      const inviteId = next();
      const inviteToken = next();
      const inviteEventId = next();
      await pool.query(`INSERT INTO invites
        (id, tenant_id, project_id, company_id, email, role, token, invited_by, expires_at)
        VALUES ($1,$2,$3,$4,'requester@example.com','REQUESTER',$5,$6,NOW()+INTERVAL '7 days')`,
      [inviteId, tenantId, projectId, companyId, inviteToken, requesterId]);
      await pool.query(`INSERT INTO tenant_events
        (id, tenant_id, actor_id, event_type, payload)
        VALUES ($1,$2,$3,'invite.sent',$4::jsonb)`,
      [inviteEventId, tenantId, requesterId, JSON.stringify({
        inviteId, projectId, companyId, email: 'requester@example.com', role: 'REQUESTER',
      })]);
      const inviteRepository = new PgInviteDeliveryRepository(pool);
      assert.equal(await inviteRepository.ingestEvents(10), 1);
      assert.equal(await inviteRepository.ingestEvents(10), 0);
      const invitations = await inviteRepository.claimDeliveries(10);
      assert.equal(invitations.length, 1);
      assert.equal(invitations[0]?.token, inviteToken);
      const safeAudit = await pool.query<{ payload: Record<string, unknown> }>(
        'SELECT payload FROM tenant_events WHERE id = $1', [inviteEventId]);
      assert.equal(JSON.stringify(safeAudit.rows[0]).includes(inviteToken), false);
      const safeOutbox = await pool.query<{ row: Record<string, unknown> }>(
        'SELECT row_to_json(d)::jsonb AS row FROM invite_notification_deliveries d');
      assert.equal(JSON.stringify(safeOutbox.rows).includes(inviteToken), false);
      await inviteRepository.markSent(invitations[0]!.id);
      const inviteStatus = await pool.query<{ status: string }>(
        'SELECT status FROM invite_notification_deliveries WHERE tenant_event_id = $1',
        [inviteEventId]);
      assert.equal(inviteStatus.rows[0]?.status, 'SENT');

      const claimedEventId = next();
      const orphanedEventId = next();
      const warningEventId = next();
      const unlockedEventId = next();
      const stuckEventId = next();
      await pool.query('UPDATE users SET deactivated_at = NOW() WHERE id = $1', [managerId]);
      await pool.query(`INSERT INTO ticket_events
        (id, ticket_id, tenant_id, actor_id, event_type, payload) VALUES
        ($1,$3,$4,$5,'help_flag.ticket_claimed',$6::jsonb),
        ($2,$3,$4,$5,'ticket.assignment_orphaned',$7::jsonb)`,
      [claimedEventId, orphanedEventId, ticketId, tenantId, chiefId,
        JSON.stringify({ flagId: next(), newPartyChiefId: chiefId }),
        JSON.stringify({ deactivatedUserId: instrumentId, roleOnTicket: 'INSTRUMENT_MAN' })]);
      await pool.query(`INSERT INTO ticket_events
        (id,ticket_id,tenant_id,actor_id,event_type,payload) VALUES
        ($1,$4,$5,NULL,'approver.timeout_warning_sent','{}'),
        ($2,$4,$5,NULL,'approver.timeout_unlocked','{}'),
        ($3,$4,$5,NULL,'ticket.pc_approval_stuck','{}')`,
      [warningEventId, unlockedEventId, stuckEventId, ticketId, tenantId]);
      await assert.rejects(pool.query(`INSERT INTO ticket_events
        (ticket_id,tenant_id,actor_id,event_type,payload)
        VALUES ($1,$2,NULL,'approver.timeout_warning_sent','{}')`,
      [ticketId, tenantId]));
      assert.equal(await repository.ingestEvents(10), 5);
      const supervisor = await pool.query<{ event_type: string; recipient_user_id: UUID }>(
        `SELECT e.event_type, d.recipient_user_id
         FROM notification_deliveries d
         JOIN ticket_events e ON e.id = d.event_id AND e.tenant_id = d.tenant_id
         WHERE e.id IN ($1,$2,$3,$4,$5)`,
      [claimedEventId, orphanedEventId, warningEventId, unlockedEventId, stuckEventId]);
      const recipients = (eventType: string) => supervisor.rows
        .filter(row => row.event_type === eventType).map(row => row.recipient_user_id).sort();
      assert.deepEqual(recipients('help_flag.ticket_claimed'), [actingManagerId]);
      assert.deepEqual(recipients('ticket.assignment_orphaned'), [actingManagerId]);
      assert.deepEqual(recipients('approver.timeout_warning_sent'), [actingManagerId]);
      assert.deepEqual(recipients('approver.timeout_unlocked'), [actingManagerId]);
      assert.deepEqual(recipients('ticket.pc_approval_stuck'),
        [actingManagerId, chiefId].sort());
    } finally {
      await pool.end();
    }
  });
