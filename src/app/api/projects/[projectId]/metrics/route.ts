import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api-error';
import { pool } from '@/lib/db';
import { resolveProjectInsightRole } from '@/lib/project-insight-auth';
import { resolveVisibility } from '@/lib/resolve-visibility';
import { getAmeliaMetrics } from '@/modules/reporting/application/amelia-metrics';
import { AmeliaMetricsReader } from '@/modules/reporting/infrastructure/amelia-metrics.reader';
import { ForbiddenError, ValidationError } from '@/shared/errors';
import { parseMetricsQuery } from '@/lib/metrics-query';
import { canAnalyzeSurveyPersonnel } from '@/modules/reporting/application/metrics-filters';
import type { UUID } from '@/shared/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const auth = requireAuth(req);
    const { projectId } = await params;
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(projectId)) throw new ValidationError('Invalid project');
    const projectUuid = projectId as UUID;
    const search = new URLSearchParams(req.nextUrl.searchParams);
    if (search.getAll('view').length > 1 || (search.has('view') && search.get('view') !== 'charts')) throw new ValidationError('Invalid metrics view');
    const includeCharts = search.get('view') === 'charts';
    search.delete('view');
    const filters = parseMetricsQuery(search);
    const role = await resolveProjectInsightRole(auth, projectUuid);
    if (role === 'BILLING_VIEWER') throw new ForbiddenError('Billing access does not grant request analytics');
    // Tenant administrators retain read-only project health, not workflow authority.
    const visibility = await resolveVisibility(pool, auth.tenantId, projectUuid, auth.userId, role === 'TENANT_ADMIN' ? 'VIEWER' : role);
    return NextResponse.json({ metrics: await getAmeliaMetrics(new AmeliaMetricsReader(), pool, {
      tenantId: auth.tenantId, projectId: projectUuid, visibility, filters, includeCharts,
    }), analytics: { filters, personnelFilters: canAnalyzeSurveyPersonnel(visibility.actorRole), dateTimezone: 'UTC' } }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
