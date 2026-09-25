import { NextResponse, type NextRequest } from 'next/server';
import { ConflictError, ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireAuth } from '@/lib/auth';
import { assertAccessAdministrator } from '@/lib/access-administrator';
import { withTransaction } from '@/lib/with-transaction';
import { CompanyAccessRepository } from '@/modules/identity/infrastructure/company-access.repository';
import type { UUID } from '@/shared/types';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const auth = requireAuth(req);
    const { projectId } = await params;
    const repo = new CompanyAccessRepository();
    const overview = await withTransaction(async (db) => {
      await assertAccessAdministrator(db, auth, projectId as UUID);
      return repo.listProjectCompanyAccess(db, auth.tenantId, projectId as UUID);
    });
    return NextResponse.json(overview);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const auth = requireAuth(req);
    const { projectId } = await params;
    const body = await req.json() as Record<string, unknown>;
    if (!body || typeof body.userId !== 'string' || !body.userId.trim()) {
      throw new ValidationError('userId is required');
    }
    const repo = new CompanyAccessRepository();
    const grant = await withTransaction(async (db) => {
      await assertAccessAdministrator(db, auth, projectId as UUID);
      const created = await repo.grantCompanyAuthority(db, {
        tenantId: auth.tenantId,
        projectId: projectId as UUID,
        userId: body.userId as UUID,
        actorId: auth.userId,
      });
      if (!created) throw new ConflictError('User is ineligible or already has company authority');
      await repo.appendEvent(db, created, auth.userId, 'COMPANY_AUTHORITY_GRANTED');
      return created;
    });
    return NextResponse.json({ grant }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
