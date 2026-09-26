import type { DbClient } from '@/shared/types';
import type { OperationalGroup, OperationalReportQuery, ReportDimension } from '@/modules/ticket/application';

export interface ProjectReportSource {
  read(db:DbClient,query:OperationalReportQuery):Promise<{
    dimension:ReportDimension;groups:OperationalGroup[];hasMore:boolean;
  }>;
}

/** The Ticket application owns authorization and scoped aggregation. */
export async function getProjectReport(source:ProjectReportSource,db:DbClient,
  query:OperationalReportQuery,now=new Date()) {
  const page=await source.read(db,query);
  return {projectId:query.projectId,dimension:page.dimension,asOf:now,
    limit:query.limit,offset:query.offset,hasMore:page.hasMore,
    groups:page.groups.map(group=>{
      const count=(status:keyof OperationalGroup['statuses'])=>group.statuses[status]??0;
      const completed=count('COMPLETED');
      const canceled=count('REQUESTER_CANCELED')+count('FIELD_CANCELED')+count('SURVEY_CANCELED');
      return {...group,counts:{total:group.total,open:group.total-completed-canceled,
        closed:completed+canceled,completed,canceled,notApproved:count('REJECTED'),
        workload:count('ASSIGNED')+count('IN_PROGRESS')+count('PENDING_PC_APPROVAL')+count('DELAYED')}};
    }),
  };
}
