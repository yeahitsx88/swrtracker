/**
 * Attachment infrastructure — DB metadata repository + object metadata validation hook.
 * Object storage byte transfer remains outside this Phase 2 metadata surface.
 */
import { ValidationError } from '@/shared/errors';
import type { DbClient } from '@/shared/types';
import type { Attachment, AttachmentObjectMetadata } from '../domain/types';
import type { AttachmentMetadataValidator, IAttachmentRepository } from '../application';

export class AttachmentRepository implements IAttachmentRepository {
  async saveAttachment(db: DbClient, attachment: Attachment): Promise<void> {
    await db.query(
      `INSERT INTO attachments (
         id, ticket_id, tenant_id, uploaded_by, filename, mime_type, storage_key, size_bytes, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        attachment.id,
        attachment.ticketId,
        attachment.tenantId,
        attachment.uploadedBy,
        attachment.filename,
        attachment.mimeType,
        attachment.storageKey,
        attachment.sizeBytes,
        attachment.createdAt,
      ],
    );
  }
}

export const validateAttachmentObjectMetadata: AttachmentMetadataValidator = (
  metadata: AttachmentObjectMetadata,
) => {
  if (!metadata.filename.trim()) {
    throw new ValidationError('filename is required');
  }
  if (!metadata.mimeType.trim()) {
    throw new ValidationError('mimeType is required');
  }
  if (!metadata.storageKey.trim()) {
    throw new ValidationError('storageKey is required');
  }
  if (!Number.isInteger(metadata.sizeBytes) || metadata.sizeBytes <= 0) {
    throw new ValidationError('sizeBytes must be a positive integer');
  }
};
