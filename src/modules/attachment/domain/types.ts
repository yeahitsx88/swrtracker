/**
 * Attachment domain types.
 * No I/O. No imports from infrastructure or application layers.
 */
import type { UUID } from '@/shared/types';

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
  createdAt: Date;
}
