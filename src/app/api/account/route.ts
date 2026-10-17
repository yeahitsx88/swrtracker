import { NextResponse, type NextRequest } from 'next/server';
import { requireActiveAuth as requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { errorResponse } from '@/lib/api-error';
import { ValidationError } from '@/shared/errors';
import type { UUID } from '@/shared/types';
import { getMyAccount } from '@/modules/tenancy/application/my-account';
import { SqlMyAccountReader } from '@/modules/tenancy/infrastructure/my-account.reader';
import { withTransaction } from '@/lib/with-transaction';
import { readJsonBody } from '@/lib/read-json-body';
import { executeIdempotentHttpMutation, requireIdempotencyKey } from '@/lib/idempotency';
import { changeOwnName } from '@/modules/identity/application/account-self-service';

export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    const ids = req.nextUrl.searchParams.getAll('projectId');
    if (ids.length > 1 || (ids[0] !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ids[0]))) {
      throw new ValidationError('Select a valid project.');
    }
    const account = await getMyAccount(new SqlMyAccountReader(), pool, auth, ids[0] as UUID | undefined);
    return NextResponse.json(account, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return errorResponse(error); }
}

/** PATCH /api/account — correct your own display name (own active account is the only authority). */
export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    const body = await readJsonBody(req);
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'name')) throw new ValidationError('Send only your name.');
    const command = { name: (body as { name?: unknown }).name };
    const key = requireIdempotencyKey(req);
    const response = await withTransaction(db => executeIdempotentHttpMutation(db,
      { tenantId: auth.tenantId, actorId: auth.userId, endpoint: '/api/account:name', idempotencyKey: key }, command,
      async () => ({ status: 200, body: await changeOwnName(db, auth, command.name) })),
    { req, auth, mode: 'SHARED', authorize: async () => undefined });
    return NextResponse.json(response.body, { status: response.status, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return errorResponse(error); }
}
