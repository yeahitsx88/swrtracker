/**
 * POST /api/projects/[projectId]/areas
 */
import { NextResponse, type NextRequest } from 'next/server';
import { ConflictError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  _ctx: { params: Promise<{ projectId: string }> },
) {
  try {
    throw new ConflictError('Legacy area setup writes are retired; use the AOR setup surface');
  } catch (err) {
    return errorResponse(err);
  }
}
