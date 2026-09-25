import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { getProjectConfigRole } from '@/lib/get-project-config-role';
import { parseUuid } from '@/lib/parse-uuid';
import { withTransaction } from '@/lib/with-transaction';
import {
  archiveProject, confirmActingGrant, designateActingSurveyManager,
  inspectProjectContinuity, revokeActingGrant,
} from '@/modules/tenancy/application/project-continuity';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';

export const dynamic = 'force-dynamic';

async function context(req: NextRequest, projectId: string) {
  const auth = await requireAuth(req);
  const parsedProjectId = parseUuid(projectId, 'projectId');
  const actorRole = await getProjectConfigRole(
    pool, auth.tenantId, parsedProjectId, auth.userId,
  );
  return { tenantId: auth.tenantId, projectId: parsedProjectId,
    actorId: auth.userId, actorRole };
}

function requiredUuid(value: unknown, field: string) {
  if (typeof value !== 'string') throw new ValidationError(`${field} must be a UUID`);
  return parseUuid(value, field);
}

export async function GET(
  req: NextRequest, { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const ctx = await context(req, (await params).projectId);
    const continuity = await inspectProjectContinuity(new TenancyRepository(), pool, ctx);
    return NextResponse.json(continuity);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  req: NextRequest, { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const ctx = await context(req, (await params).projectId);
    const body = await req.json() as unknown;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ValidationError('Request body must be an object');
    }
    const input = body as Record<string, unknown>;
    const repo = new TenancyRepository();
    if (input.action === 'designate') {
      if (input.userId !== null && typeof input.userId !== 'string') {
        throw new ValidationError('userId must be a UUID or null');
      }
      const userId = input.userId === null ? null : parseUuid(input.userId, 'userId');
      await withTransaction((db) => designateActingSurveyManager(repo, db,
        { ...ctx, userId }));
      return NextResponse.json({ designatedActingSurveyManagerId: userId });
    }
    if (input.action === 'archive') {
      const openTicketCount = await withTransaction((db) => archiveProject(repo, db, ctx));
      return NextResponse.json({ status: 'ARCHIVED', openTicketCount });
    }
    if (input.action === 'confirm') {
      const grantId = requiredUuid(input.grantId, 'grantId');
      await withTransaction((db) => confirmActingGrant(repo, db, { ...ctx, grantId }));
      return NextResponse.json({ confirmed: true });
    }
    if (input.action === 'revoke') {
      const grantId = requiredUuid(input.grantId, 'grantId');
      const permanentReplacementId = requiredUuid(
        input.permanentReplacementId, 'permanentReplacementId',
      );
      await withTransaction((db) => revokeActingGrant(repo, db,
        { ...ctx, grantId, permanentReplacementId }));
      return NextResponse.json({ revoked: true });
    }
    throw new ValidationError('action must be designate, archive, confirm, or revoke');
  } catch (error) {
    return errorResponse(error);
  }
}
