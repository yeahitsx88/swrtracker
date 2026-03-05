import type { NextRequest } from 'next/server';
import { handlePostLogin } from './handler';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  return handlePostLogin(req);
}
