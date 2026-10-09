import {observeProjectRoute} from '@/lib/observe-project-route';
import type { NextRequest } from 'next/server';
import {
  handleDeleteAorAssignments,
  handlePostAorAssignments,
} from './handler';

export const dynamic = 'force-dynamic';

async function observedPOST(
  req: NextRequest,
  ctx: { params: Promise<{ projectId: string }> },
) {
  return handlePostAorAssignments(req, ctx);
}

async function observedDELETE(
  req: NextRequest,
  ctx: { params: Promise<{ projectId: string }> },
) {
  return handleDeleteAorAssignments(req, ctx);
}

export const POST=observeProjectRoute(observedPOST);
export const DELETE=observeProjectRoute(observedDELETE);
