import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

// Never statically render — DATABASE_URL is only available at runtime.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await pool.query('SELECT 1');
    return NextResponse.json({ status: 'ok', db: 'connected' });
  } catch {
    return NextResponse.json({ status: 'error', db: 'unreachable' }, { status: 503 });
  }
}
