import type { DbClient } from '@/shared/types';
import { ValidationError } from '@/shared/errors';
import type { VisibilityScope } from './ports';
import { resolveReportVisibility, type OperationalReportQuery } from './operational-report';

import type { DailyReportEvent } from './daily-report-events';
export { dailyReportEvents, type DailyReportEvent } from './daily-report-events';
export interface DailyActivity { eventType:DailyReportEvent; requests:number; events:number }
export interface DailyReportQuery extends Pick<OperationalReportQuery,'tenantId'|'projectId'|'userId'> {
  from:string;until:string;
}
export interface DailyReportPort {
  dailyActivity(db:DbClient,query:DailyReportQuery,visibility:VisibilityScope):Promise<DailyActivity[]>;
}

/** Explicit boundaries accommodate 23/25-hour local dates at daylight-saving transitions. */
export async function getDailyTicketActivity(repo:DailyReportPort,db:DbClient,query:DailyReportQuery) {
  const valid=(value:string)=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString()===value;
  const duration=Date.parse(query.until)-Date.parse(query.from);
  if(!valid(query.from)||!valid(query.until)||duration<=0||duration>25*60*60*1000) {
    throw new ValidationError('Daily report requires valid UTC boundaries spanning at most 25 hours');
  }
  const visibility=await resolveReportVisibility(db,query);
  const activity=await repo.dailyActivity(db,query,visibility);
  return {projectId:query.projectId,from:query.from,until:query.until,activity};
}
