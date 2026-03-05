import type { NextRequest } from 'next/server';
import { handlePostProjectActivation } from './handler';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ projectId: string }> },
) {
  return handlePostProjectActivation(req, ctx);
}
