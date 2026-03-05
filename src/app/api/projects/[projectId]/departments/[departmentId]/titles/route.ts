import type { NextRequest } from 'next/server';
import {
  handleGetDepartmentTitles,
  handlePostDepartmentTitles,
} from './handler';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ projectId: string; departmentId: string }> },
) {
  return handlePostDepartmentTitles(req, ctx);
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ projectId: string; departmentId: string }> },
) {
  return handleGetDepartmentTitles(req, ctx);
}
