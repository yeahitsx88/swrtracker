import {observeProjectRoute} from '@/lib/observe-project-route';
import type { NextRequest } from 'next/server';
import { handlePostSurveyStaffing } from './handler';

import {dispatchGetSurveyStaffing,dispatchPatchSurveyStaffing} from './dispatch';

export const dynamic = 'force-dynamic';

async function observedGET(req: NextRequest, ctx: { params: Promise<{ projectId: string }> }) {
  return dispatchGetSurveyStaffing(req, ctx);
}

async function observedPOST(req: NextRequest, ctx: { params: Promise<{ projectId: string }> }) {
  return handlePostSurveyStaffing(req, ctx);
}

async function observedPATCH(req: NextRequest, ctx: { params: Promise<{ projectId: string }> }) {
  return dispatchPatchSurveyStaffing(req, ctx);
}

export const GET=observeProjectRoute(observedGET);
export const POST=observeProjectRoute(observedPOST);
export const PATCH=observeProjectRoute(observedPATCH);
