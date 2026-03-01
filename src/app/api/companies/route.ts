/**
 * POST /api/companies
 * Creates a company within the authenticated user's tenant.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { getTenantRole } from '@/lib/get-tenant-role';
import { createCompany } from '@/modules/tenancy/application/create-company';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import type { CompanyType } from '@/modules/tenancy/domain/types';
import type { UUID } from '@/shared/types';

export const dynamic = 'force-dynamic';

const VALID_TYPES: CompanyType[] = ['GC', 'SUBCONTRACTOR', 'OWNER_REP'];

export async function POST(req: NextRequest) {
  try {
    const auth = requireAuth(req);
    const body = await req.json() as unknown;

    if (!body || typeof body !== 'object' ||
        typeof (body as Record<string, unknown>).name !== 'string' ||
        typeof (body as Record<string, unknown>).type !== 'string' ||
        !VALID_TYPES.includes((body as Record<string, unknown>).type as CompanyType)) {
      throw new ValidationError(`name and type (${VALID_TYPES.join('|')}) are required`);
    }

    const { name, type } = body as { name: string; type: CompanyType };
    const actorRole = await getTenantRole(pool, auth.tenantId, auth.userId);
    const repo = new TenancyRepository();
    const company = await createCompany(repo, pool, {
      tenantId: auth.tenantId as UUID,
      name,
      type,
      actorRole,
    });
    return NextResponse.json({ company }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
