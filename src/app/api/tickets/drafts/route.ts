import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { errorResponse } from '@/lib/api-error';
import { getProjectRole } from '@/lib/get-project-role';
import { parseUuid } from '@/lib/parse-uuid';
import { withTransaction } from '@/lib/with-transaction';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { deleteDraft, listRecoverableDrafts, listRequesterDrafts,
  recoverDraft, saveDraft, type DraftFields } from '@/modules/ticket/application/drafts';
import { ValidationError } from '@/shared/errors';
import type { TicketType } from '@/modules/ticket/domain/types';

export const dynamic = 'force-dynamic';
const types = new Set<TicketType>(['LAYOUT', 'CHECK_OUT', 'AS_BUILT', 'TOPO', 'PERMIT']);

function pagination(url: string) {
  const query = new URL(url).searchParams;
  const limit = Number(query.get('limit') ?? '50');
  const offset = Number(query.get('offset') ?? '0');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200 ||
      !Number.isSafeInteger(offset) || offset < 0 || offset > 100000) {
    throw new ValidationError('Invalid pagination');
  }
  return { limit, offset, query };
}

function fields(input: Record<string, unknown>): DraftFields {
  const result: DraftFields = {};
  for (const field of ['aorNodeId', 'departmentId'] as const) {
    if (input[field] !== undefined) {
      const value = input[field];
      if (value !== null && typeof value !== 'string') throw new ValidationError(`${field} must be UUID or null`);
      result[field] = value === null ? null : parseUuid(value as string, field);
    }
  }
  if (input.ticketType !== undefined) {
    if (input.ticketType !== null &&
        (typeof input.ticketType !== 'string' || !types.has(input.ticketType as TicketType))) {
      throw new ValidationError('Invalid ticketType');
    }
    result.ticketType = input.ticketType as TicketType | null;
  }
  for (const field of ['craft', 'description'] as const) {
    if (input[field] !== undefined) {
      const value = input[field];
      if (value !== null && (typeof value !== 'string' || value.length > 10000)) {
        throw new ValidationError(`${field} must be text or null`);
      }
      result[field] = value as string | null;
    }
  }
  if (input.requestedDate !== undefined) {
    if (input.requestedDate !== null && typeof input.requestedDate !== 'string') {
      throw new ValidationError('requestedDate must be a date or null');
    }
    const value = input.requestedDate === null ? null : new Date(input.requestedDate as string);
    if (value && Number.isNaN(value.getTime())) throw new ValidationError('Invalid requestedDate');
    result.requestedDate = value;
  }
  return result;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    const { query, limit, offset } = pagination(req.url);
    const repo = new TicketRepository();
    if (query.get('mode') === 'deleted') {
      const rawProjectId = query.get('projectId');
      if (!rawProjectId) throw new ValidationError('projectId is required');
      const projectId = parseUuid(rawProjectId, 'projectId');
      const actorRole = await getProjectRole(pool, auth.tenantId, projectId, auth.userId);
       const page = await listRecoverableDrafts(repo, pool, {
         tenantId: auth.tenantId, projectId, actorId: auth.userId,
         actorRole, limit, offset });
      return NextResponse.json(page);
    }
    if (query.get('mode') && query.get('mode') !== 'mine') throw new ValidationError('Invalid mode');
    const page = await listRequesterDrafts(repo, pool, {
      tenantId: auth.tenantId, requesterId: auth.userId, limit, offset });
    return NextResponse.json(page);
  } catch (error) { return errorResponse(error); }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    const body = await req.json() as unknown;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ValidationError('Draft request must be an object');
    }
    const input = body as Record<string, unknown>;
    const repo = new TicketRepository();
    if (input.action === 'recover') {
      if (typeof input.projectId !== 'string' || typeof input.ticketId !== 'string' ||
          typeof input.reason !== 'string') throw new ValidationError('Recovery fields are required');
      const projectId = parseUuid(input.projectId, 'projectId');
      const actorRole = await getProjectRole(pool, auth.tenantId, projectId, auth.userId);
      const ticket = await withTransaction(client => recoverDraft(repo, client, {
        tenantId: auth.tenantId, projectId, ticketId: parseUuid(input.ticketId as string, 'ticketId'),
        actorId: auth.userId, actorRole, reason: input.reason as string }));
      return NextResponse.json({ ticket });
    }
    if (input.action !== 'save' || typeof input.projectId !== 'string') {
      throw new ValidationError('action=save and projectId are required');
    }
    const company = await repo.findUserCompanyInfo(pool, auth.tenantId, auth.userId);
    if (!company) throw new ValidationError('Requester company not found');
    if (input.ticketId !== undefined && typeof input.ticketId !== 'string') {
      throw new ValidationError('ticketId must be a UUID');
    }
    if (input.parentTicketId !== undefined && typeof input.parentTicketId !== 'string') {
      throw new ValidationError('parentTicketId must be a UUID');
    }
    const ticket = await withTransaction(client => saveDraft(repo, client, {
      tenantId: auth.tenantId, projectId: parseUuid(input.projectId as string, 'projectId'),
      requesterId: auth.userId, companyId: company.companyId,
      ticketId: input.ticketId ? parseUuid(input.ticketId as string, 'ticketId') : undefined,
      parentTicketId: input.parentTicketId
        ? parseUuid(input.parentTicketId as string, 'parentTicketId') : undefined,
      fields: fields(input),
    }));
    return NextResponse.json({ ticket }, { status: input.ticketId ? 200 : 201 });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    const ticketId = new URL(req.url).searchParams.get('ticketId');
    if (!ticketId) throw new ValidationError('ticketId is required');
    const ticket = await withTransaction(client => deleteDraft(
      new TicketRepository(), client,
      { tenantId: auth.tenantId, ticketId: parseUuid(ticketId, 'ticketId'),
        requesterId: auth.userId }));
    return NextResponse.json({ ticket });
  } catch (error) { return errorResponse(error); }
}
