import type { NextRequest } from 'next/server';
import { handleGetSurveyStaffing, handlePostSurveyStaffing } from './handler';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ projectId: string }> }) {
  return handleGetSurveyStaffing(req, ctx);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ projectId: string }> }) {
  return handlePostSurveyStaffing(req, ctx);
}
