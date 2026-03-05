import type { NextRequest } from 'next/server';
import {
  handleGetProjectTemplates,
  handlePostProjectTemplates,
} from './handler';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return handleGetProjectTemplates(req);
}

export async function POST(req: NextRequest) {
  return handlePostProjectTemplates(req);
}
