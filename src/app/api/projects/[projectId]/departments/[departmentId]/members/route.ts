import type { NextRequest } from 'next/server';
import {
  handlePatchDepartmentMembers,
  handlePostDepartmentMembers,
} from './handler';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ projectId: string; departmentId: string }> },
) {
  return handlePostDepartmentMembers(req, ctx);
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ projectId: string; departmentId: string }> },
) {
  return handlePatchDepartmentMembers(req, ctx);
}
