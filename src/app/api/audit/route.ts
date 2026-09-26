import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { errorResponse } from '@/lib/api-error';
import { parseUuid } from '@/lib/parse-uuid';
import { listAuditLog } from '@/modules/audit/application/audit-log';
import { AuditLogRepository } from '@/modules/audit/infrastructure/audit-log.repository';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    const query = new URL(req.url).searchParams;
    const projectId = query.get('projectId'), actorId = query.get('actorId');
    return NextResponse.json(await listAuditLog(new AuditLogRepository(), pool, {
      ...auth, projectId: projectId === null ? undefined : parseUuid(projectId, 'projectId'),
      actorId: actorId === null ? undefined : parseUuid(actorId, 'actorId'),
      eventType: query.get('eventType') ?? undefined,
      from: query.get('from') ?? undefined, until: query.get('until') ?? undefined,
      limit: Number(query.get('limit') ?? '50'), offset: Number(query.get('offset') ?? '0'),
    }), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return errorResponse(error); }
}
