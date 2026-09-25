import { NextResponse, type NextRequest } from 'next/server';
import { NotFoundError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireAuth } from '@/lib/auth';
import { assertAccessAdministrator } from '@/lib/access-administrator';
import { withTransaction } from '@/lib/with-transaction';
import { CompanyAccessRepository } from '@/modules/identity/infrastructure/company-access.repository';
import type { UUID } from '@/shared/types';

export const dynamic = 'force-dynamic';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; grantId: string }> },
) {
  try {
    const auth = requireAuth(req);
    const { projectId, grantId } = await params;
    const repo = new CompanyAccessRepository();
    await withTransaction(async (db) => {
      await assertAccessAdministrator(db, auth, projectId as UUID);
      const grant = await repo.revokeCompanyAuthority(db, {
        tenantId: auth.tenantId,
        projectId: projectId as UUID,
        grantId: grantId as UUID,
        actorId: auth.userId,
      });
      if (!grant) throw new NotFoundError('Active company authority grant not found');
      await repo.appendEvent(db, grant, auth.userId, 'COMPANY_AUTHORITY_REVOKED');
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err);
  }
}
