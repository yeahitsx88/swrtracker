import type { DbClient, Page, UUID } from '@/shared/types';
import type { Attachment } from '../domain/types';
import type { IAttachmentRepository, PurgeQueueItem, UploadTicket } from '../application/ports';

interface AttachmentRow {
  id: UUID; ticket_id: UUID; tenant_id: UUID; uploaded_by: UUID;
  filename: string; mime_type: string; storage_key: string;
  size_bytes: number; ticket_status_at_upload: string; created_at: Date;
}

function toAttachment(row: AttachmentRow): Attachment {
  return { id: row.id, ticketId: row.ticket_id, tenantId: row.tenant_id,
    uploadedBy: row.uploaded_by, filename: row.filename, mimeType: row.mime_type,
    storageKey: row.storage_key, sizeBytes: row.size_bytes,
    ticketStatusAtUpload: row.ticket_status_at_upload, createdAt: row.created_at };
}

export class AttachmentRepository implements IAttachmentRepository {
  async findWritableTicket(db: DbClient, tenantId: UUID, ticketId: UUID,
    requesterId: UUID): Promise<UploadTicket | null> {
    const { rows } = await db.query<UploadTicket>(
      `SELECT t.id, t.status FROM tickets t
       JOIN projects p ON p.id=t.project_id AND p.tenant_id=t.tenant_id
       JOIN users u ON u.id=t.requester_id AND u.tenant_id=t.tenant_id
       WHERE t.id=$1 AND t.tenant_id=$2 AND t.requester_id=$3
         AND t.draft_deleted_at IS NULL AND p.status='ACTIVE'
         AND u.deactivated_at IS NULL
       FOR UPDATE OF t`, [ticketId, tenantId, requesterId]);
    return rows[0] ?? null;
  }

  async save(db: DbClient, attachment: Attachment): Promise<void> {
    await db.query(
      `INSERT INTO attachments
         (id,ticket_id,tenant_id,uploaded_by,filename,mime_type,storage_key,
          size_bytes,ticket_status_at_upload,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [attachment.id, attachment.ticketId, attachment.tenantId,
        attachment.uploadedBy, attachment.filename, attachment.mimeType,
        attachment.storageKey, attachment.sizeBytes,
        attachment.ticketStatusAtUpload, attachment.createdAt]);
  }

  async findById(db: DbClient, tenantId: UUID, ticketId: UUID,
    attachmentId: UUID): Promise<Attachment | null> {
    const { rows } = await db.query<AttachmentRow>(
      `SELECT * FROM attachments
       WHERE id=$1 AND ticket_id=$2 AND tenant_id=$3 LIMIT 1`,
      [attachmentId, ticketId, tenantId]);
    return rows[0] ? toAttachment(rows[0]) : null;
  }

  async list(db: DbClient, tenantId: UUID, ticketId: UUID,
    limit: number, offset: number): Promise<Page<Attachment>> {
    const { rows: counts } = await db.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM attachments WHERE tenant_id=$1 AND ticket_id=$2`,
      [tenantId, ticketId]);
    const { rows } = await db.query<AttachmentRow>(
      `SELECT * FROM attachments WHERE tenant_id=$1 AND ticket_id=$2
       ORDER BY created_at DESC, id DESC LIMIT $3 OFFSET $4`,
      [tenantId, ticketId, limit, offset]);
    return { data: rows.map(toAttachment), total: Number(counts[0]?.total ?? 0), limit, offset };
  }

  async claimPurgeBatch(db: DbClient, tenantId: UUID, limit: number): Promise<PurgeQueueItem[]> {
    const { rows } = await db.query<{
      id: UUID; tenant_id: UUID; ticket_id: UUID; storage_key: string;
    }>(
      `SELECT id,tenant_id,ticket_id,storage_key FROM attachment_purge_queue
       WHERE tenant_id=$1 AND processed_at IS NULL
       ORDER BY enqueued_at,id LIMIT $2 FOR UPDATE SKIP LOCKED`,
      [tenantId, limit]);
    return rows.map(row => ({ id: row.id, tenantId: row.tenant_id,
      ticketId: row.ticket_id, storageKey: row.storage_key }));
  }

  async markPurgeDone(db: DbClient, tenantId: UUID, id: UUID): Promise<void> {
    await db.query(
      `UPDATE attachment_purge_queue
       SET processed_at=NOW(), attempts=attempts+1, last_error=NULL
       WHERE id=$1 AND tenant_id=$2 AND processed_at IS NULL`, [id, tenantId]);
  }

  async markPurgeFailed(db: DbClient, tenantId: UUID, id: UUID,
    error: string): Promise<void> {
    await db.query(
      `UPDATE attachment_purge_queue
       SET attempts=attempts+1, last_error=$3
       WHERE id=$1 AND tenant_id=$2 AND processed_at IS NULL`,
      [id, tenantId, error.slice(0, 500)]);
  }

  async findReferencedKeys(db: DbClient, tenantId: UUID,
    keys: string[]): Promise<Set<string>> {
    if (!keys.length) return new Set();
    const { rows } = await db.query<{ storage_key: string }>(
      `SELECT DISTINCT storage_key FROM attachments
       WHERE tenant_id=$1 AND storage_key=ANY($2::text[])`, [tenantId, keys]);
    return new Set(rows.map(row => row.storage_key));
  }
}
