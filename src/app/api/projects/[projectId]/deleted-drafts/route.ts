import { NextResponse, type NextRequest } from 'next/server';
import { requireActiveAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api-error';
import { withTransaction } from '@/lib/with-transaction';
import { requireResourceUuid } from '@/lib/resource-uuid';
import { lockDraftActor } from '@/modules/ticket/application/draft-access';
import { readDeletedDrafts } from '@/modules/ticket/application/read-deleted-drafts';
import { ValidationError } from '@/shared/errors';
import type { UUID } from '@/shared/types';

export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const auth = await requireActiveAuth(req);
    const { projectId } = await params;
    requireResourceUuid(projectId, 'projectId');
    const query = new URL(req.url).searchParams;
    const limit = Number(query.get('limit') ?? '20'), offset = Number(query.get('offset') ?? '0');
    if (query.getAll('limit').length > 1 || query.getAll('offset').length > 1 ||
        !Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0) {
      throw new ValidationError('Use a page size from 1 to 100 and a nonnegative offset');
    }
    const result = await withTransaction(async db => {
      const scope = { tenantId: auth.tenantId, projectId: projectId as UUID,
        actorId: auth.userId, sessionVersion: auth.sessionVersion };
      await lockDraftActor(db, scope, 'PROJECT_ADMIN', false);
      return readDeletedDrafts(db, { ...scope, limit, offset });
    });
    return NextResponse.json(result);
  } catch (error) { return errorResponse(error); }
}
