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
import { parseUuid } from '@/lib/parse-uuid';
import { pool } from '@/lib/db';
import { withTransaction } from '@/lib/with-transaction';
import { createUser } from '@/modules/identity/application/create-user';
import { UserRepository } from '@/modules/identity/infrastructure/user.repository';
import type { UUID } from '@/shared/types';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 8192;

async function readRegistrationBody(req: NextRequest): Promise<unknown> {
  if (!req.body) throw new ValidationError('A JSON body is required');
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new ValidationError('Registration body is too large');
      }
      chunks.push(value);
    }
    try {
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
    } catch {
      throw new ValidationError('A valid JSON body is required');
    }
  } finally {
    reader.releaseLock();
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await readRegistrationBody(req);

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
    const parsedTenantId = parseUuid(tenantId, 'tenantId');
    const parsedCompanyId = parseUuid(companyId, 'companyId');

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName = name.trim();
    if (normalizedEmail.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new ValidationError('A valid email address is required');
    }
    if (!normalizedName || normalizedName.length > 200) {
      throw new ValidationError('name must be between 1 and 200 characters');
    }
    if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
      throw new ValidationError('Password must be at least 8 characters and at most 72 bytes');
    }

    const repo = new UserRepository();

    // Domain check - email domain must be in allowed_domains for this tenant.
    // This is the only self-service registration path in v1.
    const domainAllowed = await repo.isDomainAllowed(
      pool, parsedTenantId, parsedCompanyId, normalizedEmail,
    );
    if (!domainAllowed) {
      throw new ForbiddenError(
        'Your email domain is not authorised for self-registration. Contact your project administrator for an invite.',
      );
    }

    const user = await withTransaction((client) =>
      createUser(repo, client, {
        tenantId:  parsedTenantId,
        companyId: parsedCompanyId,
        email: normalizedEmail,
        password,
        name: normalizedName,
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
