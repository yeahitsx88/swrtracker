import type { NextRequest } from 'next/server';
import { handleGetOpsDiagnostics } from './handler';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return handleGetOpsDiagnostics(req);
}
