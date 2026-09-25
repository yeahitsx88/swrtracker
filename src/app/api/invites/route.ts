import { NextResponse, type NextRequest } from 'next/server';
import { ConflictError, ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { COOKIE_NAME, requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { parseUuid } from '@/lib/parse-uuid';
import { withTransaction } from '@/lib/with-transaction';
import type { ProjectRole } from '@/modules/identity/domain/types';
import { publicInvite } from '@/modules/identity/domain/invite';
import { acceptInvite, cancelInvite, createInvite, inspectInvite,
  listInvites } from '@/modules/identity/application/invites';
import { InviteRepository } from '@/modules/identity/infrastructure/invite.repository';
import { UserRepository } from '@/modules/identity/infrastructure/user.repository';

export const dynamic = 'force-dynamic';

const ROLES: readonly ProjectRole[] = [
  'PROJECT_ADMIN', 'REQUESTER', 'SURVEY_MANAGER', 'SURVEY_SUPERINTENDENT',
  'PARTY_CHIEF', 'INSTRUMENT_MAN', 'CAD_TECHNICIAN', 'CAD_LEAD',
  'VIEWER', 'AREA_VIEWER', 'DEPARTMENT_MANAGER', 'DEPARTMENT_LEAD',
  'SUBCONTRACTS_COORDINATOR',
];
const MAX_BODY_BYTES = 8192;
const NO_STORE = { 'Cache-Control': 'no-store' };

async function bodyObject(req: NextRequest): Promise<Record<string, unknown>> {
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
        throw new ValidationError('Invite body is too large');
      }
      chunks.push(value);
    }
    let data: unknown;
    try {
      data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
    } catch {
      throw new ValidationError('A valid JSON body is required');
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new ValidationError('A JSON object is required');
    }
    return data as Record<string, unknown>;
  } finally {
    reader.releaseLock();
  }
}

function requiredString(body: Record<string, unknown>, name: string): string {
  const value = body[name];
  if (typeof value !== 'string') throw new ValidationError(`${name} is required`);
  return value;
}

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token');
    const repo = new InviteRepository();
    if (token) {
      const auth = req.cookies.get(COOKIE_NAME)?.value ? await requireAuth(req) : null;
      const invite = await withTransaction(db => inspectInvite(repo, db, parseUuid(token, 'token')));
      return NextResponse.json({ invite, signedIn: Boolean(auth) }, { headers: NO_STORE });
    }
    const auth = await requireAuth(req);
    const projectId = parseUuid(req.nextUrl.searchParams.get('projectId') ?? '', 'projectId');
    const limit = Number(req.nextUrl.searchParams.get('limit') ?? '25');
    const offset = Number(req.nextUrl.searchParams.get('offset') ?? '0');
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 ||
        !Number.isInteger(offset) || offset < 0) {
      throw new ValidationError('limit must be 1–100 and offset must be nonnegative');
    }
    const invites = await listInvites(repo, pool, {
      tenantId: auth.tenantId, projectId, actorId: auth.userId, limit, offset,
    });
    return NextResponse.json(invites, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    const body = await bodyObject(req);
    const email = requiredString(body, 'email').trim().toLowerCase();
    const role = requiredString(body, 'role') as ProjectRole;
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        !ROLES.includes(role)) {
      throw new ValidationError('Valid email and project role are required');
    }
    const repo = new InviteRepository();
    const invite = await withTransaction(db => createInvite(repo, db, {
      tenantId: auth.tenantId, actorId: auth.userId,
      projectId: parseUuid(requiredString(body, 'projectId'), 'projectId'),
      companyId: parseUuid(requiredString(body, 'companyId'), 'companyId'),
      email, role,
    }));
    return NextResponse.json({ invite: publicInvite(invite, new Date()),
      deliveryStatus: 'PENDING' },
      { status: 201, headers: NO_STORE });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    const body = await bodyObject(req);
    const repo = new InviteRepository();
    await withTransaction(db => cancelInvite(repo, db, {
      tenantId: auth.tenantId, actorId: auth.userId,
      projectId: parseUuid(requiredString(body, 'projectId'), 'projectId'),
      inviteId: parseUuid(requiredString(body, 'inviteId'), 'inviteId'),
    }));
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await bodyObject(req);
    const token = parseUuid(requiredString(body, 'token'), 'token');
    const cookie = req.cookies.get(COOKIE_NAME)?.value;
    const auth = cookie ? await requireAuth(req) : null;
    let name: string | undefined;
    let password: string | undefined;
    if (!auth) {
      name = requiredString(body, 'name').trim();
      password = requiredString(body, 'password');
      if (!name || name.length > 200 || password.length < 8 ||
          Buffer.byteLength(password, 'utf8') > 72) {
        throw new ValidationError('Valid name and password (8–72 bytes) are required');
      }
    }
    const result = await withTransaction(db => acceptInvite(
      new InviteRepository(), new UserRepository(), db,
      { token, authenticatedUserId: auth?.userId, name, password },
    ));
    if (result.status === 'EXPIRED') throw new ConflictError('Invite expired; request a new one');
    return NextResponse.json({ success: true, userId: result.userId }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error);
  }
}
