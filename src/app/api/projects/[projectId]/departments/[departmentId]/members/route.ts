import {observeProjectRoute} from '@/lib/observe-project-route';
import type { NextRequest } from 'next/server';
import {
  handlePatchDepartmentMembers,
  handlePostDepartmentMembers,
} from './handler';

export const dynamic = 'force-dynamic';

async function observedPOST(
  req: NextRequest,
  ctx: { params: Promise<{ projectId: string; departmentId: string }> },
) {
  return handlePostDepartmentMembers(req, ctx);
}

async function observedPATCH(
  req: NextRequest,
  ctx: { params: Promise<{ projectId: string; departmentId: string }> },
) {
  return handlePatchDepartmentMembers(req, ctx);
}

export const POST=observeProjectRoute(observedPOST);
export const PATCH=observeProjectRoute(observedPATCH);
