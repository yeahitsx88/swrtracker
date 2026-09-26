import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { getProjectRole } from '@/lib/get-project-role';
import { parseUuid } from '@/lib/parse-uuid';
import { withTransaction } from '@/lib/with-transaction';
import { getHelpBoard } from '@/modules/ticket/application/help-board';
import { HelpFlagRepository } from '@/modules/ticket/infrastructure/help-flag.repository';
import {
  raiseHelpFlag, escalateHelpFlag, clearHelpFlag,
  claimFlaggedTicket,
} from '@/modules/ticket/application/help-flags';

export const dynamic = 'force-dynamic';

function requiredUuid(value: unknown, name: string) {
  if (typeof value !== 'string') throw new ValidationError(`${name} must be a UUID`);
  return parseUuid(value, name);
}

function optionalReason(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new ValidationError('reason must be text');
  return value;
}

async function context(req: NextRequest,
  params: Promise<{ projectId: string }>) {
  const auth = await requireAuth(req);
  const projectId = parseUuid((await params).projectId, 'projectId');
  const actorRole = await getProjectRole(pool, auth.tenantId, projectId, auth.userId);
  return { tenantId: auth.tenantId, projectId,
    actorId: auth.userId, actorRole };
}

export async function GET(req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const ctx = await context(req, params);
    return NextResponse.json(await getHelpBoard(new HelpFlagRepository(), pool, ctx));
  } catch (error) { return errorResponse(error); }
}

export async function POST(req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const ctx = await context(req, params);
    const body: unknown = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ValidationError('Body must be an object');
    }
    const input = body as Record<string, unknown>;
    const repo = new HelpFlagRepository();
    if (input.action === 'raise') {
      if (input.level !== 1 && input.level !== 2) {
        throw new ValidationError('level must be 1 or 2');
      }
      const flag = await withTransaction((db) => raiseHelpFlag(repo, db,
        { ...ctx, level: input.level as 1 | 2,
          reason: optionalReason(input.reason) }));
      return NextResponse.json({ flag }, { status: 201 });
    }
    if (input.action === 'escalate') {
      const flag = await withTransaction((db) => escalateHelpFlag(repo, db,
        { ...ctx, flagId: requiredUuid(input.flagId, 'flagId'),
          reason: optionalReason(input.reason) }));
      return NextResponse.json({ flag }, { status: 201 });
    }
    if (input.action === 'clear') {
      await withTransaction((db) => clearHelpFlag(repo, db,
        { ...ctx, flagId: requiredUuid(input.flagId, 'flagId') }));
      return NextResponse.json({ cleared: true });
    }
    if (input.action === 'claim') {
      await withTransaction((db) => claimFlaggedTicket(repo, db,
        { ...ctx, flagId: requiredUuid(input.flagId, 'flagId'),
          ticketId: requiredUuid(input.ticketId, 'ticketId'),
          instrumentManId: requiredUuid(input.instrumentManId, 'instrumentManId') }));
      return NextResponse.json({ claimed: true });
    }
    throw new ValidationError('Unknown help flag action');
  } catch (error) { return errorResponse(error); }
}
