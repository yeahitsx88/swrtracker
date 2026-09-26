import type { DbClient } from '@/shared/types';
import { dailyReportEvents, type DailyActivity, type DailyReportEvent, type DailyReportQuery } from '@/modules/ticket/application';

export interface DailySummarySource {
  read(db:DbClient,query:DailyReportQuery):Promise<{projectId:DailyReportQuery['projectId'];from:string;until:string;activity:DailyActivity[]}>;
}
const labels:Record<DailyReportEvent,string>={
  'ticket.created':'Direct requests created',
  'ticket.submitted':'Requests submitted',
  'ticket.approved':'Requests approved',
  'ticket.rejected':'Requests not approved',
  'ticket.rejection_overridden':'Rejections overridden',
  'ticket.assigned':'Crew assignments',
  'ticket.in_progress':'Work started',
  'ticket.pending_pc_approval':'Field reports submitted for review',
  'ticket.completed':'Requests completed',
  'ticket.delayed':'Delays approved',
  'ticket.delay_restarted':'Delayed work restarted',
  'ticket.requester_canceled':'Requests canceled by requester',
  'ticket.field_canceled':'Requests canceled for field conditions',
  'ticket.survey_canceled':'Requests canceled by survey team',
};

export async function getDailySummary(source:DailySummarySource,db:DbClient,query:DailyReportQuery,now=new Date()) {
  const result=await source.read(db,query);
  const counts=new Map(result.activity.map(item=>[item.eventType,item]));
  const activity=dailyReportEvents.map(eventType=>({eventType,label:labels[eventType],
    requests:counts.get(eventType)?.requests??0,events:counts.get(eventType)?.events??0}));
  return {view:'daily' as const,projectId:result.projectId,from:result.from,until:result.until,
    asOf:now,totalEvents:activity.reduce((total,item)=>total+item.events,0),activity};
}
