import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse } from '@/lib/api-error';
import { requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { parseUuid } from '@/lib/parse-uuid';
import { getRequestOptions } from '@/modules/tenancy/application/request-options';
import { RequestOptionsRepository } from
  '@/modules/tenancy/infrastructure/request-options.repository';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const auth = await requireAuth(req);
    const projectId = parseUuid((await params).projectId, 'projectId');
    const options = await getRequestOptions(new RequestOptionsRepository(), pool, {
      tenantId: auth.tenantId, projectId, requesterId: auth.userId,
    });
    return NextResponse.json(options);
  } catch (error) {
    return errorResponse(error);
  }
}
