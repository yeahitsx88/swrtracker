import {observeProjectRoute} from '@/lib/observe-project-route';
import { type NextRequest } from 'next/server';
import {
  handleGetProjectRequestConfig,
  handlePatchProjectRequestConfig,
} from './handler';

export const dynamic = 'force-dynamic';

async function observedGET(
  req: NextRequest,
  ctx: { params: Promise<{ projectId: string }> },
) {
  return handleGetProjectRequestConfig(req, ctx);
}

async function observedPATCH(
  req: NextRequest,
  ctx: { params: Promise<{ projectId: string }> },
) {
  return handlePatchProjectRequestConfig(req, ctx);
}


export const GET=observeProjectRoute(observedGET);
export const PATCH=observeProjectRoute(observedPATCH);
