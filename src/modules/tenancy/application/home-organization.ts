import type {AuthContext} from '@/lib/auth';
import {getTenantRole} from '@/lib/get-tenant-role';
import type {DbClient,UUID} from '@/shared/types';
import {ConflictError,ForbiddenError,NotFoundError} from '@/shared/errors';
import {appendAdministrativeEvent} from '@/modules/audit/infrastructure/administrative-event.repository';

export async function authorizeHomeOrganization(db:DbClient,auth:AuthContext) {
 if(await getTenantRole(db,auth.tenantId,auth.userId,auth.sessionVersion)!=='TENANT_ADMIN')throw new ForbiddenError('Only Tenant IT can designate the home organization');
}
/** Caller holds EXCLUSIVE tenant barrier and fresh authorization before replay. */
export async function designateHomeOrganization(db:DbClient,auth:AuthContext,input:{companyId:UUID;expectedCompanyId:UUID|null;confirmed:true}) {
 await authorizeHomeOrganization(db,auth);
 const tenant=(await db.query<{homeCompanyId:UUID|null}>('SELECT home_company_id AS "homeCompanyId" FROM tenants WHERE id=$1 FOR UPDATE',[auth.tenantId])).rows[0];
 if(!tenant)throw new NotFoundError('Tenant not found');
 if(tenant.homeCompanyId!==input.expectedCompanyId)throw new ConflictError('The home organization changed. Reload and review the current designation.');
 const company=(await db.query<{id:UUID;name:string;type:string}>("SELECT id,name,type FROM companies WHERE tenant_id=$1 AND id=$2 AND type IN ('GC','OWNER_REP')",[auth.tenantId,input.companyId])).rows[0];
 if(!company)throw new NotFoundError('Eligible internal company not found');
 if(tenant.homeCompanyId!==company.id){
  await db.query('UPDATE tenants SET home_company_id=$2 WHERE id=$1',[auth.tenantId,company.id]);
  await appendAdministrativeEvent(db,{auth,projectId:null,subjectUserId:null,eventType:'tenant.home_organization_changed',authorityEvidence:{actorRole:'TENANT_ADMIN'},changes:{previousCompanyId:tenant.homeCompanyId,companyId:company.id}});
 }
 return {company};
}
