import {observeProjectRoute} from '@/lib/observe-project-route';
import type { NextRequest } from 'next/server';
import { handlePostProjectActivation } from './handler';

export const dynamic = 'force-dynamic';

async function observedPOST(
  req: NextRequest,
  ctx: { params: Promise<{ projectId: string }> },
) {
  return handlePostProjectActivation(req, ctx);
}

export const POST=observeProjectRoute(observedPOST);
