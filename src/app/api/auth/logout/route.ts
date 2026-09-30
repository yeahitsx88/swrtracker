import { type NextRequest } from 'next/server';
import { handlePostLogout } from './handler';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  return handlePostLogout(req);
}
