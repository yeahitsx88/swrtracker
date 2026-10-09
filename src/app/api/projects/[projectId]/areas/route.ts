import {observeProjectRoute} from '@/lib/observe-project-route';
/**
 * POST /api/projects/[projectId]/areas
 */
import { type NextRequest } from 'next/server';
import { ConflictError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

async function observedPOST(
  _req: NextRequest,
  _ctx: { params: Promise<{ projectId: string }> },
) {
  try {
    throw new ConflictError('Legacy area setup writes are retired; use the AOR setup surface');
  } catch (err) {
    return errorResponse(err);
  }
}

export const POST=observeProjectRoute(observedPOST);
