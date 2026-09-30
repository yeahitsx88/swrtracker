import type { NextRequest } from 'next/server';
import { handlePostSurveyStaffing } from './handler';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: { params: Promise<{ projectId: string }> }) {
  return handlePostSurveyStaffing(req, ctx);
}
