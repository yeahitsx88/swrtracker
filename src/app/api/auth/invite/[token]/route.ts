import type { NextRequest } from 'next/server';
import { handleGetInviteToken } from './handler';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  return handleGetInviteToken(req, ctx);
}
