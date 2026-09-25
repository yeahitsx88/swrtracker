import { createHash, randomUUID } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import path from 'path';
import { ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { Attachment, AttachmentObjectMetadata } from '../domain/types';
import type { AttachmentMetadataValidator, IAttachmentRepository } from '../application';

export const MAX_ATTACHMENT_BYTES = 30 * 1024 * 1024;
const ALLOWED_TYPES = new Map<string, ReadonlySet<string>>([
  ['.pdf', new Set(['application/pdf'])],
  ['.jpg', new Set(['image/jpeg'])],
  ['.jpeg', new Set(['image/jpeg'])],
  ['.png', new Set(['image/png'])],
  ['.txt', new Set(['text/plain'])],
  ['.csv', new Set(['text/csv', 'application/vnd.ms-excel'])],
  ['.doc', new Set(['application/msword'])],
  ['.docx', new Set(['application/vnd.openxmlformats-officedocument.wordprocessingml.document'])],
  ['.xls', new Set(['application/vnd.ms-excel'])],
  ['.xlsx', new Set(['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])],
]);

export class AttachmentRepository implements IAttachmentRepository {
  async saveAttachment(db: DbClient, attachment: Attachment): Promise<void> {
    await db.query(
      `INSERT INTO attachments (
         id, ticket_id, tenant_id, uploaded_by, filename, mime_type, storage_key, size_bytes,
         purpose, return_cycle, content_sha256, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [attachment.id, attachment.ticketId, attachment.tenantId, attachment.uploadedBy,
        attachment.filename, attachment.mimeType, attachment.storageKey, attachment.sizeBytes,
        attachment.purpose, attachment.returnCycle, attachment.contentSha256, attachment.createdAt],
    );
  }

  async countTicketAttachments(db: DbClient, tenantId: UUID, ticketId: UUID): Promise<number> {
    await db.query(
      `SELECT 1 FROM tickets WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
      [tenantId, ticketId],
    );
    const { rows } = await db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM attachments WHERE tenant_id = $1 AND ticket_id = $2`,
      [tenantId, ticketId],
    );
    return rows[0]?.count ?? 0;
  }

  async findProjectAttachmentLimit(db: DbClient, tenantId: UUID, projectId: UUID): Promise<number | null> {
    const { rows } = await db.query<{ max_attachments_per_ticket: number | null }>(
      `SELECT max_attachments_per_ticket FROM projects WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [tenantId, projectId],
    );
    return rows[0]?.max_attachments_per_ticket ?? null;
  }
}

export const validateAttachmentObjectMetadata: AttachmentMetadataValidator = (metadata: AttachmentObjectMetadata) => {
  const extension = path.extname(metadata.filename).toLowerCase();
  const allowedMimeTypes = ALLOWED_TYPES.get(extension);
  if (!allowedMimeTypes || !allowedMimeTypes.has(metadata.mimeType.toLowerCase())) {
    throw new ValidationError('File type is not allowed for the Amelia beta');
  }
  if (metadata.sizeBytes > MAX_ATTACHMENT_BYTES) {
    throw new ValidationError('Attachment exceeds the 30 MB per-file limit');
  }
};

export class LocalAttachmentStorage {
  constructor(private readonly root = process.env.SWR_ATTACHMENT_ROOT || path.join(process.cwd(), '.data', 'attachments')) {}

  async write(tenantId: UUID, ticketId: UUID, bytes: Uint8Array): Promise<{ storageKey: string; contentSha256: string }> {
    const storageKey = path.posix.join(tenantId, ticketId, randomUUID());
    const absolutePath = this.resolve(storageKey);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, bytes, { flag: 'wx' });
    return { storageKey, contentSha256: createHash('sha256').update(bytes).digest('hex') };
  }

  async read(storageKey: string): Promise<Buffer> {
    return readFile(this.resolve(storageKey));
  }

  async remove(storageKey: string): Promise<void> {
    await unlink(this.resolve(storageKey)).catch(() => undefined);
  }

  private resolve(storageKey: string): string {
    if (!/^[a-f0-9-]+\/[a-f0-9-]+\/[a-f0-9-]+$/.test(storageKey)) {
      throw new ValidationError('Invalid attachment storage key');
    }
    const root = path.resolve(this.root);
    const resolved = path.resolve(root, storageKey);
    if (!resolved.startsWith(`${root}${path.sep}`)) throw new ValidationError('Invalid attachment storage key');
    return resolved;
  }
}
