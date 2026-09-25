import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Client } from 'pg';
import type { UUID } from '@/shared/types';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { saveDraft, deleteDraft, recoverDraft } from '@/modules/ticket/application/drafts';
import { submitTicket } from '@/modules/ticket/application/submit-ticket';
import { purgeDeletedDrafts } from '@/modules/ticket/application/draft-maintenance';
import { lowerPriority } from '@/modules/ticket/application/lower-priority';
import { recordApproverTimeoutSignals } from
  '@/modules/ticket/infrastructure/timeout-signal.repository';
import { emitStuckPcSignals } from '@/modules/ticket/application/timeout-signals';

const id = () => randomUUID() as UUID;

test('PostgreSQL partial draft save, isolated listing, submit-time number, and recovery',
  { skip: !process.env.DATABASE_URL }, async () => {
    const db = new Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    await db.query('BEGIN');
    try {
      const tenantId = id(), companyId = id(), requesterId = id(), adminId = id();
      const projectId = id(), levelId = id(), nodeId = id(), departmentId = id();
      await db.query('INSERT INTO tenants(id,name) VALUES($1,$2)', [tenantId, 'Draft tenant']);
      await db.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'GC','GC')",
        [companyId, tenantId]);
      for (const [userId, email] of [[requesterId, 'requester'], [adminId, 'admin']]) {
        await db.query(`INSERT INTO users(id,tenant_id,company_id,email,password_hash,name)
          VALUES($1,$2,$3,$4,'fixture','User')`,
        [userId, tenantId, companyId, `${email}@example.test`]);
      }
      await db.query("INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,'Project','ACTIVE','MEDIUM')",
        [projectId, tenantId]);
      await db.query(`INSERT INTO project_memberships(project_id,user_id,role) VALUES
        ($1,$2,'REQUESTER'),($1,$3,'PROJECT_ADMIN')`, [projectId, requesterId, adminId]);
      await db.query("INSERT INTO aor_levels(id,project_id,tenant_id,depth,label) VALUES($1,$2,$3,0,'Unit')",
        [levelId, projectId, tenantId]);
      await db.query("INSERT INTO aor_nodes(id,project_id,tenant_id,level_id,name,code) VALUES($1,$2,$3,$4,'Unit','U1')",
        [nodeId, projectId, tenantId, levelId]);
      await db.query(`INSERT INTO departments(id,project_id,tenant_id,name,manager_title,created_by)
        VALUES($1,$2,$3,'Civil','Civil Manager',$4)`,
        [departmentId, projectId, tenantId, adminId]);
      const repo = new TicketRepository();
      const ctx = { tenantId, projectId, requesterId, companyId };
      const draft = await saveDraft(repo, db, { ...ctx, fields: { craft: 'Pipe' } });
      assert.equal(draft.ticketNumber, null);
      assert.equal(draft.requestedDate, null);
      assert.equal((await repo.listDrafts(db, tenantId, requesterId, 20, 0)).total, 1);
      assert.equal((await repo.list(db, tenantId, { projectId, limit: 20, offset: 0,
        visibility: { actorId: requesterId, actorRole: 'REQUESTER', companyId,
          companyType: 'GC' } })).total, 0);
      await assert.rejects(submitTicket(repo, db, { tenantId, ticketId: draft.id,
        actorId: requesterId, actorRole: 'REQUESTER' }));
      const requestedDate = new Date(Date.now() + 72 * 60 * 60 * 1000);
      const saved = await saveDraft(repo, db, { ...ctx, ticketId: draft.id,
        fields: { aorNodeId: nodeId, departmentId, ticketType: 'LAYOUT',
          craft: 'Pipe', description: 'Layout',
          requestedDate } });
      assert.equal(saved.requestedDate?.toISOString(), requestedDate.toISOString());
      const submitted = await submitTicket(repo, db, { tenantId, ticketId: draft.id,
        actorId: requesterId, actorRole: 'REQUESTER', isWhitelisted: false });
      assert.match(submitted.ticketNumber ?? '', /^FSS-U1-\d{5}$/);
      assert.equal(submitted.status, 'SUBMITTED');
      assert.equal(submitted.requestedDate?.toISOString(), requestedDate.toISOString());
      await db.query(`UPDATE tickets SET submitted_at=NOW()-INTERVAL '25 hours'
        WHERE id=$1 AND tenant_id=$2`, [draft.id, tenantId]);
      assert.equal(await recordApproverTimeoutSignals(db, tenantId, [draft.id]), 2);
      assert.equal(await recordApproverTimeoutSignals(db, tenantId, [draft.id]), 0);
      const { rows: timeoutEvents } = await db.query<{
        event_type: string; actor_id: string | null;
      }>(`SELECT event_type,actor_id FROM ticket_events WHERE ticket_id=$1
          AND event_type LIKE 'approver.timeout_%'`, [draft.id]);
      assert.deepEqual(timeoutEvents.map(event => event.event_type).sort(), [
        'approver.timeout_unlocked', 'approver.timeout_warning_sent',
      ]);
      assert.ok(timeoutEvents.every(event => event.actor_id === null));
      await db.query(`UPDATE tickets SET priority='HIGH',is_priority=TRUE
        WHERE id=$1 AND tenant_id=$2`, [draft.id, tenantId]);
      const downgrade = { tenantId, ticketId: draft.id, actorId: adminId,
        actorRole: 'SURVEY_MANAGER' as const, priority: 'MEDIUM' as const,
        reason: 'Schedule no longer critical' };
      await assert.rejects(lowerPriority(repo, db, {
        ...downgrade, highDowngradeConfirmed: false,
      }));
      const lowered = await lowerPriority(repo, db, {
        ...downgrade, highDowngradeConfirmed: true,
      });
      assert.equal(lowered.priority, 'MEDIUM');
      assert.equal((await repo.listDrafts(db, tenantId, requesterId, 20, 0)).total, 0);
      assert.equal((await repo.list(db, tenantId, { projectId, limit: 20, offset: 0,
        visibility: { actorId: requesterId, actorRole: 'REQUESTER', companyId,
          companyType: 'GC' } })).total, 1);
      const deletedCandidate = await saveDraft(repo, db, { ...ctx, fields: {} });
      await deleteDraft(repo, db, { tenantId, ticketId: deletedCandidate.id, requesterId });
      assert.equal((await repo.listDrafts(db, tenantId, requesterId, 20, 0)).total, 0);
      assert.equal((await repo.listDeletedDrafts(db, tenantId, projectId, adminId, 20, 0)).total, 1);
      await assert.rejects(recoverDraft(repo, db, { tenantId, projectId,
        ticketId: deletedCandidate.id, actorId: requesterId,
        actorRole: 'REQUESTER', reason: 'Recover this draft' }));
      const recovered = await recoverDraft(repo, db, { tenantId, projectId,
        ticketId: deletedCandidate.id, actorId: adminId,
        actorRole: 'PROJECT_ADMIN', reason: 'Requester needs more time' });
      assert.equal(recovered.draftDeletedAt, null);
      const { rows: eventRows } = await db.query<{ event_type: string }>(
        'SELECT event_type FROM ticket_events WHERE ticket_id=$1', [draft.id]);
      assert.ok(eventRows.some(row => row.event_type === 'ticket.draft_saved'));
      assert.ok(eventRows.some(row => row.event_type === 'ticket.submitted'));
      assert.ok(eventRows.some(row => row.event_type === 'ticket.priority_downgrade_confirmed'));
      await db.query(`UPDATE tickets SET status='REJECTED',
        rejection_reason='Location changed', rejected_at=NOW()
        WHERE id=$1 AND tenant_id=$2`, [draft.id, tenantId]);
      await db.query('UPDATE aor_nodes SET retired_at=NOW() WHERE id=$1 AND tenant_id=$2',
        [nodeId, tenantId]);
      await db.query(`INSERT INTO attachments(ticket_id,tenant_id,uploaded_by,filename,mime_type,
        storage_key,size_bytes,ticket_status_at_upload) VALUES($1,$2,$3,'original.pdf','application/pdf',$4,10,'REJECTED')`,
        [draft.id, tenantId, requesterId, `${tenantId}/${draft.id}/${id()}`]);
      const revision = await saveDraft(repo, db, {
        ...ctx, parentTicketId: draft.id, fields: {},
      });
      assert.equal(revision.parentTicketId, draft.id);
      assert.equal(revision.aorNodeId, nodeId);
      assert.equal(revision.requestedDate, null);
      assert.equal(revision.priority, 'NORMAL');
      assert.equal(revision.ticketNumber, null);
      assert.equal(revision.description, submitted.description);
      assert.equal(revision.departmentId, submitted.departmentId);
      const copiedFiles = await db.query('SELECT id FROM attachments WHERE tenant_id=$1 AND ticket_id=$2',
        [tenantId, revision.id]);
      assert.equal(copiedFiles.rows.length, 0);
      await saveDraft(repo, db, { ...ctx, ticketId: revision.id,
        fields: { requestedDate: new Date(Date.now() + 72 * 60 * 60 * 1000) } });
      const revised = await submitTicket(repo, db, { tenantId,
        ticketId: revision.id, actorId: requesterId, actorRole: 'REQUESTER' });
      assert.equal(revised.status, 'SUBMITTED');
      assert.notEqual(revised.ticketNumber, submitted.ticketNumber);
      await db.query(`UPDATE tickets SET status='PENDING_PC_APPROVAL',
        updated_at=NOW()-INTERVAL '5 hours' WHERE id=$1 AND tenant_id=$2`,
      [revision.id, tenantId]);
      assert.equal(await emitStuckPcSignals(db), 1);
      assert.equal(await emitStuckPcSignals(db), 0);
      await deleteDraft(repo, db, { tenantId, ticketId: deletedCandidate.id, requesterId });
      await db.query(`UPDATE tickets SET draft_deleted_at=NOW()-INTERVAL '31 days'
        WHERE id=$1 AND tenant_id=$2`, [deletedCandidate.id, tenantId]);
      const storageKey = `drafts/${deletedCandidate.id}/file.txt`;
      await db.query(`INSERT INTO attachments(ticket_id,tenant_id,uploaded_by,
        filename,mime_type,storage_key,size_bytes,ticket_status_at_upload)
        VALUES($1,$2,$3,'file.txt','text/plain',$4,4,'DRAFT')`, [
        deletedCandidate.id, tenantId, requesterId, storageKey,
      ]);
      assert.equal(await purgeDeletedDrafts(repo, db, tenantId), 1);
      const { rows: purged } = await db.query('SELECT id FROM tickets WHERE id=$1',
        [deletedCandidate.id]);
      assert.equal(purged.length, 0);
      const { rows: retained } = await db.query<{ event_type: string }>(
        'SELECT event_type FROM ticket_events WHERE ticket_id=$1', [deletedCandidate.id]);
      assert.ok(retained.some(row => row.event_type === 'ticket.draft_hard_deleted'));
      const { rows: queued } = await db.query<{ storage_key: string }>(
        'SELECT storage_key FROM attachment_purge_queue WHERE ticket_id=$1',
        [deletedCandidate.id]);
      assert.equal(queued[0]?.storage_key, storageKey);
    } finally {
      await db.query('ROLLBACK');
      await db.end();
    }
  });
