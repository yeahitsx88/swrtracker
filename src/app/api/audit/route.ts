import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { errorResponse } from '@/lib/api-error';
import { parseUuid } from '@/lib/parse-uuid';
import { listAuditLog } from '@/modules/audit/application/audit-log';
import { AuditLogRepository } from '@/modules/audit/infrastructure/audit-log.repository';
import { openAuditCsv } from '@/modules/audit/infrastructure/audit-csv-stream';
import { ValidationError } from '@/shared/errors';
import { listAuditFilters } from '@/modules/audit/application/audit-filters';
import { AuditFiltersRepository } from '@/modules/audit/infrastructure/audit-filters.repository';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    const query = new URL(req.url).searchParams;
    const options = query.get('options');
    if (options !== null) {
      if (options !== 'projects' && options !== 'actors' && options !== 'events') throw new ValidationError('Unknown audit filter options');
      return NextResponse.json(await listAuditFilters(new AuditFiltersRepository(), pool, {
        ...auth, kind: options, search: query.get('search') ?? '',
        limit: Number(query.get('limit') ?? '20'), offset: Number(query.get('offset') ?? '0'),
      }), { headers: { 'Cache-Control': 'no-store' } });
    }
    const projectId = query.get('projectId'), actorId = query.get('actorId');
    const filters = {
      ...auth, projectId: projectId === null ? undefined : parseUuid(projectId, 'projectId'),
      actorId: actorId === null ? undefined : parseUuid(actorId, 'actorId'),
      eventType: query.get('eventType') ?? undefined,
      from: query.get('from') ?? undefined, until: query.get('until') ?? undefined,
    };
    const format = query.get('format') ?? 'json';
    if (format !== 'json' && format !== 'csv') throw new ValidationError('format must be json or csv');
    if (format === 'csv') {
      if (query.has('limit') || query.has('offset')) throw new ValidationError('CSV exports all matching events; omit pagination');
      return new Response(await openAuditCsv(pool, filters), { headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="audit-log.csv"',
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      } });
    }
    return NextResponse.json(await listAuditLog(new AuditLogRepository(), pool, {
      ...filters, limit: Number(query.get('limit') ?? '50'), offset: Number(query.get('offset') ?? '0'),
    }), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return errorResponse(error); }
}
