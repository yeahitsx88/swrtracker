import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { errorResponse } from '@/lib/api-error';
import { parseUuid } from '@/lib/parse-uuid';
import { ValidationError } from '@/shared/errors';
import { getOperationalReport, reportDimensions, type ReportDimension } from '@/modules/ticket/application';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { getProjectReport } from '@/modules/reporting/application';

export const dynamic='force-dynamic';
export async function GET(req:NextRequest,{params}:{params:Promise<{projectId:string}>}) {
  try{
    const auth=await requireAuth(req);
    const projectId=parseUuid((await params).projectId,'projectId');
    const search=new URL(req.url).searchParams;
    const dimension=search.get('dimension')??'project';
    if(!reportDimensions.includes(dimension as ReportDimension))throw new ValidationError('Unknown report dimension');
    const report=await getProjectReport({read:(db,query)=>getOperationalReport(new TicketRepository(),db,query)},pool,
      {...auth,projectId,dimension:dimension as ReportDimension,
        limit:Number(search.get('limit')??'20'),offset:Number(search.get('offset')??'0')});
    return NextResponse.json(report,{headers:{'Cache-Control':'no-store'}});
  }catch(error){return errorResponse(error);}
}
