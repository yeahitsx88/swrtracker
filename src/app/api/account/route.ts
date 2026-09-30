import { NextResponse, type NextRequest } from 'next/server';
import { requireActiveAuth as requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { errorResponse } from '@/lib/api-error';
import { ValidationError } from '@/shared/errors';
import type { UUID } from '@/shared/types';
import { getMyAccount } from '@/modules/tenancy/application/my-account';
import { SqlMyAccountReader } from '@/modules/tenancy/infrastructure/my-account.reader';

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
