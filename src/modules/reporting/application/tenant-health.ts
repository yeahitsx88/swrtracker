import { requireTenantAdmin } from '@/lib/get-tenant-role';
import { ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ContinuityHealth } from '@/modules/tenancy/application/continuity-health';

export interface ProjectHealth {
  id: UUID; name: string; status: 'SETUP' | 'ACTIVE' | 'ARCHIVED';
  crewBuild: 'FULL' | 'MEDIUM' | 'SLIM'; createdAt: Date; activatedAt: Date | null;
  tickets: { created:number; submitted:number; approved:number; assignedInProgress:number;
    pendingApproval:number; delayed:number; canceled:number } | null;
  stale: { submitted:number; approved:number; pendingApproval:number } | null;
  activeHelpFlags: number | null;
}
export interface TenantHealthQuery { tenantId:UUID;userId:UUID;limit:number;offset:number }
export interface TenantHealthPort {
  list(db:DbClient,query:TenantHealthQuery,now:Date):Promise<ProjectHealth[]>;
  names(db:DbClient,tenantId:UUID,userIds:UUID[]):Promise<Array<{id:UUID;name:string}>>;
}
export interface HealthContinuityPort {
  read(db:DbClient,tenantId:UUID,projectId:UUID,now:Date):Promise<ContinuityHealth>;
}

export async function getTenantHealth(repo:TenantHealthPort,continuity:HealthContinuityPort,
  db:DbClient,query:TenantHealthQuery,now=new Date()) {
  await requireTenantAdmin(db,query.tenantId,query.userId);
  if(!Number.isSafeInteger(query.limit)||query.limit<1||query.limit>50||
    !Number.isSafeInteger(query.offset)||query.offset<0||query.offset>100000) {
    throw new ValidationError('Invalid pagination');
  }
  const rows=await repo.list(db,{...query,limit:query.limit+1},now);
  const projects=[];
  for(const project of rows.slice(0,query.limit)) {
    const health=project.status==='ACTIVE'
      ? await continuity.read(db,query.tenantId,project.id,now) : null;
    const userIds=health ? [...new Set([...health.activeGrants,...health.crewVacancies].map(item=>item.userId))] : [];
    const names=new Map((userIds.length ? await repo.names(db,query.tenantId,userIds) : []).map(user=>[user.id,user.name]));
    projects.push({...project,continuity:health && {
      activeGrants:health.activeGrants.map(grant=>({...grant,userName:names.get(grant.userId) ?? null})),
      crewVacancies:health.crewVacancies.map(vacancy=>({...vacancy,userName:names.get(vacancy.userId) ?? null})),
    }});
  }
  return {projects,hasMore:rows.length>query.limit,asOf:now};
}
