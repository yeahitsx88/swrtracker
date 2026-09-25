import { randomUUID } from 'crypto';
import { ConflictError, ForbiddenError, ValidationError } from '@/shared/errors';
import { appendAuditEvent } from '@/modules/audit/application';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { ProjectStatus } from '@/modules/tenancy/domain/types';
import type { TicketStatus } from '@/modules/workflow/domain/transitions';
import type { Attachment, AttachmentObjectMetadata, AttachmentPurpose } from '../domain/types';

export type { Attachment, AttachmentObjectMetadata, AttachmentPurpose } from '../domain/types';

export interface IAttachmentRepository {
  saveAttachment(db: DbClient, attachment: Attachment): Promise<void>;
  countTicketAttachments(db: DbClient, tenantId: UUID, ticketId: UUID): Promise<number>;
  findProjectAttachmentLimit(db: DbClient, tenantId: UUID, projectId: UUID): Promise<number | null>;
}

export type AttachmentMetadataValidator = (metadata: AttachmentObjectMetadata) => Promise<void> | void;

const REQUESTER_EDITABLE = new Set<TicketStatus>(['DRAFT', 'RETURNED_FOR_CORRECTION']);
const FIELD_SUPPORT_ACTIVE = new Set<TicketStatus>([
  'APPROVED', 'ASSIGNED', 'IN_PROGRESS', 'PENDING_FIELD_VALIDATION', 'DELAYED',
]);

function assertUploadAuthority(params: {
  ticketRequesterId: UUID;
  ticketStatus: TicketStatus;
  actorId: UUID;
  actorRole: ProjectRole;
  assignedPartyChiefId: UUID | null;
  assignedInstrumentManId: UUID | null;
  purpose: AttachmentPurpose;
}): void {
  if (params.purpose === 'REQUEST_INSTRUCTION') {
    if (params.actorRole !== 'REQUESTER' || params.ticketRequesterId !== params.actorId) {
      throw new ForbiddenError('Only the original requester may upload request instructions');
    }
    if (!REQUESTER_EDITABLE.has(params.ticketStatus)) {
      throw new ConflictError('Request instructions may only be added to a draft or returned SWR');
    }
    return;
  }

  if (!FIELD_SUPPORT_ACTIVE.has(params.ticketStatus)) {
    throw new ConflictError('Field support files may only be added while approved work is active');
  }
  if (params.actorRole === 'SURVEY_MANAGER') return;
  if (params.actorRole === 'PARTY_CHIEF' && params.assignedPartyChiefId === params.actorId) return;
  if (params.actorRole === 'INSTRUMENT_MAN' && params.assignedInstrumentManId === params.actorId) return;
  throw new ForbiddenError('Only Survey Lead or assigned field staff may upload field support files');
}

export async function uploadAttachment(
  repo: IAttachmentRepository,
  db: DbClient,
  params: {
    tenantId: UUID;
    projectId: UUID;
    ticketId: UUID;
    ticketRequesterId: UUID;
    ticketStatus: TicketStatus;
    ticketReturnCycle: number;
    assignedPartyChiefId: UUID | null;
    assignedInstrumentManId: UUID | null;
    projectStatus: ProjectStatus;
    actorId: UUID;
    actorRole: ProjectRole;
    metadata: AttachmentObjectMetadata;
    validateMetadata?: AttachmentMetadataValidator;
  },
): Promise<Attachment> {
  if (params.projectStatus === 'ARCHIVED') throw new ConflictError('Archived projects are read-only');
  assertUploadAuthority({
    ticketRequesterId: params.ticketRequesterId,
    ticketStatus: params.ticketStatus,
    actorId: params.actorId,
    actorRole: params.actorRole,
    assignedPartyChiefId: params.assignedPartyChiefId,
    assignedInstrumentManId: params.assignedInstrumentManId,
    purpose: params.metadata.purpose,
  });

  const filename = params.metadata.filename.trim();
  const mimeType = params.metadata.mimeType.trim().toLowerCase();
  const storageKey = params.metadata.storageKey.trim();
  if (!filename || !mimeType || !storageKey) throw new ValidationError('filename, mimeType, and storageKey are required');
  if (!Number.isInteger(params.metadata.sizeBytes) || params.metadata.sizeBytes <= 0) {
    throw new ValidationError('sizeBytes must be a positive integer');
  }
  if (params.metadata.returnCycle !== params.ticketReturnCycle) {
    throw new ConflictError('Attachment return cycle does not match the current SWR revision');
  }
  if (!/^[a-f0-9]{64}$/.test(params.metadata.contentSha256)) {
    throw new ValidationError('contentSha256 must be a lowercase SHA-256 digest');
  }
  if (params.validateMetadata) await params.validateMetadata({ ...params.metadata, filename, mimeType, storageKey });

  const limit = await repo.findProjectAttachmentLimit(db, params.tenantId, params.projectId);
  if (limit !== null) {
    const count = await repo.countTicketAttachments(db, params.tenantId, params.ticketId);
    if (count >= limit) throw new ConflictError(`This project allows at most ${limit} attachments per SWR`);
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
    purpose: params.metadata.purpose,
    returnCycle: params.metadata.returnCycle,
    contentSha256: params.metadata.contentSha256,
    createdAt: new Date(),
  };
  await repo.saveAttachment(db, attachment);
  await appendAuditEvent(db, {
    ticketId: params.ticketId,
    tenantId: params.tenantId,
    actorId: params.actorId,
    eventType: 'attachment.uploaded',
    payload: {
      attachmentId: attachment.id,
      filename,
      mimeType,
      sizeBytes: attachment.sizeBytes,
      purpose: attachment.purpose,
      returnCycle: attachment.returnCycle,
      contentSha256: attachment.contentSha256,
      ticketStatusAtUpload: params.ticketStatus,
    },
  });
  return attachment;
}
