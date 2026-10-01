import type { NextRequest } from 'next/server';
import { handlePostSurveyStaffing } from './handler';

import {dispatchGetSurveyStaffing,dispatchPatchSurveyStaffing} from './dispatch';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ projectId: string }> }) {
  return dispatchGetSurveyStaffing(req, ctx);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ projectId: string }> }) {
  return handlePostSurveyStaffing(req, ctx);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ projectId: string }> }) {
  return dispatchPatchSurveyStaffing(req, ctx);
}
