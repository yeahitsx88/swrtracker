/**
 * Attachment domain types.
 * No I/O. No imports from infrastructure or application layers.
 */
import type { UUID } from '@/shared/types';

export interface AttachmentObjectMetadata {
  filename: string;
  mimeType: string;
  storageKey: string;
  sizeBytes: number;
  purpose: AttachmentPurpose;
  returnCycle: number;
  contentSha256: string;
}

export type AttachmentPurpose = 'REQUEST_INSTRUCTION' | 'FIELD_SUPPORT';

export interface Attachment {
  id: UUID;
  ticketId: UUID;
  tenantId: UUID;
  uploadedBy: UUID;
  filename: string;
  mimeType: string;
  /** Key in object storage — never a public URL. */
  storageKey: string;
  sizeBytes: number;
  purpose: AttachmentPurpose;
  returnCycle: number;
  contentSha256: string;
  createdAt: Date;
}
