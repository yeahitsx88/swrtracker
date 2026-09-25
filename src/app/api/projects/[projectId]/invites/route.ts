import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireAuth } from '@/lib/auth';
import { assertAccessAdministrator } from '@/lib/access-administrator';
import { withTransaction } from '@/lib/with-transaction';
import { CompanyAccessRepository } from '@/modules/identity/infrastructure/company-access.repository';
import type { UUID } from '@/shared/types';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const auth = requireAuth(req);
    const { projectId } = await params;
    const body = await req.json() as Record<string, unknown>;
    if (!body || typeof body.companyId !== 'string' || typeof body.email !== 'string') {
      throw new ValidationError('companyId and email are required');
    }
    const email = body.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ValidationError('A valid email is required');
    }
    const companyId = body.companyId.trim() as UUID;
    if (!companyId) throw new ValidationError('companyId is required');

    const repo = new CompanyAccessRepository();
    const result = await withTransaction(async (db) => {
      await assertAccessAdministrator(db, auth, projectId as UUID);
      const invite = await repo.createRequesterInvite(db, {
        tenantId: auth.tenantId,
        projectId: projectId as UUID,
        companyId,
        email,
        invitedBy: auth.userId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      if (!invite) throw new ValidationError('Company must be a subcontractor in this project tenant');
      return invite;
    });
    return NextResponse.json({ inviteToken: result.token }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
