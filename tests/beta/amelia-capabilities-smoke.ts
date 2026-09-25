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
import { completeTicket } from '@/modules/ticket/application/complete-ticket';
import { uploadAttachment } from '@/modules/attachment/application';
import { AttachmentRepository, LocalAttachmentStorage, validateAttachmentObjectMetadata } from '@/modules/attachment/infrastructure';
import { captureQueuedNotifications, listLocalNotificationPreviews } from '@/modules/notification/application/local-preview';
import { getAmeliaMetrics } from '@/modules/reporting/application/amelia-metrics';
import { ConflictError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

async function transaction<T>(pool: Pool, fn: (db: DbClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await fn(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

async function main(): Promise<void> {
  if (process.env.SWR_B3_DISPOSABLE_DB !== '1') throw new Error('SWR_B3_DISPOSABLE_DB=1 is required');
  const pool = new Pool({ connectionString: required('DATABASE_URL') });
  const storageRoot = required('SWR_ATTACHMENT_ROOT');
  const storage = new LocalAttachmentStorage(storageRoot);
  try {
    const { rows: identity } = await pool.query<{ db: string; data_dir: string }>(
      `SELECT current_database() AS db, current_setting('data_directory') AS data_dir`,
    );
    assert.equal(identity[0]?.db, 'swr_b3_test');
    assert.equal(realpathSync(identity[0]!.data_dir), realpathSync(required('SWR_B3_DATA_DIR')));
    assert.equal(realpathSync(storageRoot), realpathSync(required('SWR_B3_STORAGE_DIR')));

    const ids = Object.fromEntries(['tenant', 'project', 'gc', 'subco', 'manager', 'requester', 'im', 'level', 'aor', 'department']
      .map((key) => [key, randomUUID()])) as Record<string, UUID>;
    const id = (key: string): UUID => ids[key]!;
    await transaction(pool, async (db) => {
      await db.query('INSERT INTO tenants (id, name) VALUES ($1, $2)', [id('tenant'), 'B3 disposable tenant']);
      await db.query("INSERT INTO companies (id, tenant_id, name, type) VALUES ($1, $2, 'GC', 'GC'), ($3, $2, 'Subco', 'SUBCONTRACTOR')", [id('gc'), id('tenant'), id('subco')]);
      await db.query("INSERT INTO projects (id, tenant_id, name, status, max_attachments_per_ticket) VALUES ($1, $2, 'Amelia', 'ACTIVE', 5)", [id('project'), id('tenant')]);
      for (const [user, company] of [['manager', 'gc'], ['requester', 'subco'], ['im', 'gc']] as const) {
        await db.query(`INSERT INTO users (id, tenant_id, company_id, email, name, auth_method) VALUES ($1, $2, $3, $4, $5, 'LOCAL')`,
          [id(user), id('tenant'), id(company), `${user}-${id('tenant')}@example.com`, user]);
      }
      for (const [user, role] of [['manager', 'SURVEY_MANAGER'], ['requester', 'REQUESTER'], ['im', 'INSTRUMENT_MAN']] as const) {
        await db.query('INSERT INTO project_memberships (project_id, user_id, role) VALUES ($1, $2, $3)', [id('project'), id(user), role]);
      }
      await db.query("INSERT INTO aor_levels (id, project_id, tenant_id, depth, label) VALUES ($1, $2, $3, 0, 'Area')", [id('level'), id('project'), id('tenant')]);
      await db.query("INSERT INTO aor_nodes (id, project_id, tenant_id, level_id, name, code) VALUES ($1, $2, $3, $4, 'Area 1', 'A1')", [id('aor'), id('project'), id('tenant'), id('level')]);
      await db.query("INSERT INTO departments (id, tenant_id, project_id, name, manager_title, created_by) VALUES ($1, $2, $3, 'Construction', 'Manager', $4)", [id('department'), id('tenant'), id('project'), id('manager')]);
    });

    const ticketRepo = new TicketRepository();
    const attachmentRepo = new AttachmentRepository();
    const created = await transaction(pool, (db) => createTicket(ticketRepo, db, {
      tenantId: id('tenant'), projectId: id('project'), aorNodeId: id('aor'), departmentId: id('department'),
      companyId: id('subco'), requesterId: id('requester'), ticketType: 'LAYOUT', workflowVariant: 'STANDARD_APPROVAL',
      craft: 'Civil', description: 'B3 capability smoke', requestedDate: new Date(Date.now() + 86400000),
    }));

    const instructionBytes = new TextEncoder().encode('%PDF sample instruction');
    const instructionStored = await storage.write(id('tenant'), created.id, instructionBytes);
    await transaction(pool, (db) => uploadAttachment(attachmentRepo, db, {
      tenantId: id('tenant'), projectId: id('project'), ticketId: created.id, ticketRequesterId: id('requester'),
      ticketStatus: 'DRAFT', ticketReturnCycle: 0, assignedPartyChiefId: null, assignedInstrumentManId: null,
      projectStatus: 'ACTIVE', actorId: id('requester'), actorRole: 'REQUESTER', validateMetadata: validateAttachmentObjectMetadata,
      metadata: { filename: 'layout.pdf', mimeType: 'application/pdf', sizeBytes: instructionBytes.byteLength,
        purpose: 'REQUEST_INSTRUCTION', returnCycle: 0, ...instructionStored },
    }));
    await transaction(pool, (db) => submitTicket(ticketRepo, db, {
      tenantId: id('tenant'), ticketId: created.id, actorId: id('requester'), actorRole: 'REQUESTER', departmentId: id('department'),
      urgentReason: 'Field crew is blocked pending this layout',
    }));
    await assert.rejects(() => transaction(pool, (db) => uploadAttachment(attachmentRepo, db, {
      tenantId: id('tenant'), projectId: id('project'), ticketId: created.id, ticketRequesterId: id('requester'),
      ticketStatus: 'SUBMITTED', ticketReturnCycle: 0, assignedPartyChiefId: null, assignedInstrumentManId: null,
      projectStatus: 'ACTIVE', actorId: id('requester'), actorRole: 'REQUESTER',
      metadata: { filename: 'late.pdf', mimeType: 'application/pdf', sizeBytes: 1, purpose: 'REQUEST_INSTRUCTION',
        returnCycle: 0, storageKey: instructionStored.storageKey, contentSha256: instructionStored.contentSha256 },
    })), ConflictError);
    await transaction(pool, (db) => approveTicket(ticketRepo, db, {
      tenantId: id('tenant'), ticketId: created.id, actorId: id('manager'), actorRole: 'SURVEY_MANAGER',
    }));
    await transaction(pool, (db) => assignTicket(ticketRepo, db, {
      tenantId: id('tenant'), ticketId: created.id, actorId: id('manager'), actorRole: 'SURVEY_MANAGER',
      assignedPartyChiefId: null, assignedInstrumentManId: id('im'), surveyLeadId: id('manager'),
    }));
    await transaction(pool, (db) => startTicket(ticketRepo, db, {
      tenantId: id('tenant'), ticketId: created.id, actorId: id('im'), actorRole: 'INSTRUMENT_MAN',
    }));
    const evidenceBytes = new TextEncoder().encode('field photo bytes');
    const evidenceStored = await storage.write(id('tenant'), created.id, evidenceBytes);
    await transaction(pool, (db) => uploadAttachment(attachmentRepo, db, {
      tenantId: id('tenant'), projectId: id('project'), ticketId: created.id, ticketRequesterId: id('requester'),
      ticketStatus: 'IN_PROGRESS', ticketReturnCycle: 0, assignedPartyChiefId: null, assignedInstrumentManId: id('im'),
      projectStatus: 'ACTIVE', actorId: id('im'), actorRole: 'INSTRUMENT_MAN', validateMetadata: validateAttachmentObjectMetadata,
      metadata: { filename: 'evidence.jpg', mimeType: 'image/jpeg', sizeBytes: evidenceBytes.byteLength,
        purpose: 'FIELD_SUPPORT', returnCycle: 0, ...evidenceStored },
    }));
    await transaction(pool, (db) => completeTicket(ticketRepo, db, {
      tenantId: id('tenant'), ticketId: created.id, actorId: id('im'), actorRole: 'INSTRUMENT_MAN',
    }));

    assert.deepEqual(await storage.read(instructionStored.storageKey), Buffer.from(instructionBytes));
    assert.deepEqual(await storage.read(evidenceStored.storageKey), Buffer.from(evidenceBytes));
    const metrics = await getAmeliaMetrics(pool, { tenantId: id('tenant'), projectId: id('project') });
    assert.equal(metrics.openTotal, 0);
    assert.equal(metrics.completedTotal, 1);
    assert.ok(metrics.averageSubmissionToCompletionHours !== null);
    const previews = await listLocalNotificationPreviews(pool, {
      tenantId: id('tenant'), projectId: id('project'), actorId: id('manager'), actorRole: 'SURVEY_MANAGER',
    });
    assert.equal(previews.length, 4);
    assert.ok(previews.some((message) => message.eventType === 'COMPLETED' && /completed/.test(message.body)));
    assert.equal(await transaction(pool, (db) => captureQueuedNotifications(db, {
      tenantId: id('tenant'), projectId: id('project'), actorRole: 'SURVEY_MANAGER',
    })), 4);
    const { rows: proof } = await pool.query<{ attachments: number; captured: number }>(
      `SELECT (SELECT COUNT(*)::int FROM attachments WHERE ticket_id = $1) AS attachments,
              (SELECT COUNT(*)::int FROM notification_outbox WHERE ticket_id = $1 AND delivery_state = 'CAPTURED') AS captured`,
      [created.id],
    );
    assert.deepEqual(proof[0], { attachments: 2, captured: 4 });
    console.log('B3 Amelia capabilities smoke passed: file bytes, instruction seal, field evidence, preview capture, metrics');
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
