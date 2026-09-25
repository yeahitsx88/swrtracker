/**
 * Attachment application layer.
 * Do not import from infrastructure here.
 */
export type { Attachment } from '../domain/types';
export type { IAttachmentRepository, IAttachmentStorage } from './ports';
export { MAX_ATTACHMENT_BYTES, requireWritableTicket, validateAttachmentMetadata,
  recordAttachmentUpload,
  listTicketAttachments, findTicketAttachment, recordAttachmentDownload } from './attachments';
export { processAttachmentPurgeQueue, sweepOrphanedAttachments } from './maintenance';
