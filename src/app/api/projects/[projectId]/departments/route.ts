import type { NextRequest } from 'next/server';
import {
  handleGetDepartments,
  handlePostDepartments,
} from './handler';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ projectId: string }> },
) {
  return handlePostDepartments(req, ctx);
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ projectId: string }> },
) {
  return handleGetDepartments(req, ctx);
}
