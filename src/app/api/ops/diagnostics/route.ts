import type { NextRequest } from 'next/server';
import { withRequestCorrelation } from '@/lib/correlation';
import { handleGetOpsDiagnostics } from './handler';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return withRequestCorrelation(req, async () => handleGetOpsDiagnostics(req));
}
