/**
 * Uploader withdrawal of a mistaken file. Only the uploader may withdraw, and
 * only while they could still upload that kind of file to this request. The
 * row and stored bytes are retained; the file stops being downloadable and
 * stops counting toward the per-request limit. Runs in the caller's held
 * ticket mutation transaction (ticket row already locked).
 */
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import { appendAuditEvent } from '@/modules/audit/application';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { ProjectStatus } from '@/modules/tenancy/domain/types';
import type { TicketStatus } from '@/modules/workflow/domain/transitions';
import type { AttachmentPurpose } from '../domain/types';
import { assertUploadAuthority } from './index';

export function normalizeWithdrawalReason(raw: unknown): string {
  if (typeof raw !== 'string') throw new ValidationError('Say why you are withdrawing this file.');
  const reason = raw.replace(/\s+/g, ' ').trim();
  if (reason.length < 3) throw new ValidationError('Say why you are withdrawing this file (at least 3 characters).');
  if (reason.length > 500) throw new ValidationError('Keep the reason to 500 characters or fewer.');
  return reason;
}

export async function withdrawAttachment(db: DbClient, params: {
  tenantId: UUID; ticketId: UUID; attachmentId: UUID; actorId: UUID; actorRole: ProjectRole;
  reason: string; projectStatus: ProjectStatus;
  ticket: { status: TicketStatus; requesterId: UUID; assignedPartyChiefId: UUID | null; assignedInstrumentManId: UUID | null };
}): Promise<{ attachmentId: UUID; withdrawnAt: string }> {
  const { rows } = await db.query<{ uploaded_by: UUID; purpose: AttachmentPurpose; filename: string; content_sha256: string; withdrawn_at: Date | null }>(
    `SELECT uploaded_by, purpose, filename, content_sha256, withdrawn_at
     FROM attachments WHERE tenant_id = $1 AND ticket_id = $2 AND id = $3
     FOR UPDATE`,
    [params.tenantId, params.ticketId, params.attachmentId],
  );
  const row = rows[0];
  if (!row) throw new NotFoundError('Attachment not found');
  if (row.withdrawn_at) throw new ConflictError('This file was already withdrawn. Reload to see the current files.', 'ATTACHMENT_ALREADY_WITHDRAWN');
  if (row.uploaded_by !== params.actorId) throw new ForbiddenError('Only the person who uploaded this file can withdraw it.');
  if (params.projectStatus === 'ARCHIVED') throw new ConflictError('Archived projects are read-only');
  assertUploadAuthority({
    ticketRequesterId: params.ticket.requesterId, ticketStatus: params.ticket.status,
    actorId: params.actorId, actorRole: params.actorRole,
    assignedPartyChiefId: params.ticket.assignedPartyChiefId, assignedInstrumentManId: params.ticket.assignedInstrumentManId,
    purpose: row.purpose,
  });
  const { rows: updated } = await db.query<{ withdrawn_at: Date }>(
    `UPDATE attachments SET withdrawn_at = NOW(), withdrawn_by = $4, withdrawal_reason = $5
     WHERE tenant_id = $1 AND ticket_id = $2 AND id = $3 AND withdrawn_at IS NULL
     RETURNING withdrawn_at`,
    [params.tenantId, params.ticketId, params.attachmentId, params.actorId, params.reason],
  );
  if (!updated[0]) throw new ConflictError('This file changed. Reload to see the current files.', 'WORKFLOW_STALE_STATE');
  await appendAuditEvent(db, {
    ticketId: params.ticketId, tenantId: params.tenantId, actorId: params.actorId,
    eventType: 'attachment.withdrawn',
    payload: { attachmentId: params.attachmentId, filename: row.filename, contentSha256: row.content_sha256, reason: params.reason },
  });
  return { attachmentId: params.attachmentId, withdrawnAt: updated[0].withdrawn_at.toISOString() };
}
