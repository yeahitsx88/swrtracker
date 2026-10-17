import type { ProjectCapabilities } from './contracts/account-offboarding';
import type { TicketListResponse, TicketStatus } from './contracts/tickets';
import type { TicketQueryFilters } from '@/modules/ticket/application/query-filters';
import type { AmeliaMetrics } from '@/modules/reporting/application/amelia-metrics';
import type { MetricsFilters } from '@/modules/reporting/application/metrics-filters';
import { apiClient } from './apiClient';

export interface HomeReader {
  listTickets(projectId: string, limit: number, offset: number, filters: TicketQueryFilters & { sort?: 'created' | 'operations' }): Promise<TicketListResponse>;
  getKpiCharts(projectId: string, filters: MetricsFilters): Promise<{ metrics: AmeliaMetrics }>;
}
export const HOME_STATUSES: TicketStatus[] = ['SUBMITTED', 'APPROVED', 'ASSIGNED', 'IN_PROGRESS', 'PENDING_FIELD_VALIDATION', 'RETURNED_FOR_CORRECTION', 'PENDING_PC_APPROVAL', 'DELAYED', 'COMPLETED', 'REJECTED', 'REQUESTER_CANCELED', 'FIELD_CANCELED', 'SURVEY_CANCELED'];
export function homeDateWindow(now: Date) {
  const today = now.toISOString().slice(0, 10);
  const end = new Date(`${today}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 3);
  return { today, through: end.toISOString().slice(0, 10) };
}

/** Compose existing bounded, server-scoped reads. No client-side visibility filtering or new analytics authority. */
export async function loadProjectHome(projectId: string, capabilities: ProjectCapabilities, now = new Date(), reader: HomeReader = apiClient) {
  const role = capabilities.operationalRole;
  if (!role || role === 'PROJECT_ADMIN' || capabilities.accessDisabled) throw new Error('An active operational membership is required to read request Home.');
  const requester = role === 'REQUESTER';
  const dates = homeDateWindow(now);
  const count = (filters: TicketQueryFilters) => reader.listTickets(projectId, 1, 0, filters).then(page => page.total);
  const mayReadMetrics = role === 'SURVEY_MANAGER' || !capabilities.canAdminister;
  const summary = mayReadMetrics ? reader.getKpiCharts(projectId, {}).then(value => value.metrics) : Promise.all(HOME_STATUSES.map(async status => ({key: status, label: status, count: await count({status}), cycleHours: null, cycleSamples: 0}))).then(statuses => ({ charts: { statuses }, total: statuses.reduce((total, row) => total + row.count, 0) }));
  const [recent, upcoming, open, awaiting, completed, overdue, inProgress, drafts, metrics] = await Promise.all([
    reader.listTickets(projectId, 5, 0, {queue: 'all'}),
    reader.listTickets(projectId, 5, 0, {queue: 'open', dateBasis: 'needBy', dateFrom: dates.today, dateTo: dates.through, sort: 'operations'}),
    count({queue: 'open'}),
    count(role === 'PARTY_CHIEF' ? {queue: 'pcApprovals'} : {status: 'SUBMITTED'}),
    count({queue: 'completed'}), count({queue: 'overdue'}), count({status: 'IN_PROGRESS'}),
    requester ? reader.listTickets(projectId, 3, 0, {status: 'DRAFT'}) : Promise.resolve(null),
    summary,
  ]);
  return { recent, upcoming, open, awaiting, completed, overdue, inProgress, drafts, metrics, dates };
}
export type ProjectHomeData = Awaited<ReturnType<typeof loadProjectHome>>;
