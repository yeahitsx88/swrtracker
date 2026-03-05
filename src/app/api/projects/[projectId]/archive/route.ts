import type { NextRequest } from 'next/server';
import { handlePostProjectArchive } from './handler';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ projectId: string }> },
) {
  return handlePostProjectArchive(req, ctx);
}
