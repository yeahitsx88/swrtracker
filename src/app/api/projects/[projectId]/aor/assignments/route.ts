import type { NextRequest } from 'next/server';
import {
  handleDeleteAorAssignments,
  handlePostAorAssignments,
} from './handler';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ projectId: string }> },
) {
  return handlePostAorAssignments(req, ctx);
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ projectId: string }> },
) {
  return handleDeleteAorAssignments(req, ctx);
}
