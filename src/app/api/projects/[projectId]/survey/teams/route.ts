import type { NextRequest } from 'next/server';
import { handleGetSurveyTeams, handlePostSurveyTeam, handleDeleteSurveyTeam } from './handler';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ projectId: string }> };
export async function GET(req: NextRequest, ctx: Context) { return handleGetSurveyTeams(req, ctx); }
export async function POST(req: NextRequest, ctx: Context) { return handlePostSurveyTeam(req, ctx); }
export async function DELETE(req: NextRequest, ctx: Context) { return handleDeleteSurveyTeam(req, ctx); }
