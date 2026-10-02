import type { NextRequest } from 'next/server';
import { handleOffboarding } from './handler';
export const dynamic='force-dynamic';
type Context={params:Promise<{userId:string}>};
export async function GET(req:NextRequest,ctx:Context){return handleOffboarding(req,{kind:'TENANT_ACCOUNT'},(await ctx.params).userId);}
export async function POST(req:NextRequest,ctx:Context){return handleOffboarding(req,{kind:'TENANT_ACCOUNT'},(await ctx.params).userId);}
