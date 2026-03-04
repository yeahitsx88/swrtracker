import { NextResponse, type NextRequest } from 'next/server';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { getTicketRouteContext, withTransaction } from '@/lib/ticket-route-helpers';
import { uploadAttachment } from '@/modules/attachment/application';
import type {
  AttachmentMetadataValidator,
  IAttachmentRepository,
} from '@/modules/attachment/application';
import {
  AttachmentRepository,
  validateAttachmentObjectMetadata,
} from '@/modules/attachment/infrastructure';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import type { ITicketRepository } from '@/modules/ticket/application/ports';
import type { DbClient } from '@/shared/types';
import type { AttachmentObjectMetadata } from '@/modules/attachment/domain/types';

export const dynamic = 'force-dynamic';

type TransactionRunner = <T>(fn: (client: DbClient) => Promise<T>) => Promise<T>;

export interface TicketAttachmentsRouteDeps {
  getTicketRouteContext: typeof getTicketRouteContext;
  createTicketRepo: () => ITicketRepository;
  createAttachmentRepo: () => IAttachmentRepository;
  validateAttachmentMetadata: AttachmentMetadataValidator;
  withTransaction: TransactionRunner;
}

const defaultDeps: TicketAttachmentsRouteDeps = {
  getTicketRouteContext,
  createTicketRepo: () => new TicketRepository(),
  createAttachmentRepo: () => new AttachmentRepository(),
  validateAttachmentMetadata: validateAttachmentObjectMetadata,
  withTransaction,
};

function parseMetadata(body: unknown): AttachmentObjectMetadata {
  const b = body as Record<string, unknown>;
  if (
    !body ||
    typeof body !== 'object' ||
    typeof b.filename !== 'string' ||
    typeof b.mimeType !== 'string' ||
    typeof b.storageKey !== 'string' ||
    typeof b.sizeBytes !== 'number'
  ) {
    throw new ValidationError('filename, mimeType, storageKey, and sizeBytes are required');
  }

  return {
    filename: b.filename,
    mimeType: b.mimeType,
    storageKey: b.storageKey,
    sizeBytes: b.sizeBytes,
  };
}

export async function handlePostTicketAttachments(
  req: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> },
  deps: TicketAttachmentsRouteDeps = defaultDeps,
) {
  try {
    const { ticketId } = await params;
    const ctx = await deps.getTicketRouteContext(req, ticketId);
    const metadata = parseMetadata(await req.json());
    const ticketRepo = deps.createTicketRepo();
    const attachmentRepo = deps.createAttachmentRepo();
    const attachment = await deps.withTransaction((client) =>
      uploadAttachmentForRoute(ticketRepo, attachmentRepo, client, ctx, metadata, deps),
    );

    return NextResponse.json({ attachment }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ ticketId: string }> },
) {
  return handlePostTicketAttachments(req, ctx);
}

async function uploadAttachmentForRoute(
  ticketRepo: ITicketRepository,
  attachmentRepo: IAttachmentRepository,
  db: DbClient,
  ctx: Awaited<ReturnType<typeof getTicketRouteContext>>,
  metadata: AttachmentObjectMetadata,
  deps: TicketAttachmentsRouteDeps,
) {
  const ticket = await ticketRepo.findById(
    db,
    ctx.tenantId,
    ctx.ticketId,
    ctx.visibility,
  );
  if (!ticket) {
    throw new NotFoundError(`Ticket ${ctx.ticketId} not found`);
  }

  const projectStatus = await ticketRepo.findProjectStatus(
    db,
    ctx.tenantId,
    ctx.projectId,
  );
  if (!projectStatus) {
    throw new NotFoundError('Project not found');
  }

  return uploadAttachment(attachmentRepo, db, {
    tenantId: ctx.tenantId,
    ticketId: ctx.ticketId,
    ticketRequesterId: ticket.requesterId,
    ticketStatus: ticket.status,
    projectStatus,
    actorId: ctx.actorId,
    actorRole: ctx.actorRole,
    metadata,
    validateMetadata: deps.validateAttachmentMetadata,
  });
}
