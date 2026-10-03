import type {DbClient,UUID} from '@/shared/types';
import {ConflictError,NotFoundError,ValidationError} from '@/shared/errors';
import {acquireTenantLifecycleLock} from '@/lib/tenant-lifecycle-lock';
import {appendAdministrativeEvent} from '@/modules/audit/infrastructure/administrative-event.repository';

/** Controlled Axiom acquisition/support tooling only. No authenticated web route calls this writer. */
export async function bindAcquiredHomeOrganization(db:DbClient,input:{tenantId:UUID;companyId:UUID;expectedCompanyId:UUID|null;caseReference:string}) {
 if(!input.caseReference.trim()||input.caseReference.length>200)throw new ValidationError('An acquisition or support case reference is required');
 await acquireTenantLifecycleLock(db,input.tenantId,'EXCLUSIVE');
 const tenant=(await db.query<{homeCompanyId:UUID|null}>('SELECT home_company_id AS "homeCompanyId" FROM tenants WHERE id=$1',[input.tenantId])).rows[0];
 if(!tenant)throw new NotFoundError('Tenant not found');
 if(tenant.homeCompanyId!==input.expectedCompanyId)throw new ConflictError('Account binding changed. Review the acquisition record before retrying.');
 const company=(await db.query<{id:UUID;name:string;type:string}>("SELECT id,name,type FROM companies WHERE tenant_id=$1 AND id=$2 AND type IN ('GC','OWNER_REP')",[input.tenantId,input.companyId])).rows[0];
 if(!company)throw new NotFoundError('Acquired internal company not found in this tenant');
 if(tenant.homeCompanyId!==company.id){
  await db.query('UPDATE tenants SET home_company_id=$2 WHERE id=$1',[input.tenantId,company.id]);
  await appendAdministrativeEvent(db,{auth:{tenantId:input.tenantId,userId:null},projectId:null,subjectUserId:null,eventType:'tenant.home_organization_changed',authorityEvidence:{operator:'AXIOM_SUPPORT',caseReference:input.caseReference.trim()},changes:{previousCompanyId:tenant.homeCompanyId,companyId:company.id}});
 }
 return {company};
}
