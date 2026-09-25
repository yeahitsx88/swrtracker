import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { Pool } from 'pg';
import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { Attachment } from '@/modules/attachment/domain/types';
import type { IAttachmentRepository, IAttachmentStorage } from
  '@/modules/attachment/application/ports';
import { recordAttachmentUpload, requireWritableTicket, validateAttachmentMetadata,
  processAttachmentPurgeQueue, sweepOrphanedAttachments } from
  '@/modules/attachment/application';
import { AttachmentRepository, VolumeAttachmentStorage } from
  '@/modules/attachment/infrastructure';

const id = (value: string) => value as UUID;
const tenantId = id('00000000-0000-0000-0000-000000000001');
const ticketId = id('00000000-0000-0000-0000-000000000002');
const actorId = id('00000000-0000-0000-0000-000000000003');

test('upload checks requester and active ticket before writing metadata and audit', async () => {
  const order: string[] = [];
  const db: DbClient = { async query(sql, params) {
    if (/INSERT INTO ticket_events/u.test(sql)) {
      order.push('audit');
      assert.equal(params?.[4], 'attachment.uploaded');
      assert.equal(JSON.parse(String(params?.[5])).ticketStatusAtUpload, 'IN_PROGRESS');
    }
    return { rows: [] };
  } };
  const repo = {
    findWritableTicket: async () => { order.push('ticket'); return { id: ticketId, status: 'IN_PROGRESS' }; },
    save: async (_db: DbClient, attachment: Attachment) => {
      order.push('save');
      assert.equal(attachment.ticketStatusAtUpload, 'IN_PROGRESS');
    },
  } as unknown as IAttachmentRepository;
  const result = await recordAttachmentUpload(repo, db, { tenantId, ticketId, actorId,
    filename: 'plan.pdf', mimeType: 'application/pdf',
    storageKey: `${tenantId}/${ticketId}/${randomUUID()}`, sizeBytes: 123 });
  assert.equal(result.filename, 'plan.pdf');
  assert.deepEqual(order, ['ticket', 'save', 'audit']);

  const missing = { findWritableTicket: async () => null } as unknown as IAttachmentRepository;
  await assert.rejects(requireWritableTicket(missing, db, tenantId, ticketId, actorId), NotFoundError);
  const completed = { findWritableTicket: async () => ({ id: ticketId, status: 'COMPLETED' }) } as
    unknown as IAttachmentRepository;
  await assert.rejects(requireWritableTicket(completed, db, tenantId, ticketId, actorId), ConflictError);
});

test('upload input rejects unsafe names, MIME values, and empty bytes', async () => {
  assert.throws(() => validateAttachmentMetadata('../plan.pdf', 'application/pdf'), ValidationError);
  assert.throws(() => validateAttachmentMetadata('plan\r\n.pdf', 'application/pdf'), ValidationError);
  assert.throws(() => validateAttachmentMetadata('plan.pdf', 'bad mime'), ValidationError);
  const db: DbClient = { async query() { return { rows: [] }; } };
  const repo = { findWritableTicket: async () => ({ id: ticketId, status: 'DRAFT' }) } as
    unknown as IAttachmentRepository;
  await assert.rejects(recordAttachmentUpload(repo, db, { tenantId, ticketId, actorId,
    filename: 'plan.pdf', mimeType: 'application/pdf', storageKey: 'opaque', sizeBytes: 0 }),
  ValidationError);
});

test('repository upload authorization and metadata reads are tenant and ticket scoped', async () => {
  const sql: string[] = [];
  const db: DbClient = { async query(query) { sql.push(query); return { rows: [] }; } };
  const repo = new AttachmentRepository();
  await repo.findWritableTicket(db, tenantId, ticketId, actorId);
  await repo.findById(db, tenantId, ticketId, id('00000000-0000-0000-0000-000000000004'));
  assert.match(sql[0] ?? '', /t\.tenant_id=\$2 AND t\.requester_id=\$3/u);
  assert.match(sql[0] ?? '', /p\.status='ACTIVE'/u);
  assert.match(sql[0] ?? '', /FOR UPDATE OF t/u);
  assert.match(sql[1] ?? '', /ticket_id=\$2 AND tenant_id=\$3/u);
});

