import type { DbClient, UUID } from '@/shared/types';
import type { VisibilityScope } from '@/modules/ticket/application/ports';
import type { TicketStatus } from '@/modules/ticket/domain/types';
import { ForbiddenError } from '@/shared/errors';
import { canAnalyzeSurveyPersonnel, type MetricsFilters } from './metrics-filters';

export interface MetricBucket {
  key: string; label: string; count: number;
  cycleHours: number | null; cycleSamples: number;
}
export interface MetricsCharts {
  areas: MetricBucket[]; types: MetricBucket[]; statuses: MetricBucket[];
  crews: MetricBucket[]; instrumentMen: MetricBucket[]; months: MetricBucket[];
  cells: Array<MetricBucket & { status: string }>;
  facets: { areas: Array<{ key: string; label: string }>; crews: Array<{ key: string; label: string }>; instrumentMen: Array<{ key: string; label: string }> };
  limits: { groups: number; months: number; truncated: boolean };
}

export interface AmeliaMetrics {
  openTotal: number;
  openByAreaStatus: Array<{ areaId: UUID; areaName: string; status: TicketStatus; count: number }>;
  approvedWithoutInstrumentMan: number;
  overdueNeedBy: number;
  completedTotal: number;
  averageSubmissionToCompletionHours: number | null;
  total?: number;
  populationTotal?: number;
  coverage?: { imported: number; syntheticCompletions: number; cycleSamples: number; missingCycleDates: number; invalidCycleDates: number; undated: number };
  charts?: MetricsCharts;
}

export interface MetricsScope {
  tenantId: UUID;
  projectId: UUID;
  visibility: VisibilityScope;
  today?: string;
  filters?: MetricsFilters;
  includeCharts?: boolean;
}

export interface MetricsReader {
  read(db: DbClient, scope: MetricsScope): Promise<AmeliaMetrics>;
}

export async function getAmeliaMetrics(reader: MetricsReader, db: DbClient, scope: MetricsScope): Promise<AmeliaMetrics> {
  if (scope.visibility.actorRole === 'PROJECT_ADMIN') {
    throw new ForbiddenError('Project configuration does not grant request analytics access');
  }
  if (scope.visibility.projectId !== scope.projectId) {
    throw new ForbiddenError('Analytics scope must be resolved for this project');
  }
  if ((scope.filters?.crewId || scope.filters?.instrumentManId) && !canAnalyzeSurveyPersonnel(scope.visibility.actorRole)) {
    throw new ForbiddenError('Personnel analytics filters require survey supervisory authority');
  }
  return reader.read(db, scope);
}
