/** Tenant bootstrap is available only through controlled repository tooling. */
import { NextResponse, type NextRequest } from 'next/server';
export const dynamic = 'force-dynamic';
export async function POST(_req: NextRequest) {
  return NextResponse.json({error:'Not found'}, {status:404});
}