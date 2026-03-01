/**
 * POST   /api/projects/[projectId]/whitelist — add email to priority whitelist
 * DELETE /api/projects/[projectId]/whitelist — remove email from priority whitelist
 * Both require TENANT_ADMIN.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { getTenantRole } from '@/lib/get-tenant-role';
import { addToWhitelist, removeFromWhitelist } from '@/modules/tenancy/application/whitelist';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import type { UUID } from '@/shared/types';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const auth = requireAuth(req);
    const { projectId } = await params;
    const body = await req.json() as unknown;

    if (!body || typeof body !== 'object' ||
        typeof (body as Record<string, unknown>).email !== 'string') {
      throw new ValidationError('email is required');
    }

    const { email } = body as { email: string };
    const actorRole = await getTenantRole(pool, auth.tenantId, auth.userId);
    const repo = new TenancyRepository();
    const entry = await addToWhitelist(repo, pool, {
      tenantId:  auth.tenantId,
      projectId: projectId as UUID,
      email,
      addedBy:   auth.userId,
      actorRole,
    });
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
    const auth = requireAuth(req);
    const { projectId } = await params;
    const body = await req.json() as unknown;

    if (!body || typeof body !== 'object' ||
        typeof (body as Record<string, unknown>).email !== 'string') {
      throw new ValidationError('email is required');
    }

    const { email } = body as { email: string };
    const actorRole = await getTenantRole(pool, auth.tenantId, auth.userId);
    const repo = new TenancyRepository();
    await removeFromWhitelist(repo, pool, {
      tenantId:  auth.tenantId,
      projectId: projectId as UUID,
      email,
      actorRole,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err);
  }
}
