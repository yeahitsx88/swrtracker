/**
 * Attachment application layer.
 * Do not import from infrastructure here.
 */
import { randomUUID } from 'crypto';
import { ConflictError, ForbiddenError, ValidationError } from '@/shared/errors';
import { appendAuditEvent } from '@/modules/audit/application';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { ProjectStatus } from '@/modules/tenancy/domain/types';
import type { TicketStatus } from '@/modules/workflow/domain/transitions';
import type { Attachment, AttachmentObjectMetadata } from '../domain/types';

export type { Attachment, AttachmentObjectMetadata } from '../domain/types';

export interface IAttachmentRepository {
  saveAttachment(db: DbClient, attachment: Attachment): Promise<void>;
}

export type AttachmentMetadataValidator = (
  metadata: AttachmentObjectMetadata,
) => Promise<void> | void;

const TERMINAL_UPLOAD_BLOCKED_STATUSES: ReadonlySet<TicketStatus> = new Set([
  'COMPLETED',
  'REQUESTER_CANCELED',
  'FIELD_CANCELED',
  'SURVEY_CANCELED',
]);

export async function uploadAttachment(
  repo: IAttachmentRepository,
  db: DbClient,
  params: {
    tenantId: UUID;
    ticketId: UUID;
    ticketRequesterId: UUID;
    ticketStatus: TicketStatus;
    projectStatus: ProjectStatus;
    actorId: UUID;
    actorRole: ProjectRole;
    metadata: AttachmentObjectMetadata;
    validateMetadata?: AttachmentMetadataValidator;
  },
): Promise<Attachment> {
  if (params.actorRole !== 'REQUESTER') {
    throw new ForbiddenError('Only REQUESTER may upload attachments');
  }

  if (params.ticketRequesterId !== params.actorId) {
    throw new ForbiddenError('You can only upload attachments to your own tickets');
  }

  if (params.projectStatus === 'ARCHIVED') {
    throw new ConflictError('Archived projects are read-only');
  }

  if (TERMINAL_UPLOAD_BLOCKED_STATUSES.has(params.ticketStatus)) {
    throw new ConflictError('Attachments may only be uploaded while the ticket is active');
  }

  const filename = params.metadata.filename.trim();
  const mimeType = params.metadata.mimeType.trim();
  const storageKey = params.metadata.storageKey.trim();

  if (!filename) {
    throw new ValidationError('filename is required');
  }
  if (!mimeType) {
    throw new ValidationError('mimeType is required');
  }
  if (!storageKey) {
    throw new ValidationError('storageKey is required');
  }
  if (!Number.isInteger(params.metadata.sizeBytes) || params.metadata.sizeBytes <= 0) {
    throw new ValidationError('sizeBytes must be a positive integer');
  }

  if (params.validateMetadata) {
    await params.validateMetadata({
      filename,
      mimeType,
      storageKey,
      sizeBytes: params.metadata.sizeBytes,
    });
  }

  const attachment: Attachment = {
    id: randomUUID() as UUID,
    ticketId: params.ticketId,
    tenantId: params.tenantId,
    uploadedBy: params.actorId,
    filename,
    mimeType,
    storageKey,
    sizeBytes: params.metadata.sizeBytes,
    createdAt: new Date(),
  };

  await repo.saveAttachment(db, attachment);
  await appendAuditEvent(db, {
    ticketId: params.ticketId,
    tenantId: params.tenantId,
    actorId: params.actorId,
    eventType: 'attachment.uploaded',
    payload: {
      uploadedBy: params.actorId,
      filename,
      mimeType,
      sizeBytes: params.metadata.sizeBytes,
      ticketStatusAtUpload: params.ticketStatus,
    },
  });

  return attachment;
}
