import type { DbClient, Page, UUID } from '@/shared/types';
import type { Attachment } from '../domain/types';

export interface UploadTicket {
  id: UUID;
  status: string;
}

export interface PurgeQueueItem {
  id: UUID;
  tenantId: UUID;
  ticketId: UUID;
  storageKey: string;
}

export interface StoredObject {
  storageKey: string;
  modifiedAt: Date;
}

export interface IAttachmentRepository {
  findWritableTicket(db: DbClient, tenantId: UUID, ticketId: UUID,
    requesterId: UUID): Promise<UploadTicket | null>;
  save(db: DbClient, attachment: Attachment): Promise<void>;
  findById(db: DbClient, tenantId: UUID, ticketId: UUID,
    attachmentId: UUID): Promise<Attachment | null>;
  list(db: DbClient, tenantId: UUID, ticketId: UUID,
    limit: number, offset: number): Promise<Page<Attachment>>;
  claimPurgeBatch(db: DbClient, tenantId: UUID, limit: number): Promise<PurgeQueueItem[]>;
  markPurgeDone(db: DbClient, tenantId: UUID, id: UUID): Promise<void>;
  markPurgeFailed(db: DbClient, tenantId: UUID, id: UUID, error: string): Promise<void>;
  findReferencedKeys(db: DbClient, tenantId: UUID,
    keys: string[]): Promise<Set<string>>;
}

export interface IAttachmentStorage {
  createStorageKey(tenantId: UUID, ticketId: UUID): string;
  write(storageKey: string, body: ReadableStream<Uint8Array>, maxBytes: number): Promise<number>;
  read(storageKey: string): Promise<Uint8Array>;
  remove(storageKey: string): Promise<void>;
  listTenantObjects(tenantId: UUID): AsyncIterable<StoredObject>;
}
