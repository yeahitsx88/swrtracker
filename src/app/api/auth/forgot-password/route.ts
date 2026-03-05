import type { NextRequest } from 'next/server';
import { handlePostForgotPassword } from './handler';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  return handlePostForgotPassword(req);
}
