import type { DbClient, UUID } from '@/shared/types';
import type { VisibilityScope } from '@/modules/ticket/application/ports';
import { ForbiddenError, ValidationError } from '@/shared/errors';
import type { MetricsFilters } from './metrics-filters';

export interface CommandActivity {
  from: string;
  to: string;
  timezone: 'UTC';
  days: Array<{ date: string; submitted: number; recordedCompletions: number }>;
  excludedSyntheticCompletions: number;
}

export interface CommandActivityScope {
  tenantId: UUID;
  projectId: UUID;
  visibility: VisibilityScope;
  filters?: MetricsFilters;
  today?: string;
}

export interface CommandActivityReader {
  read(db: DbClient, scope: CommandActivityScope, from: string, to: string): Promise<CommandActivity>;
}

/** Event-date flow is separate from the current-state backlog population. */
export async function getCommandActivity(reader: CommandActivityReader, db: DbClient, scope: CommandActivityScope): Promise<CommandActivity> {
  if (scope.visibility.projectId !== scope.projectId || scope.visibility.actorRole !== 'SURVEY_MANAGER') {
    throw new ForbiddenError('Survey command activity requires project Survey Manager authority');
  }
  if (scope.filters?.population && scope.filters.population !== 'all' ||
      scope.filters?.dateBasis && scope.filters.dateBasis !== 'needBy') {
    throw new ValidationError('Activity counts use event dates across all request statuses');
  }
  const to = scope.filters?.dateTo ?? scope.today ?? new Date().toISOString().slice(0, 10);
  const toTime = Date.parse(`${to}T00:00:00Z`);
  const from = scope.filters?.dateFrom ?? new Date(toTime - 29 * 86_400_000).toISOString().slice(0, 10);
  const span = (toTime - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  if (!Number.isInteger(span) || span < 0 || span >= 90) {
    throw new ValidationError('Activity date range must contain 1 to 90 days');
  }
  return reader.read(db, scope, from, to);
}
