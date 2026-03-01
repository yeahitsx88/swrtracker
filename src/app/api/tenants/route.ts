/**
 * POST /api/tenants
 * Bootstrap endpoint — no auth required. Creates a new tenant.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { pool } from '@/lib/db';
import { createTenant } from '@/modules/tenancy/application/create-tenant';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as unknown;
    if (!body || typeof body !== 'object' ||
        typeof (body as Record<string, unknown>).name !== 'string') {
      throw new ValidationError('name is required');
    }
    const { name } = body as { name: string };

    const repo = new TenancyRepository();
    const tenant = await createTenant(repo, pool, { name });
    return NextResponse.json({ tenant }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
