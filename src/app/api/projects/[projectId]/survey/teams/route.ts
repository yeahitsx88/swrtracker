import {observeProjectRoute} from '@/lib/observe-project-route';
import type { NextRequest } from 'next/server';
import { handleGetSurveyTeams, handlePostSurveyTeam, handleDeleteSurveyTeam, handlePatchSurveyRole, handleGetRoleWork } from './handler';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ projectId: string }> };
async function observedGET(req: NextRequest, ctx: Context) {
  // Decision 57 / D8: open work a role change would affect.
  return req.nextUrl.searchParams.get('mode') === 'role-work' ? handleGetRoleWork(req, ctx) : handleGetSurveyTeams(req, ctx);
}
async function observedPOST(req: NextRequest, ctx: Context) { return handlePostSurveyTeam(req, ctx); }
async function observedDELETE(req: NextRequest, ctx: Context) { return handleDeleteSurveyTeam(req, ctx); }
async function observedPATCH(req: NextRequest, ctx: Context) { return handlePatchSurveyRole(req, ctx); }

export const GET=observeProjectRoute(observedGET);
export const POST=observeProjectRoute(observedPOST);
export const DELETE=observeProjectRoute(observedDELETE);
export const PATCH=observeProjectRoute(observedPATCH);
