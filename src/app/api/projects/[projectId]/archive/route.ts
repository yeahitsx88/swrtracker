import {observeProjectRoute} from '@/lib/observe-project-route';
import type { NextRequest } from 'next/server';
import { handlePostProjectArchive } from './handler';

export const dynamic = 'force-dynamic';

async function observedPOST(
  req: NextRequest,
  ctx: { params: Promise<{ projectId: string }> },
) {
  return handlePostProjectArchive(req, ctx);
}

export const POST=observeProjectRoute(observedPOST);
