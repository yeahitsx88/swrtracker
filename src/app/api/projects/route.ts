import type { NextRequest } from 'next/server';
import { handleGetProjects } from './get-handler';
import { handlePostProject } from './post-handler';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){return handleGetProjects(req);}
export async function POST(req:NextRequest){return handlePostProject(req);}
