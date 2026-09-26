import type { DbClient, UUID } from '@/shared/types';
import { ForbiddenError, ValidationError } from '@/shared/errors';
import { getTenantRole } from '@/lib/get-tenant-role';
import { getProjectWorkflowRole } from '@/lib/get-project-workflow-role';
import { resolveVisibility } from '@/lib/resolve-visibility';
import type { TicketStatus } from '../domain/types';
import type { VisibilityScope } from './ports';

export const reportDimensions = ['project','area','craft','partyChief','instrumentMan'] as const;
export type ReportDimension = typeof reportDimensions[number];
export interface OperationalGroup {
  key:string|null; label:string|null; total:number;
  statuses:Partial<Record<TicketStatus,number>>;
}
export interface OperationalReportQuery {
  tenantId:UUID; projectId:UUID; userId:UUID;
  dimension:ReportDimension; limit:number; offset:number;
}
export interface OperationalReportPort {
  operationalGroups(db:DbClient,query:OperationalReportQuery,visibility:VisibilityScope):Promise<OperationalGroup[]>;
}

/** Current visible, non-draft requests; archived projects retain their reports. */
export async function getOperationalReport(repo:OperationalReportPort,db:DbClient,query:OperationalReportQuery) {
  if(!reportDimensions.includes(query.dimension) || !Number.isSafeInteger(query.limit) ||
    query.limit<1 || query.limit>100 || !Number.isSafeInteger(query.offset) || query.offset<0 || query.offset>100000) {
    throw new ValidationError('Invalid report dimension or pagination');
  }
  const tenantRole=await getTenantRole(db,query.tenantId,query.userId);
  const role=tenantRole==='TENANT_ADMIN' ? tenantRole
    : await getProjectWorkflowRole(db,query.tenantId,query.projectId,query.userId);
  if(role==='PROJECT_ADMIN')throw new ForbiddenError('Ticket visibility is required for operational reports');
  const visibility=await resolveVisibility(db,query.tenantId,query.projectId,query.userId,role);
  const rows=await repo.operationalGroups(db,{...query,limit:query.limit+1},visibility);
  return {dimension:query.dimension,groups:rows.slice(0,query.limit),hasMore:rows.length>query.limit};
}
