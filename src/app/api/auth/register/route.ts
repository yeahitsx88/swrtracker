/**
 * POST /api/auth/register
 *
 * Self-registration flow (CLAUDE.md §8):
 * 1. Parse and validate input.
 * 2. Check the email domain against allowed_domains for this tenant.
 *    - Domain match -> registration proceeds, user gets REQUESTER role.
 *    - No match -> 403 ForbiddenError.
 * Invite-based registration is handled separately via /api/auth/invite/:token (future).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { ForbiddenError, ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { pool } from '@/lib/db';
import { withTransaction } from '@/lib/with-transaction';
import { createUser } from '@/modules/identity/application/create-user';
import { UserRepository } from '@/modules/identity/infrastructure/user.repository';
import type { UUID } from '@/shared/types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as unknown;

    if (
      !body ||
      typeof body !== 'object' ||
      typeof (body as Record<string, unknown>).tenantId   !== 'string' ||
      typeof (body as Record<string, unknown>).companyId  !== 'string' ||
      typeof (body as Record<string, unknown>).email      !== 'string' ||
      typeof (body as Record<string, unknown>).password   !== 'string' ||
      typeof (body as Record<string, unknown>).name       !== 'string'
    ) {
      throw new ValidationError('tenantId, companyId, email, password, and name are required');
    }

    const { tenantId, companyId, email, password, name } = body as {
      tenantId: string; companyId: string; email: string; password: string; name: string;
    };

    if (password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters');
    }

    const repo = new UserRepository();

    // Domain check - email domain must be in allowed_domains for this tenant.
    // This is the only self-service registration path in v1.
    const domainAllowed = await repo.isDomainAllowed(pool, tenantId as UUID, email);
    if (!domainAllowed) {
      throw new ForbiddenError(
        'Your email domain is not authorised for self-registration. Contact your project administrator for an invite.',
      );
    }

    const user = await withTransaction((client) =>
      createUser(repo, client, {
        tenantId:  tenantId  as UUID,
        companyId: companyId as UUID,
        email,
        password,
        name,
      }),
    );

    return NextResponse.json(
      { user: { id: user.id, email: user.email, name: user.name, tenantId: user.tenantId } },
      { status: 201 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
