import {observeProjectRoute} from '@/lib/observe-project-route';
import type { NextRequest } from 'next/server';
import {
  handleGetDepartments,
  handlePostDepartments,
} from './handler';

export const dynamic = 'force-dynamic';

async function observedPOST(
  req: NextRequest,
  ctx: { params: Promise<{ projectId: string }> },
) {
  return handlePostDepartments(req, ctx);
}

async function observedGET(
  req: NextRequest,
  ctx: { params: Promise<{ projectId: string }> },
) {
  return handleGetDepartments(req, ctx);
}

export const POST=observeProjectRoute(observedPOST);
export const GET=observeProjectRoute(observedGET);
