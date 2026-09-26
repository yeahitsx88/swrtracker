import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { errorResponse } from '@/lib/api-error';
import { parseUuid } from '@/lib/parse-uuid';
import { ValidationError } from '@/shared/errors';
import { getOperationalReport, getDailyTicketActivity, reportDimensions, type ReportDimension } from '@/modules/ticket/application';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { getProjectReport, getDailySummary } from '@/modules/reporting/application';

export const dynamic='force-dynamic';
export async function GET(req:NextRequest,{params}:{params:Promise<{projectId:string}>}) {
  try{
    const auth=await requireAuth(req);
    const projectId=parseUuid((await params).projectId,'projectId');
    const search=new URL(req.url).searchParams;
    const view=search.get('view')??'current';
    if(view==='daily'){
      if(['dimension','limit','offset'].some(key=>search.has(key)))throw new ValidationError('Daily summaries do not accept grouping or pagination');
      const from=search.get('from'),until=search.get('until');
      if(!from||!until)throw new ValidationError('Daily summary requires from and until boundaries');
      const summary=await getDailySummary({read:(db,query)=>getDailyTicketActivity(new TicketRepository(),db,query)},pool,
        {...auth,projectId,from,until});
      return NextResponse.json(summary,{headers:{'Cache-Control':'no-store'}});
    }
    if(view!=='current')throw new ValidationError('Unknown report view');
    if(search.has('from')||search.has('until'))throw new ValidationError('Date boundaries require the daily report view');
    const dimension=search.get('dimension')??'project';
    if(!reportDimensions.includes(dimension as ReportDimension))throw new ValidationError('Unknown report dimension');
    const report=await getProjectReport({read:(db,query)=>getOperationalReport(new TicketRepository(),db,query)},pool,
      {...auth,projectId,dimension:dimension as ReportDimension,
        limit:Number(search.get('limit')??'20'),offset:Number(search.get('offset')??'0')});
    return NextResponse.json(report,{headers:{'Cache-Control':'no-store'}});
  }catch(error){return errorResponse(error);}
}