test('volume storage uses generated keys and removes failed oversized writes', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'swr-attachments-'));
  assert.equal(path.dirname(directory), tmpdir());
  try {
    const storage = new VolumeAttachmentStorage(directory);
    const key = storage.createStorageKey(tenantId, ticketId);
    const bytes = new TextEncoder().encode('attachment bytes');
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(bytes); controller.close();
    } });
    assert.equal(await storage.write(key, body, 100), bytes.byteLength);
    assert.deepEqual(Array.from(await storage.read(key)), Array.from(bytes));
    const objects = [];
    for await (const object of storage.listTenantObjects(tenantId)) objects.push(object);
    assert.equal(objects.length, 1);
    assert.equal(objects[0]?.storageKey, key);
    await storage.remove(key);
    await assert.rejects(storage.read(key), NotFoundError);
    await assert.rejects(storage.read('../escape'), ValidationError);

    const oversizeKey = storage.createStorageKey(tenantId, ticketId);
    const tooLarge = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new Uint8Array(11)); controller.close();
    } });
    await assert.rejects(storage.write(oversizeKey, tooLarge, 10), ValidationError);
    await assert.rejects(storage.read(oversizeKey), NotFoundError);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('purge queue records transport failures and orphan sweep skips recent or referenced files', async () => {
  const removed: string[] = [];
  const done: UUID[] = [];
  const failed: UUID[] = [];
  const old = new Date('2026-01-01T00:00:00Z');
  const recent = new Date('2026-09-25T00:00:00Z');
  const keyA = `${tenantId}/${ticketId}/${id('00000000-0000-0000-0000-000000000011')}`;
  const keyB = `${tenantId}/${ticketId}/${id('00000000-0000-0000-0000-000000000012')}`;
  const keyC = `${tenantId}/${ticketId}/${id('00000000-0000-0000-0000-000000000013')}`;
  const storage = {
    remove: async (key: string) => {
      if (key === keyB) throw new Error('volume temporarily unavailable');
      removed.push(key);
    },
    async *listTenantObjects() {
      yield { storageKey: keyA, modifiedAt: old };
      yield { storageKey: keyB, modifiedAt: old };
      yield { storageKey: keyC, modifiedAt: recent };
    },
  } as unknown as IAttachmentStorage;
  const repo = {
    claimPurgeBatch: async () => [
      { id: id('00000000-0000-0000-0000-000000000021'), tenantId, ticketId, storageKey: keyA },
      { id: id('00000000-0000-0000-0000-000000000022'), tenantId, ticketId, storageKey: keyB },
    ],
    markPurgeDone: async (_db: DbClient, _tenant: UUID, queueId: UUID) => { done.push(queueId); },
    markPurgeFailed: async (_db: DbClient, _tenant: UUID, queueId: UUID,
      message: string) => { assert.match(message, /unavailable/u); failed.push(queueId); },
    findReferencedKeys: async () => new Set([keyB]),
  } as unknown as IAttachmentRepository;
  const db: DbClient = { async query() { return { rows: [] }; } };
  assert.deepEqual(await processAttachmentPurgeQueue(repo, storage, db, tenantId),
    { processed: 1, failed: 1 });
  assert.equal(done.length, 1);
  assert.equal(failed.length, 1);
  assert.deepEqual(await sweepOrphanedAttachments(repo, storage, db, tenantId,
    new Date('2026-09-25T12:00:00Z')), { scanned: 3, removed: 1 });
  assert.deepEqual(removed, [keyA, keyA]);
});

test('PostgreSQL attachment metadata and audit event commit together with ticket status',
  { skip: !process.env.DATABASE_URL }, async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const db = await pool.connect();
    const tenant = randomUUID() as UUID;
    const company = randomUUID() as UUID;
    const user = randomUUID() as UUID;
    const project = randomUUID() as UUID;
    const ticket = randomUUID() as UUID;
    try {
      await db.query('BEGIN');
      await db.query(`INSERT INTO tenants(id,name) VALUES ($1,'Attachment test')`, [tenant]);
      await db.query(`INSERT INTO companies(id,tenant_id,name,type)
        VALUES ($1,$2,'GC','GC')`, [company, tenant]);
      await db.query(`INSERT INTO users(id,tenant_id,company_id,email,name)
        VALUES ($1,$2,$3,$4,'Requester')`,
      [user, tenant, company, `attachment-${user}@example.test`]);
      await db.query(`INSERT INTO projects(id,tenant_id,name,status,crew_build)
        VALUES ($1,$2,'Active','ACTIVE','SLIM')`, [project, tenant]);
      await db.query(`INSERT INTO tickets
        (id,tenant_id,project_id,company_id,requester_id,workflow_variant,status)
        VALUES ($1,$2,$3,$4,$5,'STANDARD_APPROVAL','DRAFT')`,
      [ticket, tenant, project, company, user]);
      const repo = new AttachmentRepository();
      const saved = await recordAttachmentUpload(repo, db, {
        tenantId: tenant, ticketId: ticket, actorId: user,
        filename: 'layout.pdf', mimeType: 'application/pdf',
        storageKey: `${tenant}/${ticket}/${randomUUID()}`, sizeBytes: 21,
      });
      const { rows: metadata } = await db.query<{ ticket_status_at_upload: string }>(
        `SELECT ticket_status_at_upload FROM attachments WHERE id=$1 AND tenant_id=$2`,
        [saved.id, tenant]);
      assert.equal(metadata[0]?.ticket_status_at_upload, 'DRAFT');
      const { rows: events } = await db.query<{ event_type: string }>(
        `SELECT event_type FROM ticket_events
         WHERE ticket_id=$1 AND tenant_id=$2 AND event_type='attachment.uploaded'`,
        [ticket, tenant]);
      assert.equal(events.length, 1);
      await assert.rejects(requireWritableTicket(repo, db, tenant, ticket,
        randomUUID() as UUID), NotFoundError);
    } finally {
      await db.query('ROLLBACK');
      db.release();
      await pool.end();
    }
  });
