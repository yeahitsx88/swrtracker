/**
 * POST /api/tenant-memberships
 * DELETE /api/tenant-memberships
 * Both require TENANT_ADMIN.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { getTenantRole } from '@/lib/get-tenant-role';
import {
  removeTenantMembership,
  upsertTenantMembership,
} from '@/modules/tenancy/application/tenant-memberships';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import type { TenantMembership } from '@/modules/tenancy/domain/types';
import type { UUID } from '@/shared/types';

export const dynamic = 'force-dynamic';

const VALID_TENANT_ROLES: TenantMembership['role'][] = ['TENANT_ADMIN', 'BILLING_VIEWER'];

export async function POST(req: NextRequest) {
  try {
    const auth = requireAuth(req);
    const body = await req.json() as Record<string, unknown>;
    if (
      !body ||
      typeof body !== 'object' ||
      typeof body.userId !== 'string' ||
      typeof body.role !== 'string' ||
      !VALID_TENANT_ROLES.includes(body.role as TenantMembership['role'])
    ) {
      throw new ValidationError('userId and role (TENANT_ADMIN|BILLING_VIEWER) are required');
    }

    const actorRole = await getTenantRole(pool, auth.tenantId, auth.userId, auth.sessionVersion);
    const repo = new TenancyRepository();
    const membership = await upsertTenantMembership(repo, pool, {
      tenantId: auth.tenantId,
      userId: body.userId as UUID,
      role: body.role as TenantMembership['role'],
      actorRole,
    });

    return NextResponse.json({ membership }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = requireAuth(req);
    const body = await req.json() as Record<string, unknown>;
    if (!body || typeof body !== 'object' || typeof body.userId !== 'string') {
      throw new ValidationError('userId is required');
    }

    const actorRole = await getTenantRole(pool, auth.tenantId, auth.userId, auth.sessionVersion);
    const repo = new TenancyRepository();
    await removeTenantMembership(repo, pool, {
      tenantId: auth.tenantId,
      userId: body.userId as UUID,
      actorRole,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err);
  }
}
