import type { NextRequest } from 'next/server';
import { handlePostResetPassword } from './handler';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  return handlePostResetPassword(req);
}
