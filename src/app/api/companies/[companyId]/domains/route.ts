import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireAuth } from '@/lib/auth';
import { requireTenantAdmin } from '@/lib/get-tenant-role';
import { parseUuid } from '@/lib/parse-uuid';
import { withTransaction } from '@/lib/with-transaction';
import { pool } from '@/lib/db';
import { assignCompanyDomain } from '@/modules/tenancy/application/assign-company-domain';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const auth = await requireAuth(req);
    const actorRole = await requireTenantAdmin(pool, auth.tenantId, auth.userId);
    const companyId = parseUuid((await params).companyId, 'companyId');
    const body = await req.json() as unknown;
    if (!body || typeof body !== 'object' ||
        typeof (body as Record<string, unknown>).domain !== 'string') {
      throw new ValidationError('domain is required');
    }
    const { domain } = body as { domain: string };
    const repo = new TenancyRepository();
    const assignedDomain = await withTransaction(client => assignCompanyDomain(repo, client, {
      tenantId: auth.tenantId, companyId, actorId: auth.userId, actorRole, domain,
    }));
    return NextResponse.json({ companyId, domain: assignedDomain }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
