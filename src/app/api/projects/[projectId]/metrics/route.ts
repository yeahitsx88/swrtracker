import { NextResponse, type NextRequest } from 'next/server';
import { requireActiveAuth as requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api-error';
import { pool } from '@/lib/db';
import { resolveProjectInsightRole } from '@/lib/project-insight-auth';
import { resolveVisibility } from '@/lib/resolve-visibility';
import { getAmeliaMetrics } from '@/modules/reporting/application/amelia-metrics';
import { AmeliaMetricsReader } from '@/modules/reporting/infrastructure/amelia-metrics.reader';
import { ForbiddenError, ValidationError } from '@/shared/errors';
import { parseMetricsQuery } from '@/lib/metrics-query';
import { canAnalyzeSurveyPersonnel } from '@/modules/reporting/application/metrics-filters';
import { getCommandActivity } from '@/modules/reporting/application/command-activity';
import { PostgresCommandActivityReader } from '@/modules/reporting/infrastructure/command-activity.reader';
import type { UUID } from '@/shared/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const auth = await requireAuth(req);
    const { projectId } = await params;
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(projectId)) throw new ValidationError('Invalid project');
    const projectUuid = projectId as UUID;
    const search = new URLSearchParams(req.nextUrl.searchParams);
    if (search.getAll('view').length > 1 || (search.has('view') && !['charts', 'activity'].includes(search.get('view') ?? ''))) throw new ValidationError('Invalid metrics view');
    const view = search.get('view');
    const includeCharts = view === 'charts';
    search.delete('view');
    if (view === 'activity' && (search.has('population') || search.has('dateBasis'))) throw new ValidationError('Activity uses event dates across all request statuses');
    const filters = parseMetricsQuery(search);
    const role = await resolveProjectInsightRole(auth, projectUuid);
    if (role === 'BILLING_VIEWER') throw new ForbiddenError('Billing access does not grant request analytics');
    // Tenant administrators retain read-only project health, not workflow authority.
    const visibility = await resolveVisibility(pool, auth.tenantId, projectUuid, auth.userId, role === 'TENANT_ADMIN' ? 'VIEWER' : role);
    if (view === 'activity') {
      const activity = await getCommandActivity(new PostgresCommandActivityReader(), pool, {
        tenantId: auth.tenantId, projectId: projectUuid, visibility, filters,
      });
      return NextResponse.json({ activity }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    return NextResponse.json({ metrics: await getAmeliaMetrics(new AmeliaMetricsReader(), pool, {
      tenantId: auth.tenantId, projectId: projectUuid, visibility, filters, includeCharts,
    }), analytics: { filters, personnelFilters: canAnalyzeSurveyPersonnel(visibility.actorRole), dateTimezone: 'UTC' } }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
