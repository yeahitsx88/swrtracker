import { type NextRequest } from 'next/server';
import {
  handleGetProjectRequestConfig,
  handlePatchProjectRequestConfig,
} from './handler';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ projectId: string }> },
) {
  return handleGetProjectRequestConfig(req, ctx);
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ projectId: string }> },
) {
  return handlePatchProjectRequestConfig(req, ctx);
}

