import { NextResponse, type NextRequest } from 'next/server';
import { requireActiveAuth } from '@/lib/auth';
import { getTenantRole } from '@/lib/get-tenant-role';
import { pool } from '@/lib/db';
import { errorResponse } from '@/lib/api-error';
import { ForbiddenError, ValidationError } from '@/shared/errors';
import { auditLogCsv, parseAuditLogFilters, readTenantAuditLog } from '@/modules/audit/application/tenant-audit-log';

export const dynamic = 'force-dynamic';
const PAGE = 50;
const EXPORT_LIMIT = 5000;

/** GET /api/audit-log — Tenant Admin only. ?format=csv exports up to 5000 matching rows. */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireActiveAuth(req);
    if (await getTenantRole(pool, auth.tenantId, auth.userId, auth.sessionVersion) !== 'TENANT_ADMIN') {
      throw new ForbiddenError('The audit log is available to Tenant Admin.');
    }
    const search = req.nextUrl.searchParams;
    const filters = parseAuditLogFilters(search);
    if (search.get('format') === 'csv') {
      const page = await readTenantAuditLog(pool, auth.tenantId, filters, EXPORT_LIMIT, 0);
      return new NextResponse(auditLogCsv(page.rows), { headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`,
        'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
        ...(page.hasMore ? { 'X-Audit-Truncated': 'true' } : {}),
      } });
    }
    const raw = search.get('offset') ?? '0';
    if (!/^\d+$/.test(raw)) throw new ValidationError('Choose a valid page.');
    return NextResponse.json(await readTenantAuditLog(pool, auth.tenantId, filters, PAGE, Number(raw)), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return errorResponse(error); }
}
