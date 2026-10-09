import {observeProjectRoute} from '@/lib/observe-project-route';
import type { NextRequest } from 'next/server';
import {
  handleGetDepartmentTitles,
  handlePostDepartmentTitles,
} from './handler';

export const dynamic = 'force-dynamic';

async function observedPOST(
  req: NextRequest,
  ctx: { params: Promise<{ projectId: string; departmentId: string }> },
) {
  return handlePostDepartmentTitles(req, ctx);
}

async function observedGET(
  req: NextRequest,
  ctx: { params: Promise<{ projectId: string; departmentId: string }> },
) {
  return handleGetDepartmentTitles(req, ctx);
}

export const POST=observeProjectRoute(observedPOST);
export const GET=observeProjectRoute(observedGET);
