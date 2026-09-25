import { NextResponse, type NextRequest } from 'next/server';
import { ForbiddenError, ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { requireTenantAdmin } from '@/lib/get-tenant-role';
import { parseUuid } from '@/lib/parse-uuid';
import { withTransaction } from '@/lib/with-transaction';
import { deactivateUser, reactivateUser } from
  '@/modules/identity/application/user-lifecycle';
import { UserLifecycleRepository } from
  '@/modules/identity/infrastructure/user-lifecycle.repository';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }) {
  try {
    const auth = await requireAuth(req);
    const actorRole = await requireTenantAdmin(pool, auth.tenantId, auth.userId);
    const { userId } = await params;
    const parsedUserId = parseUuid(userId, 'userId');
    const body: unknown = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        !['DEACTIVATE', 'REACTIVATE'].includes(
          (body as Record<string, unknown>).action as string)) {
      throw new ValidationError('action must be DEACTIVATE or REACTIVATE');
    }
    const repo = new UserLifecycleRepository();
    const input = { tenantId: auth.tenantId, userId: parsedUserId,
      actorId: auth.userId, actorRole };
    if ((body as Record<string, unknown>).action === 'REACTIVATE') {
      await withTransaction(db => reactivateUser(repo, db, input));
      return NextResponse.json({ reactivated: true });
    }
    const result = await withTransaction(db => deactivateUser(repo,
      new TenancyRepository(), db, input));
    if (!result.deactivated) {
      throw new ForbiddenError(`Survey Manager replacement required for: ${
        result.blockedProjects.map(project => project.name).join(', ')}`);
    }
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
