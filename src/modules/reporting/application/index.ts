/**
 * Reporting application layer — aggregated queries, daily summaries.
 * Do not import from infrastructure here.
 */

export { getProjectReport } from './project-report';
export type { ProjectReportSource } from './project-report';
export { getDailySummary } from './daily-summary';
export type { DailySummarySource } from './daily-summary';
