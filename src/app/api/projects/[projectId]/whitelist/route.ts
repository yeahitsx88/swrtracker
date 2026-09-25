/**
 * POST   /api/projects/[projectId]/whitelist — add email to priority whitelist
 * DELETE /api/projects/[projectId]/whitelist — remove email from priority whitelist
 * PROJECT_ADMIN may manage a SETUP project's whitelist.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { parseUuid } from '@/lib/parse-uuid';
import { withTransaction } from '@/lib/with-transaction';
import { getProjectConfigRole } from '@/lib/get-project-config-role';
import { addToWhitelist, removeFromWhitelist } from '@/modules/tenancy/application/whitelist';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const auth = await requireAuth(req);
    const { projectId } = await params;
    const body = await req.json() as unknown;

    if (!body || typeof body !== 'object' ||
        typeof (body as Record<string, unknown>).email !== 'string') {
      throw new ValidationError('email is required');
    }

    const { email } = body as { email: string };
    const parsedProjectId = parseUuid(projectId, 'projectId');
    const actorRole = await getProjectConfigRole(pool, auth.tenantId,
      parsedProjectId, auth.userId);
    const repo = new TenancyRepository();
    const entry = await withTransaction((client) => addToWhitelist(repo, client, {
      tenantId:  auth.tenantId,
      projectId: parsedProjectId,
      email,
      addedBy:   auth.userId,
      actorRole,
    }));
    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const auth = await requireAuth(req);
    const { projectId } = await params;
    const body = await req.json() as unknown;

    if (!body || typeof body !== 'object' ||
        typeof (body as Record<string, unknown>).email !== 'string') {
      throw new ValidationError('email is required');
    }

    const { email } = body as { email: string };
    const parsedProjectId = parseUuid(projectId, 'projectId');
    const actorRole = await getProjectConfigRole(pool, auth.tenantId,
      parsedProjectId, auth.userId);
    const repo = new TenancyRepository();
    await withTransaction((client) => removeFromWhitelist(repo, client, {
      tenantId:  auth.tenantId,
      projectId: parsedProjectId,
      email,
      actorId: auth.userId,
      actorRole,
    }));
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err);
  }
}
