import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { logError, logInfo } from '@/lib/observability';

// Never statically render — DATABASE_URL is only available at runtime.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await pool.query('SELECT 1');
    logInfo('Health check succeeded', {
      eventType: 'system.health.ok',
      tenantId: null,
      ticketId: null,
      actorId: null,
    });
    return NextResponse.json({ status: 'ok', db: 'connected' });
  } catch (err) {
    logError('Health check failed', {
      eventType: 'system.health.failed',
      tenantId: null,
      ticketId: null,
      actorId: null,
    }, err);
    return NextResponse.json({ status: 'error', db: 'unreachable' }, { status: 503 });
  }
}
