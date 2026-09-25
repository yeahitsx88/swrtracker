import { randomUUID } from 'node:crypto';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import { appendAuditEvent } from '@/modules/audit/application/index';
import type { DbClient, Page, UUID } from '@/shared/types';
import type { Attachment } from '../domain/types';
import type { IAttachmentRepository, UploadTicket } from './ports';

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const terminalStatuses = new Set([
  'COMPLETED', 'REQUESTER_CANCELED', 'FIELD_CANCELED', 'SURVEY_CANCELED',
]);

export async function requireWritableTicket(repo: IAttachmentRepository, db: DbClient,
  tenantId: UUID, ticketId: UUID, requesterId: UUID): Promise<UploadTicket> {
  const ticket = await repo.findWritableTicket(db, tenantId, ticketId, requesterId);
  if (!ticket) throw new NotFoundError('Ticket not found for requester');
  if (terminalStatuses.has(ticket.status)) {
    throw new ConflictError('Attachments cannot be uploaded to a terminal ticket');
  }
  return ticket;
}

export function validateAttachmentMetadata(filenameInput: string, mimeType: string): string {
  const filename = filenameInput.trim();
  if (!filename || filename.length > 255 || /[\\/\u0000-\u001f\u007f]/u.test(filename)) {
    throw new ValidationError('filename must be 1-255 characters without path separators');
  }
  if (!/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/u.test(mimeType) ||
      mimeType.length > 255) {
    throw new ValidationError('A valid MIME type is required');
  }
  return filename;
}

export async function recordAttachmentUpload(repo: IAttachmentRepository, db: DbClient,
  params: { tenantId: UUID; ticketId: UUID; actorId: UUID; filename: string;
    mimeType: string; storageKey: string; sizeBytes: number }): Promise<Attachment> {
  const filename = validateAttachmentMetadata(params.filename, params.mimeType);
  if (!Number.isSafeInteger(params.sizeBytes) || params.sizeBytes < 1 ||
      params.sizeBytes > MAX_ATTACHMENT_BYTES) {
    throw new ValidationError('Attachment must be 1-20 MiB');
  }
  const ticket = await requireWritableTicket(repo, db, params.tenantId,
    params.ticketId, params.actorId);
  const attachment: Attachment = {
    id: randomUUID() as UUID,
    tenantId: params.tenantId,
    ticketId: params.ticketId,
    uploadedBy: params.actorId,
    filename,
    mimeType: params.mimeType,
    storageKey: params.storageKey,
    sizeBytes: params.sizeBytes,
    ticketStatusAtUpload: ticket.status,
    createdAt: new Date(),
  };
  await repo.save(db, attachment);
  await appendAuditEvent(db, { ticketId: params.ticketId, tenantId: params.tenantId,
    actorId: params.actorId, eventType: 'attachment.uploaded',
    payload: { attachmentId: attachment.id, filename,
      sizeBytes: attachment.sizeBytes, ticketStatusAtUpload: ticket.status } });
  return attachment;
}

export async function listTicketAttachments(repo: IAttachmentRepository, db: DbClient,
  params: { tenantId: UUID; ticketId: UUID; limit: number; offset: number }):
  Promise<Page<Attachment>> {
  if (!Number.isSafeInteger(params.limit) || params.limit < 1 || params.limit > 200 ||
      !Number.isSafeInteger(params.offset) || params.offset < 0 || params.offset > 100000) {
    throw new ValidationError('limit must be 1-200 and offset must be 0-100000');
  }
  return repo.list(db, params.tenantId, params.ticketId, params.limit, params.offset);
}

export async function findTicketAttachment(repo: IAttachmentRepository, db: DbClient,
  tenantId: UUID, ticketId: UUID, attachmentId: UUID): Promise<Attachment> {
  const attachment = await repo.findById(db, tenantId, ticketId, attachmentId);
  if (!attachment) throw new NotFoundError('Attachment not found');
  return attachment;
}

export async function recordAttachmentDownload(db: DbClient, attachment: Attachment,
  actorId: UUID): Promise<void> {
  if (!actorId) throw new ForbiddenError('Download actor is required');
  await appendAuditEvent(db, { ticketId: attachment.ticketId, tenantId: attachment.tenantId,
    actorId, eventType: 'attachment.downloaded',
    payload: { attachmentId: attachment.id, filename: attachment.filename } });
}
